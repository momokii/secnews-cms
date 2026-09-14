import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";

/**
 * USR-06/07 — PATCH /users/:id self-demotion lockout. An ADMIN must not be
 * able to change their OWN role (a demoted admin could lock everyone out);
 * name/email edits on self stay allowed and other users' roles stay editable.
 */

type FixtureUser = { id: string; token: string };

describe("USR-06/07 PATCH /users/:id self-role lockout", () => {
  let app: FastifyInstance;
  const createdEmails: string[] = [];

  async function fixtureUser(role: "ADMIN" | "EDITOR"): Promise<FixtureUser> {
    const email = `usr-self-${role.toLowerCase()}-${randomUUID()}@secnews.test`;
    const user = await prisma.user.create({
      data: { email, name: `USR ${role}`, passwordHash: "not-a-real-hash", role },
      select: { id: true, email: true },
    });
    createdEmails.push(email);
    return { id: user.id, token: `Bearer ${app.jwt.sign({ sub: user.id, email: user.email })}` };
  }

  async function patch(
    token: string,
    targetId: string,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "PATCH",
      url: `/users/${targetId}`,
      remoteAddress: "10.9.1.1",
      headers: { authorization: token },
      payload,
    });
    return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
  }

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [...createdEmails] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it("USR-06: admin PATCHing their own role → 403 FORBIDDEN, role untouched in DB", async () => {
    // Given: an ADMIN row, still ADMIN in the DB
    const admin = await fixtureUser("ADMIN");

    // When: the admin PATCHes their own id with a different role
    const { statusCode, body } = await patch(admin.token, admin.id, { role: "ANALYST" });

    // Then: 403 with the FORBIDDEN envelope and the DB role is unchanged
    expect(statusCode).toBe(403);
    expect((body as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(after.role).toBe("ADMIN");
  });

  it("USR-06: admin PATCHing only their own name → 200 (self profile edits stay allowed)", async () => {
    // Given: an ADMIN row
    const admin = await fixtureUser("ADMIN");

    // When: the admin PATCHes their own id with a name-only payload
    const { statusCode, body } = await patch(admin.token, admin.id, { name: "USR Admin Renamed" });

    // Then: 200 and the name is updated in the DB, role untouched
    expect(statusCode).toBe(200);
    expect((body as { name: string }).name).toBe("USR Admin Renamed");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(after.name).toBe("USR Admin Renamed");
    expect(after.role).toBe("ADMIN");
  });

  it("USR-07: admin PATCHes another user's role → 200 and DB updated", async () => {
    // Given: an ADMIN and an EDITOR row
    const admin = await fixtureUser("ADMIN");
    const editor = await fixtureUser("EDITOR");

    // When: the admin PATCHes the editor's id with role ANALYST
    const { statusCode, body } = await patch(admin.token, editor.id, { role: "ANALYST" });

    // Then: 200 and the DB role changed
    expect(statusCode).toBe(200);
    expect((body as { role: string }).role).toBe("ANALYST");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: editor.id } });
    expect(after.role).toBe("ANALYST");
  });
});
