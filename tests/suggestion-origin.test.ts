import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { PromptKind } from "../src/generated/prisma/enums.js";
import { storeSuggestions } from "../src/modules/ai/service.js";
import { prisma } from "../src/lib/db.js";
import {
  bearerFor,
  cleanupTicket,
  cleanupUsers,
  createTestSuggestion,
  createTestTicket,
} from "./helpers.js";

const OPENAI_KEY = "sk-origin-suite-abcdef123456";

/** Provider JSON payload served by the stubbed fetch (OpenAI chat shape). */
function openAiReply(fields: Record<string, string>): unknown {
  return { choices: [{ message: { content: JSON.stringify({ fields }) } }] };
}

describe("suggestion origin tagging (assist panels must not show source-draft rows)", () => {
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
    await prisma.aiSuggestion.deleteMany({});
    await prisma.integrationConfig.deleteMany({ where: { kind: "OPENAI" } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("GET list ?origin= returns only rows of the requested origins; no filter returns all", async () => {
    // Given: one assist (FILL) row and one source-draft row on the same ticket
    const ticketId = await createTestTicket();
    const assistId = await createTestSuggestion(
      ticketId,
      { field: "overview", currentValue: null, suggestedValue: "Assist draft" },
      "PENDING",
      "FILL",
    );
    const draftId = await createTestSuggestion(
      ticketId,
      { field: "overview", currentValue: null, suggestedValue: "Source-grounded draft" },
      "PENDING",
      "SOURCE_DRAFT",
    );

    // When: listing without a filter, with origin=SOURCE_DRAFT and with origin=FILL,ENRICH
    const all = await app.inject({
      method: "GET",
      url: `/tickets/${ticketId}/suggestions`,
      headers: { authorization: editor },
    });
    const draft = await app.inject({
      method: "GET",
      url: `/tickets/${ticketId}/suggestions?origin=SOURCE_DRAFT`,
      headers: { authorization: editor },
    });
    const assist = await app.inject({
      method: "GET",
      url: `/tickets/${ticketId}/suggestions?origin=FILL,ENRICH`,
      headers: { authorization: editor },
    });

    // Then: each filter returns exactly its own rows and the wire items carry origin
    expect(all.statusCode).toBe(200);
    const allBody = all.json() as { items: Array<{ id: string; origin: string }>; total: number };
    expect(allBody.total).toBe(2);
    expect(allBody.items.map((item) => item.id).sort()).toEqual([assistId, draftId].sort());

    expect(draft.statusCode).toBe(200);
    const draftBody = draft.json() as { items: Array<{ id: string; origin: string }>; total: number };
    expect(draftBody.total).toBe(1);
    expect(draftBody.items[0]?.id).toBe(draftId);
    expect(draftBody.items[0]?.origin).toBe("SOURCE_DRAFT");

    expect(assist.statusCode).toBe(200);
    const assistBody = assist.json() as { items: Array<{ id: string; origin: string }>; total: number };
    expect(assistBody.total).toBe(1);
    expect(assistBody.items[0]?.id).toBe(assistId);
    expect(assistBody.items[0]?.origin).toBe("FILL");

    await cleanupTicket(ticketId);
  });

  it("POST ai/fill stores and returns rows tagged origin FILL", async () => {
    // Given: a ticket with a missing description and a stubbed provider
    const ticketId = await createTestTicket({ description: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(openAiReply({ description: "Filled description" })), { status: 200 })),
    );

    // When: ai/fill runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/fill`,
      headers: { authorization: editor },
      payload: {},
    });

    // Then: the response and the stored rows carry origin FILL
    expect(res.statusCode).toBe(200);
    const body = res.json() as { suggestions: Array<{ origin: string }> };
    expect(body.suggestions[0]?.origin).toBe("FILL");
    const stored = await prisma.aiSuggestion.findFirstOrThrow({ where: { ticketId } });
    expect(stored.origin).toBe("FILL");
    await cleanupTicket(ticketId);
  });

  it("POST ai/source-draft stores and returns rows tagged origin SOURCE_DRAFT", async () => {
    // Given: a ticket with a source and a stubbed provider
    const ticketId = await createTestTicket();
    const source = await prisma.ticketSource.create({
      data: { ticketId, title: "Vendor advisory", url: "https://advisory.example/a" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(openAiReply({ overview: "Grounded overview." })), { status: 200 })),
    );

    // When: ai/source-draft runs for overview
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/source-draft`,
      headers: { authorization: editor },
      payload: { sourceIds: [source.id], targetFields: ["overview"] },
    });

    // Then: the response and the stored rows carry origin SOURCE_DRAFT
    expect(res.statusCode).toBe(200);
    const body = res.json() as { suggestions: Array<{ origin: string }> };
    expect(body.suggestions[0]?.origin).toBe("SOURCE_DRAFT");
    const stored = await prisma.aiSuggestion.findFirstOrThrow({ where: { ticketId } });
    expect(stored.origin).toBe("SOURCE_DRAFT");
    await cleanupTicket(ticketId);
  });

  it("storeSuggestions persists the given origin on every row", async () => {
    // Given: one draft and the SOURCE_DRAFT origin
    const ticketId = await createTestTicket();

    // When: the drafts are stored through the service
    const rows = await storeSuggestions(
      prisma,
      ticketId,
      [{ field: "overview", currentValue: null, suggestedValue: "Draft text", model: "m", provider: "OPENAI" }],
      PromptKind.SOURCE_DRAFT,
    );

    // Then: every stored row carries the origin it was stored with
    const stored = await prisma.aiSuggestion.findUniqueOrThrow({ where: { id: rows[0]?.id ?? "" } });
    expect(stored.origin).toBe("SOURCE_DRAFT");
    await cleanupTicket(ticketId);
  });
});
