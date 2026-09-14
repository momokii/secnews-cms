import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestTicket, createTestSuggestion } from "./helpers.js";

/**
 * Surface 8b — OTX push + subscribed-pulse proxy (routes 52–53).
 * OTX-01 (S5): push stores otxPulseId/otxPulseUrl with the TLP mapping.
 * OTX-02 (S2): PENDING suggestions hard-block the push with 409.
 * OTX-03: /otx/pulses proxies the OTX subscribed feed with pagination.
 * The wire is always stubbed — no real OTX traffic in tests.
 */

const OTX_KEY = "5m3jkh-otx-key-9876";
const CREATE_URL = "https://otx.alienvault.com/api/v1/pulses/create";
const SUBSCRIBED_URL = "https://otx.alienvault.com/api/v1/pulses/subscribed";

async function readyTicket(tlp: "CLEAR" | "GREEN" | "AMBER" | "RED"): Promise<string> {
  const ticketId = await createTestTicket({
    overview: "Adversaries target the sector.",
    description: "Detailed narrative.",
    recommendations: "Rotate credentials.",
    references: ["https://example.com/advisory"],
  });
  await prisma.ticket.update({ where: { id: ticketId }, data: { status: "READY", tlp } });
  await prisma.ioc.create({
    data: { ticketId, type: "DOMAIN", value: "evil.com" },
  });
  return ticketId;
}

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

describe("TASK-D2 OTX push + pulses proxy", () => {
  let app: FastifyInstance;
  let admin = "";
  let editor = "";
  let analyst = "";

  beforeAll(async () => {
    app = await buildApp();
    admin = await bearerFor(app, "ADMIN");
    editor = await bearerFor(app, "EDITOR");
    analyst = await bearerFor(app, "ANALYST");
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

  it("OTX-01 (S5): push creates the pulse, stores id/link, maps TLP and forces public=false for AMBER", async () => {
    // Given: a READY ticket (default AMBER TLP) with an included IOC
    const ticketId = await readyTicket("AMBER");
    const { calls } = stubFetch(200, { id: "pulse-123", name: "whatever" });
    try {
      // When: an ADMIN pushes it to OTX
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      });

      // Then: the response carries the pulse identity and forced privacy
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        pulseId: "pulse-123",
        pulseUrl: "https://otx.alienvault.com/pulse/pulse-123",
        isPublic: false,
        tlpMarking: "AMBER",
      });

      // And: the wire call hit OTX create with the key header and mapped body
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe(CREATE_URL);
      expect(calls[0]?.init.method).toBe("POST");
      const headers = calls[0]?.init.headers as Record<string, string>;
      expect(headers["X-OTX-API-KEY"]).toBe(OTX_KEY);
      const sent = JSON.parse(String(calls[0]?.init.body)) as {
        name: string;
        description: string;
        public: boolean;
        TLP: string;
        tags: string[];
        references: string[];
        indicators: string[];
      };
      expect(sent.TLP).toBe("AMBER");
      expect(sent.public).toBe(false);
      expect(sent.indicators).toEqual(["evil.com"]);
      expect(sent.references).toEqual(["https://example.com/advisory"]);
      expect(sent.name).toContain("C4 fixture");

      // And: the ticket row stores the pulse id + link
      const row = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { otxPulseId: true, otxPulseUrl: true },
      });
      expect(row?.otxPulseId).toBe("pulse-123");
      expect(row?.otxPulseUrl).toBe("https://otx.alienvault.com/pulse/pulse-123");
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("OTX-01 (S5): TLP CLEAR maps to WHITE and stays public", async () => {
    // Given: a READY ticket marked CLEAR
    const ticketId = await readyTicket("CLEAR");
    const { calls } = stubFetch(200, { id: "pulse-clear" });
    try {
      // When: an EDITOR (MGR) pushes it
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: editor },
        payload: {},
      });

      // Then: legacy WHITE marking, public per OTX semantics
      expect(res.statusCode).toBe(200);
      const body = res.json() as { isPublic: boolean; tlpMarking: string };
      expect(body.isPublic).toBe(true);
      expect(body.tlpMarking).toBe("WHITE");
      const sent = JSON.parse(String(calls[0]?.init.body)) as { TLP: string; public: boolean };
      expect(sent.TLP).toBe("WHITE");
      expect(sent.public).toBe(true);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("OTX-02 (S2): PENDING suggestions hard-block the push with 409 PENDING_SUGGESTIONS", async () => {
    // Given: a READY ticket with an unresolved AI suggestion
    const ticketId = await readyTicket("AMBER");
    await createTestSuggestion(ticketId, {
      field: "overview",
      currentValue: null,
      suggestedValue: "draft",
    });
    try {
      // When: it is pushed
      const { calls } = stubFetch(200, { id: "never" });
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      });

      // Then: HARD BLOCK fires and no upstream call happens
      expect(res.statusCode).toBe(409);
      expect((res.json() as { error: { code: string } }).error.code).toBe("PENDING_SUGGESTIONS");
      expect(calls).toHaveLength(0);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("push on a non-READY ticket is 422 VALIDATION", async () => {
    // Given: a ticket still OPEN
    const ticketId = await createTestTicket({
      overview: "o",
      description: "d",
      recommendations: "r",
      references: ["https://example.com/x"],
    });
    try {
      // When: it is pushed
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      });

      // Then: semantic rejection, no upstream call
      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("OTX-03: GET /otx/pulses?page=2 proxies the subscribed feed with pagination and mapped items", async () => {
    // Given: an OTX subscribed page of two pulses
    const { calls } = stubFetch(200, {
      count: 42,
      results: [
        {
          id: "p1",
          name: "Pulse one",
          public: true,
          TLP: "WHITE",
          tags: [{ name: "apt" }, "ransomware"],
          indicator_count: 7,
          created: "2026-01-01T00:00:00.000Z",
          modified: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "p2",
          name: "Pulse two",
          public: false,
          TLP: "AMBER",
          tags: [],
          indicator_count: 0,
          created: "2026-02-01T00:00:00.000Z",
          modified: "2026-02-02T00:00:00.000Z",
        },
      ],
    });

    // When: an ADMIN lists page 2
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses?page=2",
      headers: { authorization: admin },
    });

    // Then: the envelope mirrors pagination and maps OTX fields to the wire
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      items: [
        {
          id: "p1",
          name: "Pulse one",
          isPublic: true,
          tlp: "WHITE",
          tags: ["apt", "ransomware"],
          indicatorCount: 7,
          created: "2026-01-01T00:00:00.000Z",
          modified: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "p2",
          name: "Pulse two",
          isPublic: false,
          tlp: "AMBER",
          tags: [],
          indicatorCount: 0,
          created: "2026-02-01T00:00:00.000Z",
          modified: "2026-02-02T00:00:00.000Z",
        },
      ],
      total: 42,
      page: 2,
      pageSize: 20,
    });
    expect(calls[0]?.url).toBe(`${SUBSCRIBED_URL}?page=2`);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["X-OTX-API-KEY"]).toBe(OTX_KEY);
  });

  it("OTX datetimes without a timezone (real OTX wire shape) normalize to ISO instead of 500", async () => {
    // Given: OTX returns created/modified with no timezone suffix, plus one garbage value
    stubFetch(200, {
      count: 2,
      results: [
        {
          id: "p-tz",
          name: "TZ-less pulse",
          public: true,
          TLP: "GREEN",
          tags: [],
          indicator_count: 1,
          created: "2026-03-01T00:00:00",
          modified: "2026-03-02T12:30:00.000000",
        },
        {
          id: "p-bad",
          name: "Bad date pulse",
          public: false,
          TLP: "RED",
          tags: [],
          indicator_count: 0,
          created: "not-a-date",
          modified: "",
        },
      ],
    });

    // When: pulses are listed
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses?page=1",
      headers: { authorization: admin },
    });

    // Then: 200 with normalized ISO datetimes and nulls — never a serialization 500
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ id: string; created: string | null; modified: string | null }>;
    };
    expect(body.items[0]?.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.items[0]?.modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.items[1]?.created).toBeNull();
    expect(body.items[1]?.modified).toBeNull();
  });

  it("OTX upstream failure surfaces as a 502 error envelope", async () => {
    // Given: an upstream outage
    stubFetch(503, { error: "unavailable" });
    // When: pulses are listed
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses",
      headers: { authorization: admin },
    });
    // Then: the canonical envelope carries a 502-style rejection
    expect(res.statusCode).toBe(502);
    expect((res.json() as { error: { code: string } }).error.code).toBe("INTERNAL");
  });

  it("RBAC: analyst reads pulses read-only (200) but push stays 403; anonymous → 401", async () => {
    const ticketId = await readyTicket("GREEN");
    try {
      const pushByAnalyst = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: analyst },
        payload: {},
      });
      stubFetch(200, { count: 0, results: [] });
      const pulsesByAnalyst = await app.inject({
        method: "GET",
        url: "/otx/pulses",
        headers: { authorization: analyst },
      });
      const anonPush = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        payload: {},
      });

      expect(pushByAnalyst.statusCode).toBe(403);
      expect(pulsesByAnalyst.statusCode).toBe(200);
      expect(pulsesByAnalyst.json()).toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });
      expect(anonPush.statusCode).toBe(401);
    } finally {
      await cleanupTicket(ticketId);
    }
  });
});
