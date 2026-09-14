import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket } from "./helpers.js";

const OPENAI_KEY = "sk-fill-suite-abcdef123456";

/** Provider JSON payload served by the stubbed fetch (OpenAI chat shape). */
function openAiReply(fields: Record<string, string>): unknown {
  return { choices: [{ message: { content: JSON.stringify({ fields }) } }] };
}

describe("TASK-C4 AI fill/enrich (PENDING suggestions, final fields untouched)", () => {
  let app: FastifyInstance;
  let editor = "";

  beforeAll(async () => {
    app = await buildApp();
    editor = await bearerFor(app, "EDITOR");
    // Configure through the real surface so the stored blob is well-formed.
    await app.inject({
      method: "PUT",
      url: "/integrations/OPENAI",
      headers: { authorization: await bearerFor(app, "ADMIN") },
      payload: { apiKey: OPENAI_KEY, model: "gpt-4o-mini" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.aiSuggestion.deleteMany({});
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: ["OPENAI", "ANTHROPIC", "GEMINI", "OTX"] } } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("AI-01: strict fill suggests ONLY missing final fields as PENDING rows; existing fields untouched", async () => {
    // Given: a ticket whose overview is already final and a model that over-eagerly rewrites it
    const ticketId = await createTestTicket({ overview: "Existing overview", description: null });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(openAiReply({
      overview: "AI rewritten overview",
      description: "AI drafted description",
    })), { status: 200 }));

    // When: the strict fill runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/fill`,
      headers: { authorization: editor },
      payload: {},
    });

    // Then: only the missing field is suggested; the filled field survives verbatim; rows are PENDING
    expect(res.statusCode).toBe(200);
    const body = res.json() as { suggestions: Array<{ field: string; status: string; suggestedValue: string }> };
    expect(body.suggestions.map((s) => s.field)).toEqual(["description"]);
    expect(body.suggestions[0]?.status).toBe("PENDING");
    expect(body.suggestions[0]?.suggestedValue).toBe("AI drafted description");

    const stored = await prisma.aiSuggestion.findMany({ where: { ticketId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe("PENDING");

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.overview).toBe("Existing overview");
    expect(ticket.description).toBeNull();
    expect(res.body).not.toContain(OPENAI_KEY);
    await cleanupTicket(ticketId);
  });

  it("fill never invents the §10-optional recommendations/references", async () => {
// Given: a ticket whose required fields are filled but recs/refs empty,
// and a model that eagerly drafts all four
const ticketId = await createTestTicket({
  overview: "Existing overview",
  description: "Existing description",
});
vi.stubGlobal("fetch", async () => new Response(JSON.stringify(openAiReply({
  overview: "AI rewritten overview",
  description: "AI rewritten description",
  recommendations: "AI invented recommendations",
  references: "https://invented.example/advisory",
})), { status: 200 }));

// When: the strict fill runs
const res = await app.inject({
  method: "POST",
  url: `/tickets/${ticketId}/ai/fill`,
  headers: { authorization: editor },
  payload: {},
});

// Then: zero suggestions — empty optional fields stay empty
expect(res.statusCode).toBe(200);
const body = res.json() as { suggestions: unknown[] };
expect(body.suggestions).toEqual([]);
const stored = await prisma.aiSuggestion.findMany({ where: { ticketId } });
expect(stored).toHaveLength(0);
await cleanupTicket(ticketId);
});

it("AI-02: enrich proposes full rewrites including filled fields, carrying currentValue", async () => {
    // Given: the same half-filled ticket, enrich mode
    const ticketId = await createTestTicket({ overview: "Existing overview", description: null });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(openAiReply({
      overview: "AI rewritten overview",
      description: "AI drafted description",
    })), { status: 200 }));

    // When: the enrich runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/enrich`,
      headers: { authorization: editor },
      payload: {},
    });

    // Then: every returned field is a PENDING suggestion with its current value attached
    expect(res.statusCode).toBe(200);
    const body = res.json() as { suggestions: Array<{ field: string; currentValue: string | null; status: string }> };
    const byField = new Map(body.suggestions.map((s) => [s.field, s]));
    expect(byField.get("overview")).toMatchObject({ status: "PENDING", currentValue: "Existing overview" });
    expect(byField.get("description")).toMatchObject({ status: "PENDING", currentValue: null });

    // And: the ticket itself is still untouched
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.overview).toBe("Existing overview");
    await cleanupTicket(ticketId);
  });

  it("fill without any configured AI provider is a 422 VALIDATION", async () => {
    // Given: no provider kind holds a key
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: ["OPENAI", "ANTHROPIC", "GEMINI"] } } });
    const ticketId = await createTestTicket();

    // When: fill runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/fill`,
      headers: { authorization: editor },
      payload: {},
    });

    // Then: semantic rejection, not a crash
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    await cleanupTicket(ticketId);
  });

  it("unparseable model output is a 422 VALIDATION, never a 500", async () => {
    // Given: an upstream that answers with prose instead of JSON
    const ticketId = await createTestTicket();
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ choices: [{ message: { content: "sorry, I cannot" } }] }), { status: 200 }),
    );

    // When: fill runs against it
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/fill`,
      headers: { authorization: editor },
      payload: {},
    });

    // Then: 422 VALIDATION
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    await cleanupTicket(ticketId);
  });

  it("unknown ticket id is 404 NOT_FOUND", async () => {
    // Given: a well-formed but unknown uuid
    // When: fill targets it
    const res = await app.inject({
      method: "POST",
      url: "/tickets/00000000-0000-4000-8000-000000000000/ai/fill",
      headers: { authorization: editor },
      payload: {},
    });
    // Then: not found
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });
});
