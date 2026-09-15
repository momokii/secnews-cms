import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket } from "./helpers.js";

/**
 * TASK-VALID upstream error detail: OTX push pre-check (422 naming culprits,
 * no partial push) and 502 envelopes that carry the truncated upstream body
 * for OTX + AI callers — never the API key (keys travel in headers only).
 */

const OTX_KEY = "task-valid-otx-key-4242";
const OPENAI_KEY = "sk-task-valid-openai-key";

describe("TASK-VALID OTX push pre-check + upstream body detail", () => {
  let app: FastifyInstance;
  let admin = "";

  type FetchCall = { url: string; init: RequestInit };

  function stubFetch(status: number, payload: unknown): { calls: FetchCall[] } {
    const calls: FetchCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify(payload), { status });
      }),
    );
    return { calls };
  }

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
    await prisma.integrationConfig.deleteMany({ where: { kind: "OTX" } });
    const put = await app.inject({
      method: "PUT",
      url: "/integrations/OTX",
      headers: { authorization: admin },
      payload: { apiKey: OTX_KEY },
    });
    expect(put.statusCode).toBe(200);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.integrationConfig.deleteMany({ where: { kind: "OTX" } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("push with an invalid stored IOC answers 422 naming the culprit and never calls OTX", async () => {
    // Given: a READY ticket whose included IOC is the incident row
    // (IPv4 literal stored as IPV6 — written directly to simulate legacy data)
    const ticketId = await createTestTicket({
      overview: "o",
      description: "d",
      recommendations: "r",
      references: ["https://example.com/x"],
    });
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "READY" } });
    await prisma.ioc.create({ data: { ticketId, type: "IPV6", value: "184.154.245.42" } });

    // When: the ticket is pushed
    const { calls } = stubFetch(200, { id: "never" });
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/otx`,
      headers: { authorization: admin },
      payload: {},
    });

    // Then: 422 VALIDATION listing the culprit, no upstream call, no pulse stored
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: { code: string; details?: { iocs: Array<{ value: string }> } } };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details?.iocs.some((ioc) => ioc.value === "184.154.245.42")).toBe(true);
    expect(calls).toHaveLength(0);
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(row.otxPulseId).toBeNull();
    await cleanupTicket(ticketId);
  });

  it("OTX upstream failure on push is 502 with the truncated body in details and never the key", async () => {
    // Given: a READY ticket with a valid included IOC and an upstream 400
    const ticketId = await createTestTicket({
      overview: "o",
      description: "d",
      recommendations: "r",
      references: ["https://example.com/x"],
    });
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "READY" } });
    await prisma.ioc.create({ data: { ticketId, type: "DOMAIN", value: "evil.com" } });

    // When: OTX rejects the pulse with a diagnostic body
    const { calls } = stubFetch(400, { detail: "Invalid indicator: bad IP format" });
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/otx`,
      headers: { authorization: admin },
      payload: {},
    });

    // Then: 502 envelope whose details carry the upstream status + body snippet,
    // the key never appears anywhere in the response
    expect(res.statusCode).toBe(502);
    const body = res.json() as {
      error: { code: string; details?: { upstreamStatus?: number; upstreamBody?: string } };
    };
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.details?.upstreamStatus).toBe(400);
    expect(body.error.details?.upstreamBody).toContain("Invalid indicator: bad IP format");
    expect(res.body).toContain("Invalid indicator: bad IP format");
    expect(res.body).not.toContain(OTX_KEY);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.headers).toMatchObject({ "X-OTX-API-KEY": OTX_KEY });
    await cleanupTicket(ticketId);
  });
});

describe("TASK-VALID AI upstream body detail", () => {
  let app: FastifyInstance;
  let editor = "";

  beforeAll(async () => {
    app = await buildApp();
    editor = await bearerFor(app, "EDITOR");
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: ["OPENAI", "ANTHROPIC", "GEMINI"] } } });
    const admin = await bearerFor(app, "ADMIN");
    const put = await app.inject({
      method: "PUT",
      url: "/integrations/OPENAI",
      headers: { authorization: admin },
      payload: { apiKey: OPENAI_KEY, model: "gpt-4o-mini" },
    });
    expect(put.statusCode).toBe(200);
  });

  afterAll(async () => {
    await prisma.integrationConfig.deleteMany({ where: { kind: { in: ["OPENAI", "ANTHROPIC", "GEMINI"] } } });
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("AI fill upstream failure is 502 with the truncated body in details and never the key", async () => {
    // Given: a ticket and an OpenAI upstream answering 401 with a diagnostic body
    const ticketId = await createTestTicket();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "Incorrect API key provided" } }), { status: 401 }),
      ),
    );

    // When: fill runs
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/ai/fill`,
      headers: { authorization: editor },
      payload: {},
    });

    // Then: 502 envelope whose details carry the upstream status + body snippet,
    // the key never appears anywhere in the response
    expect(res.statusCode).toBe(502);
    const body = res.json() as {
      error: { code: string; details?: { upstreamStatus?: number; upstreamBody?: string } };
    };
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.details?.upstreamStatus).toBe(401);
    expect(body.error.details?.upstreamBody).toContain("Incorrect API key provided");
    expect(res.body).toContain("Incorrect API key provided");
    expect(res.body).not.toContain(OPENAI_KEY);
    await cleanupTicket(ticketId);
  });
});
