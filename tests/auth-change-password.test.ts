import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { BCRYPT_ROUNDS } from "../src/modules/users/service.js";
import { prisma } from "../src/lib/db.js";

/**
 * TASK-O1 FIX-1 — POST /auth/change-password (self-service, ANY role):
 * 401 without a token, 401 on wrong currentPassword (timing-equalized like
 * login), 204 on success with the old password invalidated. Own fixtures and
 * rate-limit IP buckets; never wipes other suites' user rows.
 */

const USER = {
  name: "CP User",
  email: "cp-user@secnews.test",
  password: "cp-original-pass-1",
} as const;

const NEW_PASSWORD = "cp-rotated-pass-1";

// Distinct rate-limit buckets (login is 5/min/IP).
const IP = {
  noToken: "10.8.1.1",
  initial: "10.8.1.2",
  wrong: "10.8.1.3",
  old: "10.8.1.4",
  rotated: "10.8.1.5",
} as const;

async function loginAs(
  app: FastifyInstance,
  ip: string,
  password: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    remoteAddress: ip,
    payload: { email: USER.email, password },
  });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

describe("TASK-O1 FIX-1 change-password", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await prisma.user.deleteMany({ where: { email: USER.email } });
    await prisma.user.create({
      data: {
        name: USER.name,
        email: USER.email,
        passwordHash: bcrypt.hashSync(USER.password, BCRYPT_ROUNDS),
        role: "ANALYST",
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: USER.email } });
    await prisma.$disconnect();
    await app.close();
  });

  it("CP-01: returns 401 UNAUTHORIZED without a token", async () => {
    // Given: a booted app and no Authorization header
    // When: POST /auth/change-password
    const res = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      remoteAddress: IP.noToken,
      payload: { currentPassword: USER.password, newPassword: NEW_PASSWORD },
    });

    // Then: 401 with the UNAUTHORIZED envelope code
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
  });

  it("CP-02: returns 401 UNAUTHORIZED when currentPassword is wrong, hash untouched", async () => {
    // Given: a valid token for the fixture user
    const login = await loginAs(app, IP.initial, USER.password);
    expect(login.statusCode).toBe(200);
    const { token } = login.body as { token: string };

    // When: change-password with a wrong currentPassword
    const res = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      remoteAddress: IP.wrong,
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: "not-the-current-password", newPassword: NEW_PASSWORD },
    });

    // Then: 401 UNAUTHORIZED and the stored hash still verifies the old password
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
    const row = await prisma.user.findUniqueOrThrow({ where: { email: USER.email } });
    expect(bcrypt.compareSync(USER.password, row.passwordHash)).toBe(true);
  });

  it("CP-03: returns 204, old password stops working, new password logs in", async () => {
    // Given: a valid token for the fixture user
    const login = await loginAs(app, IP.initial, USER.password);
    expect(login.statusCode).toBe(200);
    const { token } = login.body as { token: string };

    // When: change-password with the correct currentPassword
    const res = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      remoteAddress: IP.initial,
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: USER.password, newPassword: NEW_PASSWORD },
    });

    // Then: 204 empty body
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");

    // And: the old password is rejected, the new one logs in
    const oldLogin = await loginAs(app, IP.old, USER.password);
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await loginAs(app, IP.rotated, NEW_PASSWORD);
    expect(newLogin.statusCode).toBe(200);
    expect((newLogin.body as { user: { email: string } }).user.email).toBe(USER.email);
  });
});
