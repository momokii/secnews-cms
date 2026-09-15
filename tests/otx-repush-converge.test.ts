import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket } from "./helpers.js";

/**
 * TASK-OTXDIFF — a re-push must CONVERGE the live pulse to the ticket's
 * current IOC set: no duplicates, no stale rows. Ground truth: whatsapp.com
 * accumulated 5 identical pulse rows; ticket edits never reflected; stale IPs
 * remained. Root cause: updatePulse diffed (value,type) EXACTLY while OTX
 * returns pushed rows under sibling type names ("hostname" for a pushed
 * "domain") and FQDN/case variants ("whatsapp.com." vs "WhatsApp.COM") —
 * every re-push re-added and mis-diffed. The fix: ONE canonical comparison
 * (trim + lowercase, single trailing dot stripped for hostnames; type
 * aliases hostname→domain, uri→URL, path→FilePath, case-insensitive) applied
 * on BOTH sides, and the add-list deduped by canonical key. Fixtures are
 * shaped like REAL OTX GET /pulses/:id responses (numeric ids, OTX casing).
 * Wire always stubbed.
 */

const OTX_KEY = "5m3jkh-otx-converge-key-1";
const BASE = "https://otx.alienvault.com";
const CREATE_URL = `${BASE}/api/v1/pulses/create`;
const PULSE_ID = "pulse-converge-1";
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

/** Real-shape OTX detail the stub answers on GET before the PATCH. */
function otxDetail(
  indicators: Array<{ id: number; indicator: string; type: string }>,
): Record<string, unknown> {
  return {
    id: PULSE_ID,
    name: "C4 fixture",
    description: "Convergence fixture.",
    public: false,
    TLP: "AMBER",
    tags: ["secnews", "TLP:AMBER"],
    references: [],
    indicators,
    created: "2026-01-01T00:00:00",
    modified: "2026-01-02T00:00:00",
  };
}

type PatchBody = {
  indicators?: { add?: Array<{ indicator: string; type: string }>; remove?: Array<{ id: number }> };
};

function patchBody(calls: FetchCall[]): PatchBody {
  const patches = calls.filter((call) => call.init.method === "PATCH");
  expect(patches).toHaveLength(1);
  return JSON.parse(String(patches[0]?.init.body)) as PatchBody;
}

async function repush(app: FastifyInstance, admin: string, ticketId: string): Promise<number> {
  return app.inject({
    method: "POST",
    url: `/tickets/${ticketId}/otx`,
    headers: { authorization: admin },
    payload: {},
  }).then((res) => res.statusCode);
}

describe("TASK-OTXDIFF re-push converges the pulse to the ticket's current IOC set", () => {
  let app: FastifyInstance;
  let admin = "";

  /** A READY ticket with the given included IOCs, pushed once (create). */
  async function pushedTicket(iocs: Array<{ type: "DOMAIN" | "IPV4"; value: string }>): Promise<string> {
    const ticketId = await createTestTicket({ overview: "Convergence fixture.", references: [] });
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "READY", tlp: "AMBER" },
    });
    for (const ioc of iocs) {
      await prisma.ioc.create({ data: { ticketId, type: ioc.type, value: ioc.value } });
    }
    stubWire([{ method: "POST", url: CREATE_URL, status: 200, payload: { id: PULSE_ID } }]);
    expect(await repush(app, admin, ticketId)).toBe(200);
    return ticketId;
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

  it("CONV-A: OTX stores the pushed domain as type 'hostname' — re-push is a no-op diff, not another add", async () => {
    // Given: the pulse row carries whatsapp.com under OTX's own type name
    const ticketId = await pushedTicket([{ type: "DOMAIN", value: "whatsapp.com" }]);
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: otxDetail([{ id: 2830001, indicator: "whatsapp.com", type: "hostname" }]),
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the same ticket is pushed again
      const status = await repush(app, admin, ticketId);

      // Then: no indicator ops — the domain is recognized through the alias
      expect(status).toBe(200);
      expect(patchBody(calls).indicators).toBeUndefined();
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("TASK-RESEND: a SENT ticket can be pushed to OTX again — PATCH path, activity audited", async () => {
    // Given: a ticket pushed once while READY, then marked SENT
    const ticketId = await pushedTicket([{ type: "DOMAIN", value: "sent.com" }]);
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "SENT" } });
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: otxDetail([{ id: 2830007, indicator: "sent.com", type: "hostname" }]),
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: OTX is pushed again from SENT
      const status = await repush(app, admin, ticketId);

      // Then: 200 via PATCH (converging, not a second create), ticket stays SENT
      expect(status).toBe(200);
      expect(calls.some((call) => call.url === CREATE_URL)).toBe(false);
      expect(calls.some((call) => call.init.method === "PATCH")).toBe(true);
      expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe("SENT");

      // And: the second push is in the activity trail
      const pushes = await prisma.ticketActivity.count({
        where: { ticketId, action: "OTX_PUSHED" },
      });
      expect(pushes).toBeGreaterThanOrEqual(2);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("CONV-B: a stale IP only in the pulse is removed by upstream id, nothing added", async () => {
    // Given: the pulse still carries an IP the ticket dropped
    const ticketId = await pushedTicket([{ type: "DOMAIN", value: "evil.com" }]);
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: otxDetail([
          { id: 2830010, indicator: "1.2.3.4", type: "IPv4" },
          { id: 2830002, indicator: "evil.com", type: "hostname" },
        ]),
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the ticket (evil.com only) is pushed again
      const status = await repush(app, admin, ticketId);

      // Then: only the removal rides the PATCH
      expect(status).toBe(200);
      const body = patchBody(calls);
      expect(body.indicators?.add).toBeUndefined();
      expect(body.indicators?.remove).toEqual([{ id: 2830010 }]);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("CONV-C: an edited domain converges — add the new value, remove the old upstream id", async () => {
    // Given: the ticket replaced evil.com with new.io after the first push
    const ticketId = await pushedTicket([{ type: "DOMAIN", value: "evil.com" }]);
    await prisma.ioc.update({
      where: { ticketId_type_value: { ticketId, type: "DOMAIN", value: "evil.com" } },
      data: { value: "new.io" },
    });
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: otxDetail([{ id: 2830003, indicator: "evil.com", type: "hostname" }]),
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the ticket is pushed again
      const status = await repush(app, admin, ticketId);

      // Then: one PATCH doing both halves of the edit — no evil.com residue
      expect(status).toBe(200);
      const body = patchBody(calls);
      expect(body.indicators?.add).toEqual([{ indicator: "new.io", type: "domain" }]);
      expect(body.indicators?.remove).toEqual([{ id: 2830003 }]);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("CONV-D: duplicate ticket rows (casing variants) produce a SINGLE add", async () => {
    // Given: the ticket stores the same domain twice, differing only in case
    const ticketId = await pushedTicket([
      { type: "DOMAIN", value: "WHATSAPP.COM" },
      { type: "DOMAIN", value: "whatsapp.com" },
    ]);
    const { calls } = stubWire([
      { method: "GET", url: PATCH_URL, status: 200, payload: otxDetail([]) },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the ticket is pushed again
      const status = await repush(app, admin, ticketId);

      // Then: exactly one add object for the canonical domain
      expect(status).toBe(200);
      const body = patchBody(calls);
      expect(body.indicators?.add).toHaveLength(1);
      expect(body.indicators?.add?.[0]?.type).toBe("domain");
      expect(String(body.indicators?.add?.[0]?.indicator).toLowerCase()).toBe("whatsapp.com");
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("CONV-E: FQDN/case variants across sides match — OTX 'whatsapp.com.' equals ticket 'WhatsApp.COM'", async () => {
    // Given: OTX normalized the row to the absolute FQDN form
    const ticketId = await pushedTicket([{ type: "DOMAIN", value: "WhatsApp.COM" }]);
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: otxDetail([{ id: 2830005, indicator: "whatsapp.com.", type: "hostname" }]),
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the same ticket is pushed again
      const status = await repush(app, admin, ticketId);

      // Then: the variants recognize each other — no indicator ops
      expect(status).toBe(200);
      expect(patchBody(calls).indicators).toBeUndefined();
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("CONV-F: OTX type-case variants match — detail 'ipv4' equals our 'IPv4'", async () => {
    // Given: OTX echoes the IP with a lowercase type name
    const ticketId = await pushedTicket([{ type: "IPV4", value: "9.9.9.9" }]);
    const { calls } = stubWire([
      {
        method: "GET",
        url: PATCH_URL,
        status: 200,
        payload: otxDetail([{ id: 2830006, indicator: "9.9.9.9", type: "ipv4" }]),
      },
      { method: "PATCH", url: PATCH_URL, status: 200, payload: {} },
    ]);
    try {
      // When: the same ticket is pushed again
      const status = await repush(app, admin, ticketId);

      // Then: no indicator ops
      expect(status).toBe(200);
      expect(patchBody(calls).indicators).toBeUndefined();
    } finally {
      await cleanupTicket(ticketId);
    }
  });
});
