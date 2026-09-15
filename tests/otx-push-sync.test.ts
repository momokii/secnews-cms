import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket } from "./helpers.js";

/**
 * TASK-SYNCDEL — OTX push sync semantics.
 * (a) The pulse description is the ticket OVERVIEW only (title fallback when
 *     the overview is empty) — create AND documented PATCH update paths.
 * (b) PATCH /api/v1/pulses/{id} syncs lists through the documented
 *     {add:[...]} / {remove:[...]} dicts (plain arrays answer 500 upstream):
 *     indicators diff by (indicator,type) — add missing objects, remove the
 *     {id} of stale ones; tags/references diff as string lists with empty ops
 *     omitted; scalars (name/description/public/TLP) always go as literals.
 * The wire is always stubbed — no real OTX traffic in tests.
 */

const OTX_KEY = "5m3jkh-otx-sync-key-1";
const BASE = "https://otx.alienvault.com";
const CREATE_URL = `${BASE}/api/v1/pulses/create`;
const PULSE_ID = "pulse-sync-1";
const PATCH_URL = `${BASE}/api/v1/pulses/${PULSE_ID}`;

type WireRoute = { method: string; url: string; status: number; payload: unknown };
type FetchCall = { url: string; init: RequestInit };

function stubWire(routes: WireRoute[]): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: String(url), init: init ?? {} });
      const hit = routes.find((route) => route.method === method && String(url) === route.url);
      if (hit === undefined) {
        return new Response(JSON.stringify({ detail: `no stub for ${method} ${String(url)}` }), { status: 404 });
      }
      return new Response(JSON.stringify(hit.payload), { status: hit.status });
    }),
  );
  return { calls };
}

async function readyTicket(overview: string | null): Promise<{ ticketId: string; title: string }> {
  const ticketId = await createTestTicket({
    overview,
    description: "Internal narrative kept off the pulse.",
    references: ["https://example.com/advisory"],
  });
  const row = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: "READY", tlp: "AMBER" },
    select: { title: true },
  });
  await prisma.ioc.create({ data: { ticketId, type: "DOMAIN", value: "evil.com" } });
  return { ticketId, title: row.title };
}

async function push(app: FastifyInstance, bearer: string, ticketId: string): Promise<number> {
  const res = await app.inject({
    method: "POST",
    url: `/tickets/${ticketId}/otx`,
    headers: { authorization: bearer },
    payload: {},
  });
  return res.statusCode;
}

describe("TASK-SYNCDEL push description = overview only (create + update)", () => {
  let app: FastifyInstance;
  let admin = "";

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

  it("SYNC-A: create sends description = overview only, never the joined narrative", async () => {
    // Given: a READY ticket whose overview and description differ
    const { ticketId } = await readyTicket("Only overview.");
    const { calls } = stubWire([{ method: "POST", url: CREATE_URL, status: 200, payload: { id: PULSE_ID } }]);
    try {
      // When: it is pushed (first push → create)
      const status = await push(app, admin, ticketId);

      // Then: the create body carries the overview verbatim
      expect(status).toBe(200);
      expect(calls).toHaveLength(1);
      const sent = JSON.parse(String(calls[0]?.init.body)) as { description: string };
      expect(sent.description).toBe("Only overview.");
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("SYNC-B: create falls back to the title when the overview is empty", async () => {
    // Given: a READY ticket with no overview
    const { ticketId, title } = await readyTicket(null);
    const { calls } = stubWire([{ method: "POST", url: CREATE_URL, status: 200, payload: { id: PULSE_ID } }]);
    try {
      // When: it is pushed
      const status = await push(app, admin, ticketId);

      // Then: the description is the title
      expect(status).toBe(200);
      const sent = JSON.parse(String(calls[0]?.init.body)) as { description: string };
      expect(sent.description).toBe(title);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("SYNC-C: the PATCH update path sends description = overview as a literal", async () => {
    // Given: a ticket already pushed once (pulse exists)
    const { ticketId } = await readyTicket("Updated overview.");
    stubWire([
      { method: "POST", url: CREATE_URL, status: 200, payload: { id: PULSE_ID } },
      { method: "GET", url: PATCH_URL, status: 200, payload: { id: PULSE_ID, indicators: [] } },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    expect(await push(app, admin, ticketId)).toBe(200);
    const { calls } = stubWire([
      { method: "GET", url: PATCH_URL, status: 200, payload: { id: PULSE_ID, indicators: [] } },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the same ticket is pushed again
      const status = await push(app, admin, ticketId);

      // Then: the PATCH (not a second create) carries the overview literal
      expect(status).toBe(200);
      const patches = calls.filter((call) => call.init.method === "PATCH");
      expect(patches).toHaveLength(1);
      const patchBody = JSON.parse(String(patches[0]?.init.body)) as { description: string };
      expect(patchBody.description).toBe("Updated overview.");
    } finally {
      await cleanupTicket(ticketId);
    }
  });
});

describe("TASK-SYNCDEL PATCH syncs lists with {add,remove} dicts", () => {
  let app: FastifyInstance;
  let admin = "";

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

  async function pushedTicket(): Promise<{ ticketId: string; title: string }> {
    const fixture = await readyTicket("Adversaries target the sector.");
    await prisma.ioc.create({ data: { ticketId: fixture.ticketId, type: "DOMAIN", value: "fresh.io" } });
    stubWire([{ method: "POST", url: CREATE_URL, status: 200, payload: { id: PULSE_ID } }]);
    expect(await push(app, admin, fixture.ticketId)).toBe(200);
    return fixture;
  }

  it("SYNC-D: changed indicators PATCH {add: missing objects, remove: [{id} of stale]} — no 500", async () => {
    // Given: the live pulse carries evil.com (kept) + stale.net (dropped);
    // the ticket now wants evil.com + fresh.io
    const { ticketId, title } = await pushedTicket();
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: {
          id: PULSE_ID,
          name: title,
          description: "Adversaries target the sector.",
          public: false,
          TLP: "AMBER",
          tags: ["secnews", "TLP:AMBER"],
          references: ["https://example.com/advisory"],
          indicators: [
            { id: "ind-1", indicator: "evil.com", type: "domain" },
            { id: "ind-9", indicator: "stale.net", type: "domain" },
          ],
        },
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the ticket is pushed again
      const status = await push(app, admin, ticketId);

      // Then: exactly one PATCH whose body diffs the indicator set — no 500
      expect(status).toBe(200);
      const patches = calls.filter((call) => call.init.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(0);
      expect(JSON.parse(String(patches[0]?.init.body))).toEqual({
        name: title,
        description: "Adversaries target the sector.",
        public: false,
        TLP: "amber",
        indicators: {
          add: [{ indicator: "fresh.io", type: "domain" }],
          remove: [{ id: "ind-9" }],
        },
      });
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("SYNC-E: unchanged lists PATCH the scalar literals only (minimal body)", async () => {
    // Given: the live pulse already matches the ticket exactly
    const { ticketId, title } = await pushedTicket();
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: {
          id: PULSE_ID,
          name: title,
          description: "Adversaries target the sector.",
          public: false,
          TLP: "AMBER",
          tags: ["secnews", "TLP:AMBER"],
          references: ["https://example.com/advisory"],
          indicators: [
            { id: "ind-1", indicator: "evil.com", type: "domain" },
            { id: "ind-2", indicator: "fresh.io", type: "domain" },
          ],
        },
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the ticket is pushed again
      const status = await push(app, admin, ticketId);

      // Then: the PATCH body holds ONLY the scalar literals — no list ops
      expect(status).toBe(200);
      const patchBody = JSON.parse(
        String(calls.filter((call) => call.init.method === "PATCH")[0]?.init.body),
      ) as Record<string, unknown>;
      expect(patchBody).toEqual({
        name: title,
        description: "Adversaries target the sector.",
        public: false,
        TLP: "amber",
      });
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("SYNC-F: changed tags and references PATCH as {add,remove} string dicts", async () => {
    // Given: the live pulse misses one tag and carries one stale reference
    const { ticketId, title } = await pushedTicket();
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: {
          id: PULSE_ID,
          name: title,
        tags: ["secnews"],
        references: ["https://example.com/stale"],
        indicators: [
          { id: "ind-1", indicator: "evil.com", type: "domain" },
          { id: "ind-2", indicator: "fresh.io", type: "domain" },
        ],
        },
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the ticket is pushed again
      const status = await push(app, admin, ticketId);

      // Then: tags/references arrive as add/remove dicts — empty sides and
      // unchanged fields omitted, indicators untouched (unchanged set)
      expect(status).toBe(200);
      const patchBody = JSON.parse(
        String(calls.filter((call) => call.init.method === "PATCH")[0]?.init.body),
      ) as {
        tags?: { add?: string[]; remove?: string[] };
        references?: { add?: string[]; remove?: string[] };
        indicators?: unknown;
      };
      expect(patchBody.tags).toEqual({ add: ["TLP:AMBER"] });
      expect(patchBody.references).toEqual({
        add: ["https://example.com/advisory"],
        remove: ["https://example.com/stale"],
      });
      expect(patchBody.indicators).toBeUndefined();
    } finally {
      await cleanupTicket(ticketId);
    }
  });
});
