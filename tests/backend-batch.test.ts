import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { DEFAULT_PROMPTS } from "../src/modules/ai/prompt-template.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket } from "./helpers.js";

describe("backend batch regressions", () => {
  let app: FastifyInstance;
  let admin = "";

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
    await app.inject({
      method: "PUT",
      url: "/integrations/OTX",
      headers: { authorization: admin },
      payload: { apiKey: "batch-otx-key" },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await prisma.integrationConfig.deleteMany({ where: { kind: "OTX" } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("records both send attempts from SENT", async () => {
    // Given: a SENT ticket and one active WhatsApp channel
    const client = await prisma.client.create({ data: { name: "batch-send-client" } });
    const channel = await prisma.channel.create({
      data: {
        clientId: client.id,
        type: "WHATSAPP",
        target: JSON.stringify({ chatId: "batch@g.us" }),
      },
    });
    const ticketId = await createTestTicket();
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "SENT" } });
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));

    try {
      // When: the same send action is attempted twice
      const request = () =>
        app.inject({
          method: "POST",
          url: `/tickets/${ticketId}/send`,
          headers: { authorization: admin },
          payload: { channelIds: [channel.id] },
        });
      const first = await request();
      const second = await request();

      // Then: both attempts succeed and remain separately auditable
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(await prisma.deliveryAudit.count({ where: { ticketId } })).toBe(2);
      expect(await prisma.ticketActivity.count({ where: { ticketId, action: "SENT" } })).toBe(2);
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe("SENT");
    } finally {
      await prisma.deliveryAudit.deleteMany({ where: { ticketId } });
      await prisma.ticketActivity.deleteMany({ where: { ticketId } });
      await prisma.channel.delete({ where: { id: channel.id } });
      await prisma.client.delete({ where: { id: client.id } });
      await cleanupTicket(ticketId);
    }
  });

  it("appends prompt revisions and paginates newest first", async () => {
    // Given: the built-in prompt and an authenticated administrator
    await prisma.promptRevision.deleteMany({ where: { promptKind: "FILL" } });
    const firstContent = `${DEFAULT_PROMPTS.FILL}\nversion-one`;
    const secondContent = `${DEFAULT_PROMPTS.FILL}\nversion-two`;

    // When: the administrator saves two revisions and requests page two
    const first = await app.inject({
      method: "PUT",
      url: "/prompts/FILL",
      headers: { authorization: admin },
      payload: { content: firstContent },
    });
    const second = await app.inject({
      method: "PUT",
      url: "/prompts/FILL",
      headers: { authorization: admin },
      payload: { content: secondContent },
    });
    const history = await app.inject({
      method: "GET",
      url: "/prompts/FILL/history?page=2&pageSize=1",
      headers: { authorization: admin },
    });

    // Then: both revisions exist, newest first, and pagination is stable
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(history.json().items[0].content).toBe(firstContent);
  });

  it("updates the existing OTX pulse when a SENT ticket is re-pushed", async () => {
    // Given: a ticket first pushed from READY, then left in SENT
    const ticketId = await createTestTicket({ overview: "Evidence" });
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "READY" } });
    await prisma.ioc.create({ data: { ticketId, type: "DOMAIN", value: "example.com" } });
    const pulseUrl = "https://otx.alienvault.com/api/v1/pulses/pulse-batch";
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      const method = init?.method ?? "GET";
      if (method === "POST") return new Response(JSON.stringify({ id: "pulse-batch" }), { status: 200 });
      if (method === "GET") {
        return new Response(
          JSON.stringify({
            id: "pulse-batch",
            name: "ticket",
            description: "Evidence",
            public: false,
            TLP: "AMBER",
            tags: ["secnews", "TLP:AMBER"],
            references: [],
            indicators: [],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });

    try {
      // When: it is created from READY, moved to SENT, and pushed again
      const first = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      });
      await prisma.ticket.update({ where: { id: ticketId }, data: { status: "SENT" } });
      const second = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      });

      // Then: the second action PATCHes the same pulse and status remains SENT
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(calls).toContain(`PATCH ${pulseUrl}`);
      expect(calls.filter((call) => call.startsWith("POST"))).toHaveLength(1);
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe("SENT");
      expect(await prisma.ticketActivity.count({ where: { ticketId, action: "OTX_PUSHED" } })).toBe(2);
    } finally {
      await prisma.ticketActivity.deleteMany({ where: { ticketId } });
      await cleanupTicket(ticketId);
    }
  });

  it("rewritten defaults preserve the analyst output contract", () => {
    // Given: built-in security-intelligence drafting prompts
    // When: either default is inspected
    const content = `${DEFAULT_PROMPTS.FILL}\n${DEFAULT_PROMPTS.ENRICH}`;

    // Then: the shared contract and safety rules are explicit
    expect(content).toContain("Overview");
    expect(content).toContain("Description");
    expect(content).toContain("IOC");
    expect(content).toContain("Recommendations");
    expect(content).toContain("References");
    expect(content).toMatch(/defang/i);
    expect(content).toMatch(/never invent/i);
    expect(content).toMatch(/sign-off/i);
  });
});
