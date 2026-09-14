import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";
import { bearer, c3Cleanup, c3Tag, c3User, type C3User } from "./tickets.fixtures.js";

describe("GET /tickets date filters", () => {
  let app: FastifyInstance;
  let analyst: C3User;
  const ticketIds: string[] = [];
  const tag = c3Tag();

  beforeAll(async () => {
    app = await buildApp();
    analyst = await c3User("ANALYST");
    for (const [suffix, createdAt] of [
      ["before", "2026-01-10T00:00:00.000Z"],
      ["inside", "2026-02-10T00:00:00.000Z"],
      ["after", "2026-03-10T00:00:00.000Z"],
    ] as const) {
      const ticket = await prisma.ticket.create({
        data: {
          title: `${tag} ${suffix}`,
          summary: `${tag} summary`,
          origin: "MANUAL",
          status: "OPEN",
          findingType: "OTHER",
          createdAt: new Date(createdAt),
        },
        select: { id: true },
      });
      ticketIds.push(ticket.id);
    }
  });

  afterAll(async () => {
    await c3Cleanup({ ticketIds, emails: [analyst.email] });
    await app.close();
    await prisma.$disconnect();
  });

  it("narrows results to the inclusive createdAt range", async () => {
    // Given: three tagged tickets created in January, February, and March
    // When: the list is queried for February through March
    const response = await app.inject({
      method: "GET",
      url: `/tickets?q=${tag}&from=2026-02-01&to=2026-02-28`,
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: only the February ticket remains
    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((item: { title: string }) => item.title)).toEqual([
      `${tag} inside`,
    ]);
  });

  it("rejects an invalid date with 400 VALIDATION", async () => {
    // Given: an authenticated list request
    // When: from is not an ISO date or datetime
    const response = await app.inject({
      method: "GET",
      url: `/tickets?q=${tag}&from=not-a-date`,
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: the boundary reports validation failure
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
  });

  it("rejects a range whose from is after to with 400 VALIDATION", async () => {
    // Given: an authenticated list request
    // When: the lower bound is later than the upper bound
    const response = await app.inject({
      method: "GET",
      url: `/tickets?q=${tag}&from=2026-03-01&to=2026-02-01`,
      headers: { authorization: bearer(analyst, app) },
    });

    // Then: the boundary reports validation failure
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
  });
});
