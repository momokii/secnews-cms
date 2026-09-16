import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { DEFAULT_PROMPTS } from "../src/modules/ai/prompt-template.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket } from "./helpers.js";

const OPENAI_KEY = "sk-prompt-suite-abcdef123456";
const FILL_TITLE = "Prompt suite ticket";

/** Stub the provider wire, capturing each request's user-role prompt text. */
function captureUserPrompts(): string[] {
  const prompts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages?: Array<{ role: string; content: string }> };
      const user = body.messages?.find((message) => message.role === "user");
      prompts.push(user?.content ?? "");
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ fields: { overview: "AI overview" } }) } }] }),
        { status: 200 },
      );
    }),
  );
  return prompts;
}

/** Reset both kinds to the migration-seeded defaults. */
async function reseedDefaults(): Promise<void> {
  for (const kind of ["FILL", "ENRICH"] as const) {
    await prisma.promptTemplate.upsert({
      where: { kind },
      update: { content: DEFAULT_PROMPTS[kind] },
      create: { kind, content: DEFAULT_PROMPTS[kind] },
    });
  }
}

/** A fixture ticket with a known title, one IOC and one source. */
async function createKnownTicket(): Promise<string> {
  const ticketId = await createTestTicket();
  await prisma.ticket.update({ where: { id: ticketId }, data: { title: FILL_TITLE } });
  await prisma.ioc.create({ data: { ticketId, type: "DOMAIN", value: "evil.com" } });
  await prisma.ticketSource.create({ data: { ticketId, url: "https://src.example/a" } });
  return ticketId;
}

describe("TASK-PROMPT prompt template management (fill/enrich)", () => {
  let app: FastifyInstance;
  let admin = "";
  let editor = "";
  let analyst = "";

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
    editor = await bearerFor(app, "EDITOR");
    analyst = await bearerFor(app, "ANALYST");
    await reseedDefaults();
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
    await reseedDefaults();
    await prisma.integrationConfig.deleteMany({ where: { kind: "OPENAI" } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("GET /prompts serves both kinds with content, updatedAt and the placeholder legend", async () => {
    // Given: the migration-seeded default rows
    // When: any authenticated role reads the templates
    const res = await app.inject({ method: "GET", url: "/prompts", headers: { authorization: analyst } });

    // Then: one item per kind, default content, and the placeholder legend
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ kind: string; content: string; updatedAt: string | null; placeholders: Array<{ name: string }> }>;
    expect(items.map((item) => item.kind)).toEqual(["FILL", "ENRICH", "SOURCE_DRAFT"]);
    for (const item of items) {
      expect(item.content).toContain("Ticket context:");
      expect(item.content).toContain("{{ticketContext}}");
      expect(item.updatedAt === null || typeof item.updatedAt === "string").toBe(true);
    }
    expect(items[0]?.placeholders.map((placeholder) => placeholder.name)).toEqual([
      "ticketContext",
      "missingFields",
      "currentFields",
      "title",
      "summary",
      "findingType",
      "tlp",
      "iocs",
      "sources",
      "selectedSources",
      "targetFields",
      "overview",
      "description",
      "recommendations",
      "references",
      "cveIds",
      "affectedVersions",
      "mitigation",
    ]);
  });

  it("RBAC: PUT is ADMIN-only; GET requires authentication; PUT validates kind and non-empty content", async () => {
    // When: an EDITOR PUTs, an anonymous caller GETs, and ADMIN sends bad bodies
    const putByEditor = await app.inject({
      method: "PUT",
      url: "/prompts/FILL",
      headers: { authorization: editor },
      payload: { content: "nope" },
    });
    const anonGet = await app.inject({ method: "GET", url: "/prompts" });
    const emptyContent = await app.inject({
      method: "PUT",
      url: "/prompts/FILL",
      headers: { authorization: admin },
      payload: { content: "" },
    });
    const unknownKind = await app.inject({
      method: "PUT",
      url: "/prompts/NEITHER",
      headers: { authorization: admin },
      payload: { content: "text" },
    });

    // Then: 403 / 401 / 400 / 400
    expect(putByEditor.statusCode).toBe(403);
    expect(anonGet.statusCode).toBe(401);
    expect(emptyContent.statusCode).toBe(400);
    expect(unknownKind.statusCode).toBe(400);
  });

  it("PUT /prompts/:kind persists ADMIN content and GET returns it verbatim", async () => {
    // Given: a custom ENRICH template
    try {
      // When: the ADMIN stores it and reads it back
      const put = await app.inject({
        method: "PUT",
        url: "/prompts/ENRICH",
        headers: { authorization: admin },
        payload: { content: "Custom enrich {{currentFields}} end" },
      });
      const get = await app.inject({ method: "GET", url: "/prompts", headers: { authorization: admin } });

      // Then: the stored content round-trips
      expect(put.statusCode).toBe(200);
      const items = get.json() as Array<{ kind: string; content: string }>;
      expect(items.find((item) => item.kind === "ENRICH")?.content).toBe("Custom enrich {{currentFields}} end");
    } finally {
      await reseedDefaults();
    }
  });

  it("a custom FILL template reaches the provider payload with placeholders substituted", async () => {
    // Given: an ADMIN-stored fill template with a marker and the context placeholder
    const ticketId = await createKnownTicket();
    try {
      await app.inject({
        method: "PUT",
        url: "/prompts/FILL",
        headers: { authorization: admin },
        payload: { content: "PROMPTTEST-MARKER\n{{ticketContext}}\nAnswer JSON only." },
      });

      // When: AI fill runs
      const prompts = captureUserPrompts();
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/ai/fill`,
        headers: { authorization: editor },
        payload: {},
      });

      // Then: the provider receives the custom text with ticket data injected
      expect(res.statusCode).toBe(200);
      expect(prompts[0]).toContain("PROMPTTEST-MARKER");
      expect(prompts[0]).toContain(`title: ${FILL_TITLE}`);
      expect(prompts[0]).not.toContain("{{");
    } finally {
      await cleanupTicket(ticketId);
      await reseedDefaults();
    }
  });

  it("a missing row falls back to the built-in default for GET and the provider payload", async () => {
    // Given: the FILL row is deleted (built-in default must take over)
    const ticketId = await createKnownTicket();
    try {
      await prisma.promptTemplate.deleteMany({ where: { kind: "FILL" } });

      // When: GET reads the templates and AI fill runs
      const get = await app.inject({ method: "GET", url: "/prompts", headers: { authorization: editor } });
      const prompts = captureUserPrompts();
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/ai/fill`,
        headers: { authorization: editor },
        payload: {},
      });

      // Then: GET serves the built-in default (updatedAt null — never edited)
      expect(res.statusCode).toBe(200);
      expect(get.statusCode).toBe(200);
      const items = get.json() as Array<{ kind: string; content: string; updatedAt: string | null }>;
      const fill = items.find((item) => item.kind === "FILL");
      expect(fill?.content).toBe(DEFAULT_PROMPTS.FILL);
      expect(fill?.updatedAt).toBeNull();

      // And: the provider payload is the built-in default rendered
       expect(prompts[0]).toContain("Never invent IOCs, CVE IDs, product versions");
    } finally {
      await cleanupTicket(ticketId);
      await reseedDefaults();
    }
  });

  it("seeded default FILL template includes the security drafting contract", async () => {
    // Given: the seeded FILL row and a ticket with IOC + source context lines
    const ticketId = await createKnownTicket();
    try {
      // When: AI fill runs with the default template
      const prompts = captureUserPrompts();
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/ai/fill`,
        headers: { authorization: editor },
        payload: {},
      });

      // Then: the prompt includes the current security drafting contract
      expect(res.statusCode).toBe(200);
      expect(prompts[0]).toContain("Overview, Description, IOC, Recommendations, References");
      expect(prompts[0]).toContain("Defang every IOC");
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("granular placeholders render ticket data into the provider payload", async () => {
    // Given: an ADMIN-stored fill template using every granular placeholder
    const ticketId = await createKnownTicket();
    try {
      await app.inject({
        method: "PUT",
        url: "/prompts/FILL",
        headers: { authorization: admin },
        payload: {
          content: [
            "GRAN-TEST",
            "title={{title}} summary={{summary}} findingType={{findingType}} tlp={{tlp}}",
            "iocs={{iocs}} sources={{sources}}",
            "overview={{overview}} description={{description}} recommendations={{recommendations}}",
            "references={{references}} cveIds={{cveIds}} affectedVersions={{affectedVersions}} mitigation={{mitigation}}",
            "Answer JSON only.",
          ].join("\n"),
        },
      });

      // When: AI fill runs
      const prompts = captureUserPrompts();
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/ai/fill`,
        headers: { authorization: editor },
        payload: {},
      });

      // Then: each granular placeholder is substituted with ticket data —
      // headers verbatim, evidence lists, unset finals as empty strings
      expect(res.statusCode).toBe(200);
      expect(prompts[0]).toContain("GRAN-TEST");
      expect(prompts[0]).toContain(`title=${FILL_TITLE}`);
      expect(prompts[0]).toContain("summary=Adversaries brute-forcing public SSH endpoints.");
      expect(prompts[0]).toContain("findingType=OTHER");
      expect(prompts[0]).toContain("tlp=AMBER");
      expect(prompts[0]).toContain("iocs=DOMAIN:evil.com");
      expect(prompts[0]).toContain("sources=https://src.example/a");
      expect(prompts[0]).toContain("overview=");
      expect(prompts[0]).toContain("cveIds=");
      expect(prompts[0]).toContain("mitigation=");
      expect(prompts[0]).not.toContain("{{");
    } finally {
      await cleanupTicket(ticketId);
      await reseedDefaults();
    }
  });
});
