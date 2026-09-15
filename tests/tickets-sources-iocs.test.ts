import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { IocType } from "../src/generated/prisma/enums.js";
import { prisma } from "../src/lib/db.js";
import { IocSchema, TicketSourceSchema } from "../src/modules/tickets/schema.js";
import { bearer, c3Cleanup, c3Tag, c3Ticket, c3User, type C3User } from "./tickets.fixtures.js";

describe("Ticket sources + IOCs (SRC-01, IOC-01..03)", () => {
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

  function auth(user: C3User): { authorization: string } {
    return { authorization: bearer(user, app) };
  }

  describe("SRC-01: ticket sources", () => {
    it("creates a source by url and by note, lists them, deletes one", async () => {
      // Given: a ticket and a WORK token
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);

      // When: a url source, a note source, and an empty source are posted
      const byUrl = await app.inject({
        method: "POST",
        url: `/tickets/${ticket.id}/sources`,
        headers: auth(analyst),
        payload: { url: "https://example.com/vuln-advisory" },
      });
      const byNote = await app.inject({
        method: "POST",
        url: `/tickets/${ticket.id}/sources`,
        headers: auth(analyst),
        payload: { note: "internal ticketing ref SEC-1234" },
      });
      const empty = await app.inject({
        method: "POST",
        url: `/tickets/${ticket.id}/sources`,
        headers: auth(analyst),
        payload: {},
      });

      // Then: both valid sources are 201 with provenance, the empty one is 400
      expect(byUrl.statusCode).toBe(201);
      const urlBody = TicketSourceSchema.parse(byUrl.json());
      expect(urlBody.url).toBe("https://example.com/vuln-advisory");
      expect(urlBody.note).toBeNull();
      expect(urlBody.ticketId).toBe(ticket.id);
      expect(urlBody.createdById).toBe(analyst.id);
      expect(byNote.statusCode).toBe(201);
      expect(TicketSourceSchema.parse(byNote.json()).note).toBe("internal ticketing ref SEC-1234");
      expect(empty.statusCode).toBe(400);

      // When: the detail is fetched and the first source deleted
      const detailBefore = await app.inject({
        method: "GET",
        url: `/tickets/${ticket.id}`,
        headers: auth(analyst),
      });
      const removed = await app.inject({
        method: "DELETE",
        url: `/tickets/${ticket.id}/sources/${String(urlBody.id)}`,
        headers: auth(analyst),
      });
      const detailAfter = await app.inject({
        method: "GET",
        url: `/tickets/${ticket.id}`,
        headers: auth(analyst),
      });

      // Then: 204, and the detail no longer lists the removed source
      expect(removed.statusCode).toBe(204);
      expect((detailBefore.json() as { sources: unknown[] }).sources).toHaveLength(2);
      expect((detailAfter.json() as { sources: unknown[] }).sources).toHaveLength(1);
    });

    it("returns 404 deleting an already-deleted source", async () => {
      // Given: a source that was just deleted
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);
      const created = await app.inject({
        method: "POST",
        url: `/tickets/${ticket.id}/sources`,
        headers: auth(analyst),
        payload: { note: "to be removed" },
      });
      const sourceId = TicketSourceSchema.parse(created.json()).id;
      const first = await app.inject({
        method: "DELETE",
        url: `/tickets/${ticket.id}/sources/${sourceId}`,
        headers: auth(analyst),
      });
      expect(first.statusCode).toBe(204);

      // When: the same source is deleted again
      const second = await app.inject({
        method: "DELETE",
        url: `/tickets/${ticket.id}/sources/${sourceId}`,
        headers: auth(analyst),
      });

      // Then: 404 NOT_FOUND
      expect(second.statusCode).toBe(404);
      expect((second.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
    });

    it("rejects an unauthenticated source create with 401", async () => {
      // Given: a ticket and no token
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);

      // When: the source is posted anonymously
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticket.id}/sources`,
        payload: { note: "anon" },
      });

      // Then: 401 UNAUTHORIZED
      expect(res.statusCode).toBe(401);
      expect((res.json() as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("IOC-01: create with 12 types and default includeInBulletin", () => {
    /** Valid value per type — IOC writes validate value-vs-type (TASK-VALID). */
    const VALID_IOC_VALUES: Record<string, string> = {
      DOMAIN: "evil.example",
      IPV4: "10.10.10.10",
      IPV6: "2001:db8::1",
      URL: "https://kelanach.example/payload",
      EMAIL: "phish@kelanach.example",
      MD5: "0123456789abcdef0123456789abcdef",
      SHA1: "0123456789abcdef0123456789abcdef01234567",
      SHA256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      FILEPATH: "C:\\Windows\\Temp\\payload.exe",
      MUTEX: "Global\\payload",
      CIDR: "10.10.10.0/24",
      OTHER: "unmappable-artifact",
    };

    it("creates one IOC per IocType, defaulting includeInBulletin to true", async () => {
      // Given: a ticket and a WORK token
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);

      // When: one IOC per canonical type is created
      const responses = await Promise.all(
        (Object.values(IocType) as string[]).map((type) =>
          app.inject({
            method: "POST",
            url: `/tickets/${ticket.id}/iocs`,
            headers: auth(analyst),
            payload: { type, value: VALID_IOC_VALUES[type] },
          }),
        ),
      );

      // Then: every type is accepted with includeInBulletin true
      for (const res of responses) {
        expect(res.statusCode).toBe(201);
        const body = IocSchema.parse(res.json());
        expect(body.includeInBulletin).toBe(true);
        expect(body.context).toBeNull();
        expect(body.createdById).toBe(analyst.id);
      }
      expect(responses).toHaveLength(12);
    });

    it("creates an IPV4 IOC with context and origin supplied", async () => {
      // Given: a ticket
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);

      // When: an IOC with optional fields is created
      const res = await app.inject({
        method: "POST",
        url: `/tickets/${ticket.id}/iocs`,
        headers: auth(analyst),
        payload: { type: "IPV4", value: "203.0.113.10", context: "C2 beacon", origin: "sandbox" },
      });

      // Then: 201 carrying the optional fields
      expect(res.statusCode).toBe(201);
      const body = IocSchema.parse(res.json());
      expect(body.context).toBe("C2 beacon");
      expect(body.origin).toBe("sandbox");
    });
  });

  it("IOC-02: rejects an unknown IocType with 400 VALIDATION", async () => {
    // Given: a ticket
    const ticket = await c3Ticket();
    ticketIds.push(ticket.id);

    // When: an off-enum type is posted
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticket.id}/iocs`,
      headers: auth(analyst),
      payload: { type: "ROOTKIT", value: "anything" },
    });

    // Then: 400 VALIDATION
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
  });

  describe("IOC-03: uniqueness, update, delete", () => {
    it("rejects a duplicate (ticket, type, value) with 409 CONFLICT", async () => {
      // Given: an existing IOC on a ticket
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);
      const payload = { type: "DOMAIN", value: `${c3Tag()}-evil.example` };
      const first = await app.inject({
        method: "POST",
        url: `/tickets/${ticket.id}/iocs`,
        headers: auth(analyst),
        payload,
      });
      expect(first.statusCode).toBe(201);

      // When: the same (type, value) is posted again
      const second = await app.inject({
        method: "POST",
        url: `/tickets/${ticket.id}/iocs`,
        headers: auth(analyst),
        payload,
      });

      // Then: 409 CONFLICT
      expect(second.statusCode).toBe(409);
      expect((second.json() as { error: { code: string } }).error.code).toBe("CONFLICT");
    });

    it("patches value/includeInBulletin, then deletes and 404s on repeat", async () => {
      // Given: an existing IOC
      const ticket = await c3Ticket();
      ticketIds.push(ticket.id);
      const created = await app.inject({
        method: "POST",
        url: `/tickets/${ticket.id}/iocs`,
        headers: auth(analyst),
        payload: { type: "SHA256", value: "a".repeat(64) },
      });
      const iocId = IocSchema.parse(created.json()).id;

      // When: it is patched (bulletin off, then value change), deleted, and deleted again
      const bulletinOff = await app.inject({
        method: "PATCH",
        url: `/tickets/${ticket.id}/iocs/${iocId}`,
        headers: auth(analyst),
        payload: { includeInBulletin: false },
      });
      const newValue = "b".repeat(64);
      const valueChanged = await app.inject({
        method: "PATCH",
        url: `/tickets/${ticket.id}/iocs/${iocId}`,
        headers: auth(analyst),
        payload: { value: newValue },
      });
      const emptyPatch = await app.inject({
        method: "PATCH",
        url: `/tickets/${ticket.id}/iocs/${iocId}`,
        headers: auth(analyst),
        payload: {},
      });
      const removed = await app.inject({
        method: "DELETE",
        url: `/tickets/${ticket.id}/iocs/${iocId}`,
        headers: auth(analyst),
      });
      const repeat = await app.inject({
        method: "DELETE",
        url: `/tickets/${ticket.id}/iocs/${iocId}`,
        headers: auth(analyst),
      });

      // Then: patches persist, empty patch is 400, delete is 204 then 404
      expect(bulletinOff.statusCode).toBe(200);
      expect((bulletinOff.json() as { includeInBulletin: boolean }).includeInBulletin).toBe(false);
      expect(valueChanged.statusCode).toBe(200);
      expect((valueChanged.json() as { value: string }).value).toBe(newValue);
      expect(emptyPatch.statusCode).toBe(400);
      expect(removed.statusCode).toBe(204);
      expect(repeat.statusCode).toBe(404);
    });
  });
});
