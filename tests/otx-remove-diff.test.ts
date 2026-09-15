import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket } from "./helpers.js";

/**
 * TASK-BE — the OTX remove half of the indicator diff must carry the REAL
 * upstream ids. Ground truth: OTX pulse detail returns per-indicator ids as
 * NUMBERS (ApiV2 docs: {"id": 2829827, ...}); the old mapper coerced them to
 * "" so re-push after deleting an IP left the IP in the pulse. Domain edits
 * (remove old + add new) ride the same remove op. Wire always stubbed.
 */

const OTX_KEY = "5m3jkh-otx-remove-key-1";
const BASE = "https://otx.alienvault.com";
const CREATE_URL = `${BASE}/api/v1/pulses/create`;
const PULSE_ID = "pulse-remove-1";
const PATCH_URL = `${BASE}/api/v1/pulses/${PULSE_ID}`;

type FetchCall = { url: string; init: RequestInit };

function stubWire(routes: Array<{ method: string; url: string; status: number; payload: unknown }>): {
  calls: FetchCall[];
} {
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

describe("TASK-BE updatePulse remove op carries real upstream indicator ids", () => {
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
    const ticketId = await createTestTicket({ overview: "Sector targeting." });
    const row = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "READY", tlp: "AMBER" },
      select: { title: true },
    });
    await prisma.ioc.create({ data: { ticketId, type: "DOMAIN", value: "evil.com" } });
    stubWire([{ method: "POST", url: CREATE_URL, status: 200, payload: { id: PULSE_ID } }]);
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/otx`,
      headers: { authorization: admin },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    return { ticketId, title: row.title };
  }

  it("RM-01: a deleted IOC PATCHes {remove:[{id:<numeric upstream id>}]} — verbatim, never an empty string", async () => {
    // Given: the pulse carries evil.com + stale.net with NUMERIC upstream ids
    // (the real OTX detail shape); the ticket dropped stale.net
    const { ticketId, title } = await pushedTicket();
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: {
          id: PULSE_ID,
          name: title,
          description: "Sector targeting.",
          public: false,
          TLP: "AMBER",
          tags: ["secnews", "TLP:AMBER"],
          references: ["https://example.com/advisory"],
          indicators: [
            { id: 2829830, indicator: "evil.com", type: "domain" },
            { id: 2829827, indicator: "stale.net", type: "domain" },
          ],
        },
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the ticket is pushed again
      const status = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      }).then((res) => res.statusCode);

      // Then: the exact PATCH body — remove names stale.net's upstream id 2829827
      expect(status).toBe(200);
      const patches = calls.filter((call) => call.init.method === "PATCH");
      expect(patches).toHaveLength(1);
      const body = JSON.parse(String(patches[0]?.init.body)) as {
        indicators?: { add?: unknown[]; remove?: Array<{ id: string | number }> };
      };
      expect(body.indicators).toBeDefined();
      expect(body.indicators?.add).toBeUndefined();
      expect(body.indicators?.remove).toEqual([{ id: 2829827 }]);
      expect(body.indicators?.remove?.[0]?.id).toBe(2829827);
      expect(typeof body.indicators?.remove?.[0]?.id).toBe("number");
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("RM-02: a domain edit rides the same op — remove old id + add new object in one PATCH", async () => {
    // Given: the pulse carries old.io; the ticket replaced it with new.io
    const { ticketId } = await pushedTicket();
    await prisma.ioc.update({
      where: { ticketId_type_value: { ticketId, type: "DOMAIN", value: "evil.com" } },
      data: { value: "new.io" },
    });
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: {
          id: PULSE_ID,
          tags: ["secnews", "TLP:AMBER"],
          references: ["https://example.com/advisory"],
          indicators: [{ id: 2829900, indicator: "evil.com", type: "domain" }],
        },
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the ticket is pushed again
      const status = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      }).then((res) => res.statusCode);

      // Then: one PATCH doing both halves of the edit
      expect(status).toBe(200);
      const patchBody = JSON.parse(
        String(calls.filter((call) => call.init.method === "PATCH")[0]?.init.body),
      ) as { indicators: { add: Array<{ indicator: string }>; remove: Array<{ id: number }> } };
      expect(patchBody.indicators.add).toEqual([{ indicator: "new.io", type: "domain" }]);
      expect(patchBody.indicators.remove).toEqual([{ id: 2829900 }]);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("RM-03: string ids (legacy/defensive fixture) still pass through verbatim", async () => {
    // Given: a detail payload whose ids arrive as strings
    const { ticketId } = await pushedTicket();
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: {
          id: PULSE_ID,
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
      const status = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      }).then((res) => res.statusCode);

      // Then: the remove op carries the string id unchanged
      expect(status).toBe(200);
      const patchBody = JSON.parse(
        String(calls.filter((call) => call.init.method === "PATCH")[0]?.init.body),
      ) as { indicators: { remove: Array<{ id: string }> } };
      expect(patchBody.indicators.remove).toEqual([{ id: "ind-9" }]);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("RM-04: GET /otx/pulses/:id still serves indicators as {value,type} — ids never reach the wire", async () => {
    // Given: a pulse detail with numeric indicator ids
    stubWire([
      {
        method: "GET",
        url: `${BASE}/api/v1/pulses/abc123`,
        status: 200,
        payload: {
          id: "abc123",
          name: "n",
          author_name: "a",
          description: "d",
          public: true,
          TLP: "GREEN",
          tags: [],
          references: [],
          indicators: [{ id: 42, indicator: "9.9.9.9", type: "IPv4" }],
          created: "2026-01-01T00:00:00",
          modified: "2026-01-02T00:00:00",
        },
      },
    ]);
    // When: the detail proxy is read
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses/abc123",
      headers: { authorization: admin },
    });

    // Then: the wire shape keeps value+type only
    expect(res.statusCode).toBe(200);
    const body = res.json() as { indicators: Array<Record<string, unknown>> };
    expect(body.indicators).toEqual([{ value: "9.9.9.9", type: "IPv4" }]);
  });
});
