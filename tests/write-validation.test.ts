import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearerFor, cleanupTicket, cleanupUsers, createTestSuggestion, createTestTicket } from "./helpers.js";
import { findInvalidCveIds, iocValueProblem } from "../src/modules/tickets/validation.js";

/**
 * TASK-VALID write-path validation (data-corruption incidents):
 *  - accept stored cveIds ["N/A"] → every tickets read 500'd on the response
 *    regex ^CVE-\d{4}-\d{4,}$ — suggestion accept, PATCH fields and create
 *    must all reject invalid CVE ids with 422 VALIDATION naming the value;
 *  - an IOC stored as IPV6 with an IPv4 literal → OTX push 400 upstream —
 *    IOC writes validate value-vs-type (the push pre-check lives in
 *    upstream-error-detail.test.ts).
 */

describe("TASK-VALID pure validators", () => {
  it("findInvalidCveIds names only the offending entries", () => {
    expect(findInvalidCveIds(["CVE-2026-1234", "N/A", "cve-2026-1", "CVE-2026-12345"])).toEqual([
      "N/A",
      "cve-2026-1",
    ]);
    expect(findInvalidCveIds([])).toEqual([]);
  });

  it("iocValueProblem rejects type/value mismatches and accepts valid pairs", () => {
    // The incident: an IPv4 literal stored as IPV6
    expect(iocValueProblem("IPV6", "184.154.245.42")).toMatch(/IPv6/);
    expect(iocValueProblem("IPV6", "184.154.245.42")).toContain("184.154.245.42");
    // And the inverse
    expect(iocValueProblem("IPV4", "2001:db8::1")).toMatch(/IPv4/);
    expect(iocValueProblem("IPV4", "10.10.10.10")).toBeNull();
    expect(iocValueProblem("IPV6", "2001:db8::1")).toBeNull();
    // DOMAIN must be a hostname, not an IP literal shape
    expect(iocValueProblem("DOMAIN", "evil.com")).toBeNull();
    expect(iocValueProblem("DOMAIN", "184.154.245.42")).toMatch(/hostname/);
    // URL must parse as http(s)
    expect(iocValueProblem("URL", "https://kelanach.xyz/payload")).toBeNull();
    expect(iocValueProblem("URL", "not a url")).toMatch(/URL/);
    expect(iocValueProblem("URL", "ftp://kelanach.xyz/x")).toMatch(/http/);
    // EMAIL
    expect(iocValueProblem("EMAIL", "phish@kelanach.xyz")).toBeNull();
    expect(iocValueProblem("EMAIL", "phish-at-example")).toMatch(/email/);
    // Hash digests: hex with the exact length
    expect(iocValueProblem("MD5", "0123456789abcdef0123456789abcdef")).toBeNull();
    expect(iocValueProblem("MD5", "0123456789abcdef")).toMatch(/MD5/);
    expect(iocValueProblem("SHA1", "0123456789abcdef0123456789abcdef01234567")).toBeNull();
    expect(iocValueProblem("SHA1", "zz")).toMatch(/SHA1/);
    expect(iocValueProblem("SHA256", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")).toBeNull();
    expect(iocValueProblem("SHA256", "0123")).toMatch(/SHA256/);
    // CIDR must parse with a matching prefix length
    expect(iocValueProblem("CIDR", "10.10.10.0/24")).toBeNull();
    expect(iocValueProblem("CIDR", "10.10.10.0/33")).toMatch(/CIDR/);
    expect(iocValueProblem("CIDR", "10.10.10.0")).toMatch(/CIDR/);
    expect(iocValueProblem("CIDR", "2001:db8::/32")).toBeNull();
    // Free-form types stay free-form
    expect(iocValueProblem("FILEPATH", "anything at all")).toBeNull();
    expect(iocValueProblem("MUTEX", "Global\\evil")).toBeNull();
    expect(iocValueProblem("OTHER", "unmappable")).toBeNull();
  });
});

describe("TASK-VALID CVE write guards", () => {
  let app: FastifyInstance;
  let analyst = "";

  beforeAll(async () => {
    app = await buildApp();
    analyst = await bearerFor(app, "ANALYST");
  });

  afterAll(async () => {
    await prisma.aiSuggestion.deleteMany({});
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("accepting a cveIds suggestion with an invalid id is 422 VALIDATION, stays PENDING, and never merges", async () => {
    // Given: a ticket without cveIds and a PENDING suggestion suggesting "N/A"
    const ticketId = await createTestTicket({ cveIds: [] });
    const suggestionId = await createTestSuggestion(ticketId, {
      field: "cveIds",
      currentValue: null,
      suggestedValue: "N/A",
    });

    // When: the suggestion is accepted
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/suggestions/${suggestionId}/accept`,
      headers: { authorization: analyst },
    });

    // Then: 422 VALIDATION naming the bad value and explaining edit-or-reject
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toContain("N/A");
    expect(body.error.message).toContain("reject");

    // And: the suggestion stays PENDING and the ticket is untouched
    const row = await prisma.aiSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
    expect(row.status).toBe("PENDING");
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.cveIds).toEqual([]);
    await cleanupTicket(ticketId);
  });

  it("PATCH /tickets/:id/fields with an invalid cveIds entry is 422 VALIDATION naming the value", async () => {
    // Given: an existing ticket
    const ticketId = await createTestTicket({ cveIds: ["CVE-2026-1111"] });

    // When: its fields are patched with a garbage CVE id
    const res = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticketId}/fields`,
      headers: { authorization: analyst },
      payload: { cveIds: ["CVE-2026-2222", "N/A"] },
    });

    // Then: 422 VALIDATION naming the bad value, ticket unchanged
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toContain("N/A");
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.cveIds).toEqual(["CVE-2026-1111"]);
    await cleanupTicket(ticketId);
  });

  it("PATCH /tickets/:id/fields with valid cveIds still writes them (200)", async () => {
    // Given: an existing ticket
    const ticketId = await createTestTicket({ cveIds: [] });

    // When: its fields are patched with valid CVE ids
    const res = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticketId}/fields`,
      headers: { authorization: analyst },
      payload: { cveIds: ["CVE-2026-3333"] },
    });

    // Then: 200 and the value is stored — valid flows are untouched
    expect(res.statusCode).toBe(200);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.cveIds).toEqual(["CVE-2026-3333"]);
    await cleanupTicket(ticketId);
  });

  it("POST /tickets with an invalid cveIds entry is 422 VALIDATION naming the value", async () => {
    // When: a VULNERABILITY_CVE ticket is created with a garbage CVE id
    const res = await app.inject({
      method: "POST",
      url: "/tickets",
      headers: { authorization: analyst },
      payload: { findingType: "VULNERABILITY_CVE", title: "VALID create guard", cveIds: ["N/A"] },
    });

    // Then: 422 VALIDATION naming the bad value
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toContain("N/A");
  });
});

describe("TASK-VALID IOC value-vs-type validation", () => {
  let app: FastifyInstance;
  let analyst = "";

  beforeAll(async () => {
    app = await buildApp();
    analyst = await bearerFor(app, "ANALYST");
  });

  afterAll(async () => {
    await cleanupUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it("POST ioc with type IPV6 and an IPv4 literal value is 400 VALIDATION naming the problem", async () => {
    // Given: a ticket
    const ticketId = await createTestTicket();

    // When: the exact incident payload is written (IPv4 literal as IPV6)
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/iocs`,
      headers: { authorization: analyst },
      payload: { type: "IPV6", value: "184.154.245.42", includeInBulletin: true },
    });

    // Then: 400 VALIDATION naming type, problem, and value
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION");
    expect(res.body).toContain("184.154.245.42");
    await cleanupTicket(ticketId);
  });

  it("POST ioc with type IPV4 and an IPv6 literal is 400; valid pairs stay 201", async () => {
    // Given: a ticket
    const ticketId = await createTestTicket();

    // When: the inverse mismatch is written, then two valid IOCs
    const bad = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/iocs`,
      headers: { authorization: analyst },
      payload: { type: "IPV4", value: "2001:db8::1", includeInBulletin: true },
    });
    const goodIp = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/iocs`,
      headers: { authorization: analyst },
      payload: { type: "IPV6", value: "2001:db8::1", includeInBulletin: true },
    });
    const goodDomain = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/iocs`,
      headers: { authorization: analyst },
      payload: { type: "DOMAIN", value: "evil.com", includeInBulletin: true },
    });

    // Then: the mismatch is rejected and valid flows are untouched
    expect(bad.statusCode).toBe(400);
    expect(goodIp.statusCode).toBe(201);
    expect(goodDomain.statusCode).toBe(201);
    await cleanupTicket(ticketId);
  });

  it("PATCH ioc value to one that contradicts the stored type is 400 VALIDATION", async () => {
    // Given: a ticket with a valid IPV6 IOC
    const ticketId = await createTestTicket();
    const created = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/iocs`,
      headers: { authorization: analyst },
      payload: { type: "IPV6", value: "2001:db8::1", includeInBulletin: true },
    });
    const iocId = (created.json() as { id: string }).id;

    // When: its value is patched to an IPv4 literal
    const res = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticketId}/iocs/${iocId}`,
      headers: { authorization: analyst },
      payload: { value: "184.154.245.42" },
    });

    // Then: 400 VALIDATION naming the problem, IOC unchanged
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VALIDATION");
    const row = await prisma.ioc.findUniqueOrThrow({ where: { id: iocId } });
    expect(row.value).toBe("2001:db8::1");
    await cleanupTicket(ticketId);
  });
});
