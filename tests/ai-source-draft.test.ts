import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket } from "./helpers.js";

const OPENAI_KEY = "sk-source-draft-suite-abcdef123456";

/** Provider JSON payload served by the stubbed fetch (OpenAI chat shape). */
function openAiReply(fields: Record<string, string>): unknown {
  return { choices: [{ message: { content: JSON.stringify({ fields }) } }] };
}

/** Stub the provider wire, capturing each request's user-role prompt text. */
function captureUserPrompts(fields: Record<string, string>): string[] {
  const prompts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages?: Array<{ role: string; content: string }> };
      const user = body.messages?.find((message) => message.role === "user");
      prompts.push(user?.content ?? "");
      return new Response(JSON.stringify(openAiReply(fields)), { status: 200 });
    }),
  );
  return prompts;
}

/** A ticket with three distinct sources: two grounded evidence sources and
 * one internal-notes source that must never leak into a grounded draft. */
async function createTicketWithSources(): Promise<{ ticketId: string; sourceIds: [string, string, string] }> {
  const ticketId = await createTestTicket();
  const a = await prisma.ticketSource.create({
    data: { ticketId, title: "Vendor advisory A", url: "https://advisory.example/a", notes: "RCE in the import parser, CVSS 9.8." },
  });
  const b = await prisma.ticketSource.create({
    data: { ticketId, title: "Threat report B", url: "https://report.example/b", notes: "Campaign targets SSH endpoints since March." },
  });
  const c = await prisma.ticketSource.create({
    data: { ticketId, title: "Internal notes C", notes: "Unconfirmed chatter — must not reach the draft." },
  });
  return { ticketId, sourceIds: [a.id, b.id, c.id] };
}

describe("TASK-SRC-DRAFT POST /tickets/:id/ai/source-draft (grounded drafting on chosen sources)", () => {
  let app: FastifyInstance;
  let editor = "";
  let admin = "";

  beforeAll(async () => {
    app = await buildApp();
    editor = await bearerFor(app, "EDITOR");
    admin = await bearerFor(app, "ADMIN");
    await app.inject({
      method: "PUT",
      url: "/integrations/OPENAI",
      headers: { authorization: admin },
      payload: { apiKey: OPENAI_KEY, model: "gpt-4o-mini" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.promptTemplate.deleteMany({ where: { kind: "SOURCE_DRAFT" } });
    await prisma.aiSuggestion.deleteMany({});
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: ["OPENAI", "ANTHROPIC", "GEMINI"] } } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("SD-01: drafts only the requested fields from the chosen sources, stored as PENDING with provider/model", async () => {
    // Given: a ticket with three sources; the analyst picks two of them and
    // the overview + references fields; the model also over-eagerly returns cveIds
    const { ticketId, sourceIds } = await createTicketWithSources();
    const prompts = captureUserPrompts({
      overview: "Grounded overview of the RCE.",
      references: "https://advisory.example/a\nhttps://report.example/b",
      cveIds: "CVE-2026-99999",
    });

    // When: the source-draft runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/source-draft`,
      headers: { authorization: editor },
      payload: { sourceIds: [sourceIds[0], sourceIds[1]], targetFields: ["overview", "references"] },
    });

    // Then: only the requested fields materialize as PENDING rows carrying provider + model
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      suggestions: Array<{ field: string; status: string; provider: string | null; model: string | null; suggestedValue: string }>;
    };
    expect(body.suggestions.map((s) => s.field)).toEqual(["overview", "references"]);
    for (const suggestion of body.suggestions) {
      expect(suggestion.status).toBe("PENDING");
      expect(suggestion.provider).toBe("OPENAI");
      expect(suggestion.model).toBe("gpt-4o-mini");
    }
    expect(res.body).not.toContain(OPENAI_KEY);

    // And: the prompt contained exactly the chosen sources' title/url/notes — not the third source
    expect(prompts[0]).toContain("Vendor advisory A");
    expect(prompts[0]).toContain("https://advisory.example/a");
    expect(prompts[0]).toContain("RCE in the import parser");
    expect(prompts[0]).toContain("Threat report B");
    expect(prompts[0]).toContain("https://report.example/b");
    expect(prompts[0]).not.toContain("Internal notes C");

    // And: rows persisted PENDING, the ticket itself untouched, activity recorded
    const stored = await prisma.aiSuggestion.findMany({ where: { ticketId } });
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      expect(row.status).toBe("PENDING");
    }
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.overview).toBeNull();
    const activity = await prisma.ticketActivity.findFirst({ where: { ticketId, action: "AI_SOURCE_DRAFT" } });
    expect(activity).not.toBeNull();
    await cleanupTicket(ticketId);
  });

  it("SD-02: a sourceId that belongs to another ticket is 404 NOT_FOUND", async () => {
    // Given: two tickets, each with its own source
    const { ticketId, sourceIds } = await createTicketWithSources();
    const otherTicketId = await createTestTicket();
    const foreign = await prisma.ticketSource.create({ data: { ticketId: otherTicketId, title: "Foreign source" } });

    // When: the source-draft references the foreign source id
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/source-draft`,
      headers: { authorization: editor },
      payload: { sourceIds: [sourceIds[0], foreign.id], targetFields: ["overview"] },
    });

    // Then: not found, nothing generated or stored
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
    expect(await prisma.aiSuggestion.count({ where: { ticketId } })).toBe(0);
    await cleanupTicket(ticketId);
    await cleanupTicket(otherTicketId);
  });

  it("SD-03: empty targetFields is 400 VALIDATION", async () => {
    // Given: a valid sourceIds list but an empty targetFields array
    const { ticketId, sourceIds } = await createTicketWithSources();

    // When: the source-draft runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/source-draft`,
      headers: { authorization: editor },
      payload: { sourceIds: [sourceIds[0]], targetFields: [] },
    });

    // Then: rejected by the body schema
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    await cleanupTicket(ticketId);
  });

  it("SD-04: fields outside overview/description/recommendations/references are 400 (not draftable in this mode)", async () => {
    // Given: a request asking for cveIds — the typed working fields are out of scope
    const { ticketId, sourceIds } = await createTicketWithSources();

    // When: the source-draft runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/source-draft`,
      headers: { authorization: editor },
      payload: { sourceIds: [sourceIds[0]], targetFields: ["overview", "cveIds"] },
    });

    // Then: rejected by the body schema
    expect(res.statusCode).toBe(400);
    await cleanupTicket(ticketId);
  });

  it("SD-05: empty sourceIds is 400 VALIDATION", async () => {
    // Given: a ticket and an empty sourceIds array
    const ticketId = await createTestTicket();

    // When: the source-draft runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/source-draft`,
      headers: { authorization: editor },
      payload: { sourceIds: [], targetFields: ["overview"] },
    });

    // Then: rejected by the body schema
    expect(res.statusCode).toBe(400);
    await cleanupTicket(ticketId);
  });

  it("SD-06: allowWebSearch with references requested augments the prompt with a references-only web-search instruction", async () => {
    // Given: allowWebSearch enabled and references among the target fields
    const { ticketId, sourceIds } = await createTicketWithSources();
    const prompts = captureUserPrompts({ references: "https://advisory.example/a" });

    // When: the source-draft runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/source-draft`,
      headers: { authorization: editor },
      payload: { sourceIds: [sourceIds[0]], targetFields: ["references"], allowWebSearch: true },
    });

    // Then: the prompt carries the web-search augmentation scoped to references only
    expect(res.statusCode).toBe(200);
    expect(prompts[0]).toContain("online web search");
    expect(prompts[0]).toContain("references");
    await cleanupTicket(ticketId);
  });

  it("SD-07: allowWebSearch without references requested adds no web-search instruction", async () => {
    // Given: allowWebSearch enabled but only overview requested
    const { ticketId, sourceIds } = await createTicketWithSources();
    const prompts = captureUserPrompts({ overview: "Grounded overview." });

    // When: the source-draft runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/source-draft`,
      headers: { authorization: editor },
      payload: { sourceIds: [sourceIds[0]], targetFields: ["overview"], allowWebSearch: true },
    });

    // Then: no augmentation — the draft stays strictly source-grounded
    expect(res.statusCode).toBe(200);
    expect(prompts[0]).not.toContain("online web search");
    await cleanupTicket(ticketId);
  });

  it("SD-08: default (allowWebSearch omitted) never mentions web search even when references are requested", async () => {
    // Given: the flag omitted with references requested
    const { ticketId, sourceIds } = await createTicketWithSources();
    const prompts = captureUserPrompts({ references: "https://advisory.example/a" });

    // When: the source-draft runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/source-draft`,
      headers: { authorization: editor },
      payload: { sourceIds: [sourceIds[0]], targetFields: ["references"] },
    });

    // Then: grounded-only behavior, no browsing hint
    expect(res.statusCode).toBe(200);
    expect(prompts[0]).not.toContain("online web search");
    await cleanupTicket(ticketId);
  });

  it("SD-09: the ADMIN-edited SOURCE_DRAFT template is rendered with selectedSources, targetFields and ticketContext", async () => {
    // Given: a custom SOURCE_DRAFT template stored via PUT /prompts/SOURCE_DRAFT
    const { ticketId, sourceIds } = await createTicketWithSources();
    try {
      const put = await app.inject({
        method: "PUT",
        url: "/prompts/SOURCE_DRAFT",
        headers: { authorization: admin },
        payload: {
          content: "SD-MARKER\nsources={{selectedSources}}\nfields={{targetFields}}\nctx={{ticketContext}}\nAnswer JSON only.",
        },
      });
      expect(put.statusCode).toBe(200);
      const prompts = captureUserPrompts({ overview: "Grounded overview." });

      // When: the source-draft runs
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/ai/source-draft`,
        headers: { authorization: editor },
        payload: { sourceIds: [sourceIds[1]], targetFields: ["overview"] },
      });

      // Then: every placeholder is substituted with real data and nothing is left unrendered
      expect(res.statusCode).toBe(200);
      expect(prompts[0]).toContain("SD-MARKER");
      expect(prompts[0]).toContain("Threat report B");
      expect(prompts[0]).toContain("https://report.example/b");
      expect(prompts[0]).toContain("fields=overview");
      expect(prompts[0]).toContain(`ctx=title: C4 fixture`);
      expect(prompts[0]).not.toContain("{{");
    } finally {
      await cleanupTicket(ticketId);
      await prisma.promptTemplate.deleteMany({ where: { kind: "SOURCE_DRAFT" } });
    }
  });

  it("SD-10: unknown ticket id is 404 NOT_FOUND", async () => {
    // Given: a well-formed but unknown uuid
    // When: source-draft targets it
    const res = await app.inject({
      method: "POST",
      url: "/tickets/00000000-0000-4000-8000-000000000000/ai/source-draft",
      headers: { authorization: editor },
      payload: { sourceIds: ["00000000-0000-4000-8000-000000000001"], targetFields: ["overview"] },
    });
    // Then: not found
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });
});
