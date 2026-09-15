import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { IocType } from "../src/generated/prisma/enums.js";
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
const MY_PULSES_URL = "https://otx.alienvault.com/api/v1/pulses/my";

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
        indicators: Array<{ indicator: string; type: string }>;
      };
      expect(sent.TLP).toBe("amber");
      expect(sent.public).toBe(false);
      expect(sent.indicators).toEqual([{ indicator: "evil.com", type: "domain" }]);
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
      const sent = JSON.parse(String(calls[0]?.init.body)) as { TLP: string; public: boolean; indicators: Array<{ indicator: string; type: string }> };
      expect(sent.TLP).toBe("white");
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
          author_name: "AlienVault",
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
          author_name: "Malwaremustdie",
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
          authorName: "AlienVault",
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
          authorName: "Malwaremustdie",
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
    expect(calls[0]?.url).toBe(`${SUBSCRIBED_URL}?limit=20&page=2`);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["X-OTX-API-KEY"]).toBe(OTX_KEY);
  });

  it("GET /otx/pulses?source=mine proxies My pulses with limit, page, and API key", async () => {
    // Given: OTX returns the caller's own pulses
    const { calls } = stubFetch(200, {
      count: 1,
      results: [{ id: "mine-1", name: "My pulse", public: false, TLP: "GREEN", tags: [], indicator_count: 2 }],
    });

    // When: an ADMIN lists My pulses on page 2
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses?source=mine&page=2",
      headers: { authorization: admin },
    });

    // Then: the route returns mapped results and uses the documented endpoint
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].id).toBe("mine-1");
    expect(calls[0]?.url).toBe(`${MY_PULSES_URL}?limit=20&page=2`);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["X-OTX-API-KEY"]).toBe(OTX_KEY);
  });

  it("rejects an invalid pulse source with 400 VALIDATION", async () => {
    // Given: an authenticated operator requests an unsupported source
    // When: the pulse list route validates the query
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses?source=created",
      headers: { authorization: admin },
    });

    // Then: validation fails before reading the integration or calling OTX
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
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

describe("TASK-OTXPLUS pulses upgrades", () => {
  const SEARCH_URL = "https://otx.alienvault.com/api/v1/search/pulses";
  const PULSE_URL = "https://otx.alienvault.com/api/v1/pulses";

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

  it("OTXP-01: pageSize is forwarded as the OTX limit for subscribed", async () => {
    // Given: a subscribed page stub
    const { calls } = stubFetch(200, { count: 0, results: [] });

    // When: the operator requests 50 per page
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses?pageSize=50&page=3",
      headers: { authorization: admin },
    });

    // Then: the upstream call carries limit=50 and the envelope echoes pageSize
    expect(res.statusCode).toBe(200);
    expect(calls[0]?.url).toBe(`${SUBSCRIBED_URL}?limit=50&page=3`);
    expect((res.json() as { pageSize: number }).pageSize).toBe(50);
  });

  it("OTXP-02: pageSize is clamped into 1..50 before it reaches OTX", async () => {
    // Given: out-of-range page sizes
    const { calls } = stubFetch(200, { count: 0, results: [] });

    // When: both extremes are requested
    await app.inject({
      method: "GET",
      url: "/otx/pulses?pageSize=500",
      headers: { authorization: admin },
    });
    await app.inject({
      method: "GET",
      url: "/otx/pulses?pageSize=0",
      headers: { authorization: admin },
    });

    // Then: OTX never sees a limit outside 1..50
    expect(calls.map((call) => call.url)).toEqual([
      `${SUBSCRIBED_URL}?limit=50&page=1`,
      `${SUBSCRIBED_URL}?limit=1&page=1`,
    ]);
  });

  it("OTXP-03: pageSize is forwarded as the OTX limit for My pulses", async () => {
    // Given: the My pulses stub
    const { calls } = stubFetch(200, { count: 0, results: [] });

    // When: 10 per page of the caller's own pulses are requested
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses?source=mine&pageSize=10&page=1",
      headers: { authorization: admin },
    });

    // Then: limit=10 reaches the wire
    expect(res.statusCode).toBe(200);
    expect(calls[0]?.url).toBe(`${MY_PULSES_URL}?limit=10&page=1`);
  });

  it("OTXP-04: GET /otx/pulses/:id proxies the upstream pulse and maps indicators, references, and TZ-less dates", async () => {
    // Given: an OTX pulse detail with timezone-less datetimes and indicators
    const { calls } = stubFetch(200, {
      id: "pulse-abc",
      name: "Ransomware wave",
      description: "Detailed narrative.",
      author_name: "AlienVault",
      public: false,
      TLP: "AMBER",
      tags: [{ name: "ransomware" }, "lockbit"],
      references: ["https://example.com/advisory", "https://example.org/ioc"],
      indicators: [
        { indicator: "evil.com", type: "domain" },
        { indicator: "1.2.3.4", type: "IPv4" },
      ],
      created: "2026-03-01T00:00:00",
      modified: "2026-03-02T12:30:00.000000",
    });

    // When: the pulse detail is fetched through the proxy
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses/pulse-abc",
      headers: { authorization: admin },
    });

    // Then: the wire shape matches OtxPulseDetailSchema with ISO datetimes
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: "pulse-abc",
      name: "Ransomware wave",
      authorName: "AlienVault",
      description: "Detailed narrative.",
      isPublic: false,
      tlp: "AMBER",
      tags: ["ransomware", "lockbit"],
      references: ["https://example.com/advisory", "https://example.org/ioc"],
      indicators: [
        { value: "evil.com", type: "domain" },
        { value: "1.2.3.4", type: "IPv4" },
      ],
      created: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      modified: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(calls[0]?.url).toBe(`${PULSE_URL}/pulse-abc`);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["X-OTX-API-KEY"]).toBe(OTX_KEY);
  });

  it("OTXP-05: a pulse the key cannot access yields a 502 envelope that never leaks the key", async () => {
    // Given: OTX answers 404 for a private pulse outside the key's reach
    const { calls } = stubFetch(404, { detail: "Not found" });

    // When: its detail is requested
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses/inaccessible",
      headers: { authorization: admin },
    });

    // Then: the canonical 502 envelope is returned and the key stays secret
    expect(res.statusCode).toBe(502);
    expect((res.json() as { error: { code: string } }).error.code).toBe("INTERNAL");
    expect(res.body).not.toContain(OTX_KEY);
    expect(calls).toHaveLength(1);
  });

  it("OTXP-06: source=search proxies /api/v1/search/pulses with q, limit, and page", async () => {
    // Given: a search result page with one matching pulse
    const { calls } = stubFetch(200, {
      count: 1,
      results: [
        { id: "hit-1", name: "Ransom note", public: true, TLP: "GREEN", tags: [], indicator_count: 4 },
      ],
    });

    // When: a keyword search is executed on page 2 with 10 per page
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses?source=search&q=ransomware&page=2&pageSize=10",
      headers: { authorization: admin },
    });

    // Then: the upstream search endpoint receives q, limit, and page
    expect(res.statusCode).toBe(200);
    expect(calls[0]?.url).toBe(`${SEARCH_URL}?q=ransomware&limit=10&page=2`);
    const body = res.json() as { items: Array<{ id: string }>; total: number };
    expect(body.items[0]?.id).toBe("hit-1");
    expect(body.total).toBe(1);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["X-OTX-API-KEY"]).toBe(OTX_KEY);
  });

  it("OTXP-07: invalid source stays 400 VALIDATION and blank q searches without the param", async () => {
    // Given: an unsupported source
    const bad = await app.inject({
      method: "GET",
      url: "/otx/pulses?source=created",
      headers: { authorization: admin },
    });

    // And: a search with no q typed yet
    const { calls } = stubFetch(200, { count: 0, results: [] });
    const blank = await app.inject({
      method: "GET",
      url: "/otx/pulses?source=search",
      headers: { authorization: admin },
    });

    // Then: the 400 is preserved and the blank search omits q upstream
    expect(bad.statusCode).toBe(400);
    expect((bad.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    expect(blank.statusCode).toBe(200);
    expect(calls[0]?.url).toBe(`${SEARCH_URL}?limit=20&page=1`);
  });
});

describe("TASK-OTXFIX real upstream shapes", () => {
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

  it("OTXFIX-01: subscribed rows without indicator_count derive the count from the embedded indicators array and map author_name", async () => {
    // Given: the REAL OTX subscribed wire shape — no indicator_count field,
    // an embedded indicators array, and author_name on every pulse
    stubFetch(200, {
      count: 3,
      results: [
        {
          id: "64e38336d783f91d6948a7b1",
          name: "Sample Pulse",
          description: "",
          author_name: "SampleUser",
          public: true,
          TLP: "GREEN",
          tags: ["cisa", "backdoor"],
          references: ["https://www.cisa.gov/news-events/analysis-reports/ar23-230a"],
          indicators: [
            { indicator: "pinup-casino-tr.site", type: "domain" },
            { indicator: "1.2.3.4", type: "IPv4" },
            { indicator: "evil.example", type: "hostname" },
          ],
          created: "2023-08-22T09:43:18.855000",
          modified: "2023-08-22T09:43:18.855000",
          adversary: "",
          revision: 1,
        },
        {
          id: "counted-1",
          name: "Counted pulse",
          author_name: "AlienVault",
          public: true,
          TLP: "WHITE",
          tags: [],
          indicator_count: 7,
          indicators: [{ indicator: "a.example", type: "domain" }],
          created: "2023-08-22T09:43:18.855000",
          modified: "2023-08-22T09:43:18.855000",
        },
        {
          id: "empty-1",
          name: "Empty pulse",
          author_name: "",
          public: false,
          TLP: "AMBER",
          tags: [],
          created: "2023-08-22T09:43:18.855000",
          modified: "2023-08-22T09:43:18.855000",
        },
      ],
    });

    // When: the subscribed feed is listed
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses?source=subscribed",
      headers: { authorization: admin },
    });

    // Then: counts derive from embedded indicators, known-good counts are
    // never blanked, and author_name flows through (empty stays empty)
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ id: string; indicatorCount: number; authorName: string }>;
    };
    expect(body.items[0]).toMatchObject({ id: "64e38336d783f91d6948a7b1", indicatorCount: 3, authorName: "SampleUser" });
    expect(body.items[1]).toMatchObject({ id: "counted-1", indicatorCount: 7, authorName: "AlienVault" });
    expect(body.items[2]).toMatchObject({ id: "empty-1", indicatorCount: 0, authorName: "" });
  });

  it("OTXFIX-02: My pulses rows map the same real shape (embedded indicators, author_name)", async () => {
    // Given: an OTX My-pulses page without indicator_count
    const { calls } = stubFetch(200, {
      count: 1,
      results: [
        {
          id: "mine-real",
          name: "My real pulse",
          author_name: "operator",
          public: true,
          TLP: "GREEN",
          tags: [],
          indicators: [
            { indicator: "bad.example", type: "domain" },
            { indicator: "5.6.7.8", type: "IPv4" },
          ],
          created: "2023-08-22T09:43:18.855000",
          modified: "2023-08-22T09:43:18.855000",
        },
      ],
    });

    // When: My pulses are listed
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses?source=mine",
      headers: { authorization: admin },
    });

    // Then: the count derives from the embedded array and the author flows through
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ id: string; indicatorCount: number; authorName: string }>;
    };
    expect(body.items[0]).toMatchObject({ id: "mine-real", indicatorCount: 2, authorName: "operator" });
    expect(calls[0]?.url).toBe(`${MY_PULSES_URL}?limit=20&page=1`);
  });

  it("OTXFIX-03: pulse detail maps author_name from the real upstream shape", async () => {
    // Given: an OTX pulse detail carrying author_name (real shape)
    stubFetch(200, {
      id: "pulse-auth",
      name: "Authored pulse",
      description: "Narrative.",
      author_name: "SampleUser",
      public: true,
      TLP: "GREEN",
      tags: [],
      references: [],
      indicators: [{ indicator: "bad.example", type: "domain" }],
      created: "2023-08-22T09:43:18.855000",
      modified: "2023-08-22T09:43:18.855000",
    });

    // When: the detail is fetched through the proxy
    const res = await app.inject({
      method: "GET",
      url: "/otx/pulses/pulse-auth",
      headers: { authorization: admin },
    });

    // Then: authorName is part of the wire response
    expect(res.statusCode).toBe(200);
    expect((res.json() as { authorName: string }).authorName).toBe("SampleUser");
  });
});

describe("TASK-PUSHFIX push correctness", () => {
  const PATCH_URL = "https://otx.alienvault.com/api/v1/pulses/pulse-123";

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

  /** READY ticket with one IOC per included type; returns the ticket id. */
  async function readyTicketWithIocs(
    tlp: "CLEAR" | "GREEN" | "AMBER" | "RED",
    iocs: Array<{ type: IocType; value: string }>,
  ): Promise<string> {
    const ticketId = await createTestTicket({
      overview: "Adversaries target the sector.",
      description: "Detailed narrative.",
      recommendations: "Rotate credentials.",
      references: ["https://example.com/advisory"],
    });
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "READY", tlp } });
    for (const ioc of iocs) {
      await prisma.ioc.create({ data: { ticketId, type: ioc.type, value: ioc.value } });
    }
    return ticketId;
  }

  function sentBodies(calls: FetchCall[]): Array<Record<string, unknown>> {
    return calls
      .filter((call) => call.url === CREATE_URL || call.url.startsWith("https://otx.alienvault.com/api/v1/pulses/"))
      .map((call) => JSON.parse(String(call.init.body)) as Record<string, unknown>);
  }

  it("PUSHFIX-01: every mapped IocType reaches OTX as a typed {indicator,type} object; OTHER is skipped", async () => {
    // Given: a READY ticket carrying one IOC of every type incl. OTHER
    const ticketId = await readyTicketWithIocs("GREEN", [
      { type: "DOMAIN", value: "kelanach.xyz" },
      { type: "IPV4", value: "10.10.10.10" },
      { type: "IPV6", value: "2001:db8::1" },
      { type: "URL", value: "https://kelanach.xyz/payload" },
      { type: "EMAIL", value: "phish@kelanach.xyz" },
      { type: "MD5", value: "0123456789abcdef0123456789abcdef" },
      { type: "SHA1", value: "0123456789abcdef0123456789abcdef01234567" },
      { type: "SHA256", value: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
      { type: "FILEPATH", value: "C:\\Windows\\Temp\\evil.exe" },
      { type: "MUTEX", value: "Global\\evil" },
      { type: "CIDR", value: "10.10.10.0/24" },
      { type: "OTHER", value: "unmappable-artifact" },
    ]);
    const { calls } = stubFetch(200, { id: "pulse-123" });
    try {
      // When: the ticket is pushed
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      });

      // Then: indicators are typed objects using the exact OTX type names
      // (OTX-Python-SDK IndicatorTypes.py) and OTHER has no OTX equivalent
      // so it is excluded
      expect(res.statusCode).toBe(200);
      const body = sentBodies(calls)[0] as { indicators: Array<{ indicator: string; type: string }> };
      const indicators = [...body.indicators].sort((a, b) => a.indicator.localeCompare(b.indicator));
      expect(indicators).toEqual([
        { indicator: "0123456789abcdef0123456789abcdef", type: "FileHash-MD5" },
        { indicator: "0123456789abcdef0123456789abcdef01234567", type: "FileHash-SHA1" },
        {
          indicator: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          type: "FileHash-SHA256",
        },
        { indicator: "10.10.10.0/24", type: "CIDR" },
        { indicator: "10.10.10.10", type: "IPv4" },
        { indicator: "2001:db8::1", type: "IPv6" },
        { indicator: "C:\\Windows\\Temp\\evil.exe", type: "FilePath" },
        { indicator: "Global\\evil", type: "Mutex" },
        { indicator: "https://kelanach.xyz/payload", type: "URL" },
        { indicator: "kelanach.xyz", type: "domain" },
        { indicator: "phish@kelanach.xyz", type: "email" },
      ]);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("PUSHFIX-02: a RED ticket pushes the exact documented create body (lowercase TLP value)", async () => {
    // Given: a READY TLP:RED ticket with the ground-truth IOCs included
    const ticketId = await readyTicketWithIocs("RED", [
      { type: "DOMAIN", value: "kelanach.xyz" },
      { type: "IPV4", value: "10.10.10.10" },
    ]);
    const { calls } = stubFetch(200, { id: "pulse-123" });
    try {
      // When: the ticket is pushed
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      });

      // Then: the body OTX receives is exactly the documented shape —
      // `TLP` carries the lowercase legacy value (official external API
      // schema enum: white|green|amber|red), indicators are typed objects
      expect(res.statusCode).toBe(200);
      const body = sentBodies(calls)[0] as {
        name: string;
        description: string;
        public: boolean;
        TLP: string;
        tags: string[];
        references: string[];
        indicators: Array<{ indicator: string; type: string }>;
      };
      expect(body.TLP).toBe("red");
      expect(body.public).toBe(false);
      expect(body.name).toContain("C4 fixture");
      expect(body.description).toBe("Adversaries target the sector.\n\nDetailed narrative.");
      expect(body.tags).toEqual(["secnews", "TLP:RED"]);
      expect(body.references).toEqual(["https://example.com/advisory"]);
      const indicators = [...body.indicators].sort((a, b) => a.indicator.localeCompare(b.indicator));
      expect(indicators).toEqual([
        { indicator: "10.10.10.10", type: "IPv4" },
        { indicator: "kelanach.xyz", type: "domain" },
      ]);
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("PUSHFIX-03: re-pushing an already-pushed ticket PATCHes the existing pulse instead of creating a second one", async () => {
    // Given: a READY ticket that has already been pushed once
    const ticketId = await readyTicketWithIocs("AMBER", [{ type: "DOMAIN", value: "kelanach.xyz" }]);
    stubFetch(200, { id: "pulse-123" });
    const first = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/otx`,
      headers: { authorization: admin },
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    const { calls } = stubFetch(200, { id: "pulse-123" });
    try {
      // When: the same ticket is pushed again
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      });

      // Then: exactly one documented PATCH update reaches the existing
      // pulse and no second create happens
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        pulseId: "pulse-123",
        pulseUrl: "https://otx.alienvault.com/pulse/pulse-123",
        isPublic: false,
        tlpMarking: "AMBER",
      });
      const posts = calls.filter((call) => call.init.method === "POST");
      const patches = calls.filter((call) => call.init.method === "PATCH");
      expect(posts).toHaveLength(0);
      expect(patches).toHaveLength(1);
      expect(patches[0]?.url).toBe(PATCH_URL);
      const patchHeaders = patches[0]?.init.headers as Record<string, string>;
      expect(patchHeaders["X-OTX-API-KEY"]).toBe(OTX_KEY);
      const patchBody = JSON.parse(String(patches[0]?.init.body)) as {
        name: string;
        public: boolean;
        TLP: string;
        tags: string[];
        indicators: Array<{ indicator: string; type: string }>;
      };
      expect(patchBody.TLP).toBe("amber");
      expect(patchBody.indicators).toEqual([{ indicator: "kelanach.xyz", type: "domain" }]);

      // And: the ticket still points at the SAME pulse and the activity
      // trail says the pulse was updated
      const row = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { otxPulseId: true, otxPulseUrl: true },
      });
      expect(row?.otxPulseId).toBe("pulse-123");
      expect(row?.otxPulseUrl).toBe("https://otx.alienvault.com/pulse/pulse-123");
      const pushes = await prisma.ticketActivity.findMany({
        where: { ticketId, action: "OTX_PUSHED" },
        select: { detail: true },
      });
      expect(pushes).toHaveLength(2);
      expect(pushes.some((p) => p.detail === "pulse-123")).toBe(true);
      expect(pushes.some((p) => p.detail === "pulse-123 (updated)")).toBe(true);
    } finally {
      await cleanupTicket(ticketId);
    }
  });
});

describe("TASK-AIB OTX description truncation (OTX caps description at 1024)", () => {
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

  /** READY ticket whose joined overview+description is exactly 1882 chars —
   * the live-failure fixture ("description Must be 0-1024 chars (actual 1882)"). */
  async function longDescriptionTicket(): Promise<{ ticketId: string; joined: string }> {
    const overview = "O".repeat(500);
    const description = "D".repeat(1380); // 500 + "\n\n" + 1380 = 1882
    const ticketId = await createTestTicket({
      overview,
      description,
      references: ["https://example.com/advisory"],
    });
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "READY" } });
    return { ticketId, joined: `${overview}\n\n${description}` };
  }

  it("AIB-OTX-01: a 1882-char description truncates to 1024 chars with an ellipsis on create", async () => {
    // Given: a READY ticket whose joined description exceeds OTX's 1024 cap
    const { ticketId, joined } = await longDescriptionTicket();
    const { calls } = stubFetch(200, { id: "pulse-long" });
    try {
      // When: it is pushed
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      });

      // Then: the push succeeds where it previously answered 400 upstream…
      expect(res.statusCode).toBe(200);

      // …and the wire description is capped at 1024 chars ending with '…',
      // the name untouched (truncation is description-only)
      expect(calls).toHaveLength(1);
      const sent = JSON.parse(String(calls[0]?.init.body)) as { name: string; description: string };
      expect(sent.description).toHaveLength(1024);
      expect(sent.description.endsWith("…")).toBe(true);
      expect(sent.description).toBe(`${joined.slice(0, 1023)}…`);
      expect(sent.name).toContain("C4 fixture");
    } finally {
      await cleanupTicket(ticketId);
    }
  });

  it("AIB-OTX-02: the documented PATCH edit path truncates the same way", async () => {
    // Given: a READY long-description ticket pushed once (pulse exists)
    const { ticketId } = await longDescriptionTicket();
    stubFetch(200, { id: "pulse-long" });
    const first = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/otx`,
      headers: { authorization: admin },
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    const { calls } = stubFetch(200, { id: "pulse-long" });
    try {
      // When: it is re-pushed (idempotent PATCH edit)
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticketId}/otx`,
        headers: { authorization: admin },
        payload: {},
      });

      // Then: the PATCH body carries the same 1024-char capped description
      expect(res.statusCode).toBe(200);
      const patches = calls.filter((call) => call.init.method === "PATCH");
      expect(patches).toHaveLength(1);
      const patchBody = JSON.parse(String(patches[0]?.init.body)) as { description: string };
      expect(patchBody.description).toHaveLength(1024);
      expect(patchBody.description.endsWith("…")).toBe(true);
    } finally {
      await cleanupTicket(ticketId);
    }
  });
});
