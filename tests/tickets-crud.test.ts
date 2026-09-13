import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { TicketDetailSchema, TicketSchema } from "../src/modules/tickets/schema.js";
import { bearer, c3Cleanup, c3Ticket, c3Tag, c3User, type C3User } from "./tickets.fixtures.js";

const LIST_TAG = `${c3Tag()}-lst`;

describe("Ticket CRUD + final fields (TKT-01, TKT-02, FLD-01, FLD-02)", () => {
  let app: FastifyInstance;
  let admin: C3User;
  let analyst: C3User;

  const ticketIds: string[] = [];
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    admin = await c3User("ADMIN");
    analyst = await c3User("ANALYST");
    emails.push(admin.email, analyst.email);
  });

  afterAll(async () => {
    await c3Cleanup({ ticketIds, emails });
    await prisma.$disconnect();
  });

  describe("TKT-01: POST /tickets", () => {
    it("creates a MANUAL/OPEN CVE ticket with the structured fields and defaults", async () => {
      // Given: a valid VULNERABILITY_CVE payload and a WORK token
      const payload = {
        findingType: "VULNERABILITY_CVE",
        title: `${c3Tag()} OpenSSL regression`,
        cveIds: ["CVE-2026-1234", "CVE-2026-5678"],
        affectedProduct: "OpenSSL",
        affectedVersions: "3.0 - 3.2",
        mitigation: "Upgrade to 3.3",
      };

      // When: the ticket is created
      const res = await app.inject({
        method: "POST",
        url: "/tickets",
        headers: { authorization: bearer(analyst, app) },
        payload,
      });

      // Then: 201 with MANUAL origin, OPEN status, AMBER default and empty references
      expect(res.statusCode).toBe(201);
      const body = TicketSchema.parse(res.json());
      ticketIds.push(body.id);
      expect(body.origin).toBe("MANUAL");
      expect(body.status).toBe("OPEN");
      expect(body.tlp).toBe("AMBER");
      expect(body.cveIds).toEqual(payload.cveIds);
      expect(body.affectedProduct).toBe(payload.affectedProduct);
      expect(body.mitigation).toBe(payload.mitigation);
      expect(body.references).toEqual([]);
    });

    it("creates THREAT_CAMPAIGN and OTHER tickets via the discriminated union", async () => {
      // Given: one payload per remaining finding type
      const threat = await app.inject({
        method: "POST",
        url: "/tickets",
        headers: { authorization: bearer(analyst, app) },
        payload: { findingType: "THREAT_CAMPAIGN", title: `${c3Tag()} campaign`, threatName: "BearBunch" },
      });
      const other = await app.inject({
        method: "POST",
        url: "/tickets",
        headers: { authorization: bearer(analyst, app) },
        payload: { findingType: "OTHER", title: `${c3Tag()} misc` },
      });

      // Then: both 201 with the right findingType and threatName placement
      expect(threat.statusCode).toBe(201);
      const threatBody = TicketSchema.parse(threat.json());
      ticketIds.push(threatBody.id);
      expect(threatBody.findingType).toBe("THREAT_CAMPAIGN");
      expect(threatBody.threatName).toBe("BearBunch");
      expect(other.statusCode).toBe(201);
      const otherBody = TicketSchema.parse(other.json());
      ticketIds.push(otherBody.id);
      expect(otherBody.findingType).toBe("OTHER");
    });

    it("rejects a CVE ticket without cveIds with 400 VALIDATION", async () => {
      // Given: a VULNERABILITY_CVE payload missing cveIds
      const payload = { findingType: "VULNERABILITY_CVE", title: "no cves" };

      // When: the ticket is created
      const res = await app.inject({
        method: "POST",
        url: "/tickets",
        headers: { authorization: bearer(analyst, app) },
        payload,
      });

      // Then: 400 VALIDATION
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    });

    it("rejects an unauthenticated create with 401", async () => {
      // Given/When: POST /tickets without a token
      const res = await app.inject({ method: "POST", url: "/tickets", payload: { findingType: "OTHER", title: "x" } });

      // Then: 401 UNAUTHORIZED
      expect(res.statusCode).toBe(401);
      expect((res.json() as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("TKT-02: list, detail, update", () => {
    it("lists tickets with q/status/origin/findingType filters and paging", async () => {
      // Given: three tickets sharing a tag prefix but differing in status/type
      const a = await c3Ticket({ title: `${LIST_TAG} zeta one`, status: "CLOSED", findingType: "VULNERABILITY_CVE" });
      const b = await c3Ticket({ title: `${LIST_TAG} zeta two`, findingType: "THREAT_CAMPAIGN" });
      const c = await c3Ticket({ title: `${LIST_TAG} zeta three` });
      ticketIds.push(a.id, b.id, c.id);

      // When: the list is queried with each filter
      const all = await app.inject({
        method: "GET",
        url: `/tickets?q=${LIST_TAG}`,
        headers: { authorization: bearer(analyst, app) },
      });
      const closed = await app.inject({
        method: "GET",
        url: `/tickets?q=${LIST_TAG}&status=CLOSED`,
        headers: { authorization: bearer(analyst, app) },
      });
      const cve = await app.inject({
        method: "GET",
        url: `/tickets?q=${LIST_TAG}&findingType=VULNERABILITY_CVE`,
        headers: { authorization: bearer(analyst, app) },
      });
      const page2 = await app.inject({
        method: "GET",
        url: `/tickets?q=${LIST_TAG}&page=2&pageSize=2`,
        headers: { authorization: bearer(analyst, app) },
      });

      // Then: envelope shape and each filter scope to exactly the matching set
      const allBody = all.json() as { items: unknown[]; total: number; page: number; pageSize: number };
      expect(all.statusCode).toBe(200);
      expect(allBody.total).toBe(3);
      expect(allBody.items).toHaveLength(3);
      expect((closed.json() as { items: unknown[] }).items).toHaveLength(1);
      expect((cve.json() as { items: unknown[] }).items).toHaveLength(1);
      const page2Body = page2.json() as { items: unknown[]; total: number; page: number; pageSize: number };
      expect(page2Body.total).toBe(3);
      expect(page2Body.page).toBe(2);
      expect(page2Body.pageSize).toBe(2);
      expect(page2Body.items).toHaveLength(1);
    });

    it("returns detail with sources/iocs/pendingSuggestions and updates working title", async () => {
      // Given: a ticket
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);

      // When: the detail is fetched, the title patched, and an empty patch attempted
      const detail = await app.inject({
        method: "GET",
        url: `/tickets/${ticket.id}`,
        headers: { authorization: bearer(analyst, app) },
      });
      const renamed = await app.inject({
        method: "PATCH",
        url: `/tickets/${ticket.id}`,
        headers: { authorization: bearer(analyst, app) },
        payload: { title: `${c3Tag()} renamed` },
      });
      const emptyPatch = await app.inject({
        method: "PATCH",
        url: `/tickets/${ticket.id}`,
        headers: { authorization: bearer(analyst, app) },
        payload: {},
      });

      // Then: detail carries the aggregate keys, rename persists, empty patch is 400
      expect(detail.statusCode).toBe(200);
      const detailBody = TicketDetailSchema.parse(detail.json());
      expect(detailBody.sources).toEqual([]);
      expect(detailBody.iocs).toEqual([]);
      expect(detailBody.pendingSuggestions).toBe(0);
      expect(renamed.statusCode).toBe(200);
      expect((renamed.json() as { title: string }).title).toBe(`${c3Tag()} renamed`);
      expect(emptyPatch.statusCode).toBe(400);
    });

    it("returns 404 for an unknown ticket", async () => {
      // Given: a nonexistent uuid
      const missing = randomUUID();

      // When: detail is requested
      const res = await app.inject({
        method: "GET",
        url: `/tickets/${missing}`,
        headers: { authorization: bearer(analyst, app) },
      });

      // Then: 404 NOT_FOUND
      expect(res.statusCode).toBe(404);
      expect((res.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
    });
  });

  describe("FLD-01/FLD-02: PATCH /tickets/:id/fields", () => {
    it("FLD-01: patches the final fields and persists them", async () => {
      // Given: a ticket and a full final-fields payload
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);
      const payload = {
        overview: "Targeted phishing wave",
        description: "Credential harvesting against staff portals",
        recommendations: "Enforce MFA, rotate credentials",
        references: ["https://example.com/advisory", "https://example.com/patch"],
        tlp: "RED",
      };

      // When: the fields patch is applied
      const res = await app.inject({
        method: "PATCH",
        url: `/tickets/${ticket.id}/fields`,
        headers: { authorization: bearer(admin, app) },
        payload,
      });

      // Then: 200 with every field persisted
      expect(res.statusCode).toBe(200);
      const body = TicketSchema.parse(res.json());
      expect(body.overview).toBe(payload.overview);
      expect(body.description).toBe(payload.description);
      expect(body.recommendations).toBe(payload.recommendations);
      expect(body.references).toEqual(payload.references);
      expect(body.tlp).toBe("RED");
      const row = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      expect(row?.tlp).toBe("RED");
      expect(row?.overview).toBe(payload.overview);
    });

    it("FLD-01: partial patch changes only the given field", async () => {
      // Given: a ticket whose final fields were set, then a tlp-only patch
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);
      await app.inject({
        method: "PATCH",
        url: `/tickets/${ticket.id}/fields`,
        headers: { authorization: bearer(admin, app) },
        payload: { overview: `${c3Tag()} original overview`, tlp: "AMBER" },
      });

      // When: only tlp is patched
      const res = await app.inject({
        method: "PATCH",
        url: `/tickets/${ticket.id}/fields`,
        headers: { authorization: bearer(admin, app) },
        payload: { tlp: "GREEN" },
      });

      // Then: tlp changed, overview untouched
      expect(res.statusCode).toBe(200);
      const body = res.json() as { tlp: string; overview: string | null };
      expect(body.tlp).toBe("GREEN");
      expect(body.overview).toBe(`${c3Tag()} original overview`);
    });

    it("FLD-02: rejects a bad tlp value with 400 VALIDATION", async () => {
      // Given: a ticket and an off-enum tlp
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);

      // When: tlp "ORANGE" is patched
      const res = await app.inject({
        method: "PATCH",
        url: `/tickets/${ticket.id}/fields`,
        headers: { authorization: bearer(admin, app) },
        payload: { tlp: "ORANGE" },
      });

      // Then: 400 VALIDATION
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    });

    it("rejects an empty fields patch with 400", async () => {
      // Given: a ticket
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);

      // When: an empty object is patched
      const res = await app.inject({
        method: "PATCH",
        url: `/tickets/${ticket.id}/fields`,
        headers: { authorization: bearer(admin, app) },
        payload: {},
      });

      // Then: 400 VALIDATION
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    });
  });
});
