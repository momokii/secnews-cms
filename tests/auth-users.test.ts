import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/db.js";

/**
 * TASK-C1 — Surface 1: auth, bootstrap, users (RBAC).
 * One shared app, sequential tests: each `it` is a state step of one scenario
 * (bootstrap → login → RBAC). Unique remoteAddress per test isolates
 * rate-limit buckets keyed by IP.
 */

const ADMIN = {
  name: "C1 Boot Admin",
  email: "c1-admin@secnews.test",
  password: "c1-admin-password",
} as const;

const ANALYST = {
  name: "C1 Analyst",
  email: "c1-analyst@secnews.test",
  password: "c1-analyst-password",
  role: "ANALYST",
} as const;

const EDITOR = {
  name: "C1 Editor",
  email: "c1-editor@secnews.test",
  password: "c1-editor-password",
  role: "EDITOR",
} as const;

// Distinct rate-limit buckets (keyed by IP) so login attempts never collide.
const IP = {
  boot: "10.9.0.1",
  noToken: "10.9.0.2",
  badCred: "10.9.0.3",
  okLogin: "10.9.0.4",
  flood: "10.9.0.5",
  analyst: "10.9.0.6",
  analystCreate: "10.9.0.7",
} as const;

const JUNIOR_ANALYST_EMAIL = "c1-junior-analyst@secnews.test";
const EDITOR_ATTEMPT_EMAIL = "c1-analyst-editor-attempt@secnews.test";

function loginBody(email: string, password: string): { email: string; password: string } {
  return { email, password };
}

async function loginAs(
  app: FastifyInstance,
  ip: string,
  email: string,
  password: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    remoteAddress: ip,
    payload: loginBody(email, password),
  });
  return { statusCode: res.statusCode, body: res.json() as Record<string, unknown> };
}

describe("TASK-C1 auth/bootstrap/users", () => {
  let app: FastifyInstance;
  let adminToken = "";

  beforeAll(async () => {
    app = await buildApp();
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [ADMIN.email, ANALYST.email, EDITOR.email, JUNIOR_ANALYST_EMAIL, EDITOR_ATTEMPT_EMAIL],
        },
      },
    });
    await prisma.$disconnect();
    await app.close();
  });

  // BST-01 (S4) — first-run bootstrap creates the only ADMIN; a second call conflicts.
  it("BST-01: bootstraps the first ADMIN when users table is empty", async () => {
    // Given: an empty users table
    expect(await prisma.user.count()).toBe(0);

    // When: bootstrap runs with admin credentials
    const res = await app.inject({
      method: "POST",
      url: "/bootstrap",
      remoteAddress: IP.boot,
      payload: ADMIN,
    });

    // Then: 201 with an ADMIN user and a usable token; no password material leaks
    expect(res.statusCode).toBe(201);
    const body = res.json() as { user: { role: string; email: string }; token: string };
    expect(body.user.role).toBe("ADMIN");
    expect(body.user.email).toBe(ADMIN.email);
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(res.body).not.toContain(ADMIN.password);
    adminToken = body.token;
    expect(app.jwt.verify(adminToken)).toMatchObject({ email: ADMIN.email });
  });

  it("BST-01 (S4): rejects a second bootstrap with 409 CONFLICT", async () => {
    // Given: one user already exists from the bootstrap above
    expect(await prisma.user.count()).toBeGreaterThan(0);

    // When: bootstrap runs again with any payload
    const res = await app.inject({
      method: "POST",
      url: "/bootstrap",
      remoteAddress: IP.boot,
      payload: { name: "Second", email: "c1-second@secnews.test", password: "second-pass-123" },
    });

    // Then: 409 with the CONFLICT envelope code
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe("CONFLICT");
  });

  // AUTH-01 — app boots and protected routes reject unauthenticated calls.
  it("AUTH-01: returns 401 UNAUTHORIZED envelope on /auth/me without a token", async () => {
    // Given: a booted app and no Authorization header
    // When: GET /auth/me
    const res = await app.inject({ method: "GET", url: "/auth/me", remoteAddress: IP.noToken });

    // Then: 401 with the UNAUTHORIZED envelope code
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
  });

  it("AUTH-01: returns 401 on /auth/me with a garbage token", async () => {
    // Given: a malformed bearer token
    // When: GET /auth/me with it
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      remoteAddress: IP.noToken,
      headers: { authorization: "Bearer not-a-jwt" },
    });

    // Then: 401
    expect(res.statusCode).toBe(401);
  });

  it("AUTH-02: returns 401 for correct email with wrong password", async () => {
    // Given: the bootstrapped admin account exists
    // When: login with the right email but a wrong password
    const { statusCode, body } = await loginAs(app, IP.badCred, ADMIN.email, "wrong-password");

    // Then: 401 UNAUTHORIZED, no token issued
    expect(statusCode).toBe(401);
    expect((body as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
    expect(body).not.toHaveProperty("token");
  });

  it("AUTH-03: logs in with valid credentials and returns a JWT + public user", async () => {
    // Given: the bootstrapped admin account
    // When: login with correct credentials
    const { statusCode, body } = await loginAs(
      app,
      IP.okLogin,
      ADMIN.email,
      ADMIN.password,
    ) as { statusCode: number; body: { token: string; user: { email: string } } };

    // Then: 200, verifiable JWT {sub, email}, public user without password material
    expect(statusCode).toBe(200);
    const payload = app.jwt.verify(body.token) as { sub: string; email: string };
    expect(payload.email).toBe(ADMIN.email);
    expect(typeof payload.sub).toBe("string");
    expect(body.user.email).toBe(ADMIN.email);
    expect(body.user).not.toHaveProperty("passwordHash");
    adminToken = body.token;
  });

  it("AUTH-04: rate-limits /auth/login to 5/min/IP with 429", async () => {
    // Given: one fresh IP bucket and the login endpoint's 5/min limit
    // When: 6 login attempts in a row (all with wrong credentials)
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        remoteAddress: IP.flood,
        payload: loginBody(ADMIN.email, `flood-attempt-${i}`),
      });
      statuses.push(res.statusCode);
    }

    // Then: the first five attempts fail with 401, the sixth is 429
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  // AUTH-05 — /me reflects the authenticated identity's role.
  it("AUTH-05: GET /auth/me returns the admin identity with its role", async () => {
    // Given: a valid admin token from AUTH-03
    // When: GET /auth/me with the bearer token
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      remoteAddress: IP.okLogin,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // Then: 200 with the public user shape, ADMIN role, no password material
    expect(res.statusCode).toBe(200);
    const body = res.json() as { role: string; email: string };
    expect(body.role).toBe("ADMIN");
    expect(body.email).toBe(ADMIN.email);
    expect(body).not.toHaveProperty("passwordHash");
  });

  it("AUTH-05: GET /auth/status reports needsBootstrap=false after bootstrap", async () => {
    // Given: at least one user exists
    // When: GET /auth/status (public)
    const res = await app.inject({ method: "GET", url: "/auth/status", remoteAddress: IP.noToken });

    // Then: needsBootstrap is false
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ needsBootstrap: false });
  });

  // USR-01 (S4) — an ANALYST token must never be able to mint an ADMIN.
  it("USR-01: ADMIN creates an ANALYST (201), whose create-ADMIN attempt is 403", async () => {
    // Given: an authenticated ADMIN
    const created = await app.inject({
      method: "POST",
      url: "/users",
      remoteAddress: IP.okLogin,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: ANALYST,
    });
    expect(created.statusCode).toBe(201);

    // When: the ANALYST logs in and tries to create an ADMIN user
    const analystLogin = await loginAs(app, IP.analyst, ANALYST.email, ANALYST.password) as {
      statusCode: number;
      body: { token: string };
    };
    expect(analystLogin.statusCode).toBe(200);
    const res = await app.inject({
      method: "POST",
      url: "/users",
      remoteAddress: IP.analyst,
      headers: { authorization: `Bearer ${analystLogin.body.token}` },
      payload: { name: "Escalated", email: "c1-escalated@secnews.test", password: "escalate-123", role: "ADMIN" },
    });

    // Then: 403 FORBIDDEN and no user was created
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    expect(await prisma.user.count({ where: { email: "c1-escalated@secnews.test" } })).toBe(0);

    // And: the ANALYST's /me shows its own role (AUTH-05 cross-check)
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      remoteAddress: IP.analyst,
      headers: { authorization: `Bearer ${analystLogin.body.token}` },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { role: string }).role).toBe("ANALYST");
  });

  it("USR-02: ADMIN creates an EDITOR with 201 and public shape", async () => {
    // Given: an authenticated ADMIN
    // When: POST /users with an EDITOR payload
    const res = await app.inject({
      method: "POST",
      url: "/users",
      remoteAddress: IP.okLogin,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: EDITOR,
    });

    // Then: 201, EDITOR role, active, no password material anywhere
    expect(res.statusCode).toBe(201);
    const body = res.json() as { role: string; email: string; active: boolean };
    expect(body.role).toBe("EDITOR");
    expect(body.email).toBe(EDITOR.email);
    expect(body.active).toBe(true);
    expect(body).not.toHaveProperty("passwordHash");
    expect(res.body).not.toContain(EDITOR.password);
  });

  it("USR-03: ADMIN lists users with working pagination", async () => {
    // Given: three users exist (admin, analyst, editor)
    // When: GET /users?page=1&pageSize=2 and then page=2
    const page1 = await app.inject({
      method: "GET",
      url: "/users?page=1&pageSize=2",
      remoteAddress: IP.okLogin,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const page2 = await app.inject({
      method: "GET",
      url: "/users?page=2&pageSize=2",
      remoteAddress: IP.okLogin,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // Then: correct page envelope; page 2 holds the remaining user; no plaintext passwords
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json() as { items: unknown[]; total: number; page: number; pageSize: number };
    expect(body1.page).toBe(1);
    expect(body1.pageSize).toBe(2);
    expect(body1.items).toHaveLength(2);
    const dbTotal = await prisma.user.count();
    expect(body1.total).toBe(dbTotal);

    expect(page2.statusCode).toBe(200);
    const body2 = page2.json() as { items: Array<{ email: string; createdAt: string; updatedAt: string }>; total: number };
    expect(body2.items).toHaveLength(dbTotal - 2);
    const emails1 = (body1.items as Array<{ email: string }>).map((u) => u.email);
    expect(emails1).not.toContain(body2.items.map((u) => u.email)[0]);
    expect(page1.body).not.toContain(ADMIN.password);
    expect(page2.body).not.toContain(EDITOR.password);

    // And: every listed row carries ISO createdAt and updatedAt timestamps
    type ListedUser = { createdAt: string; updatedAt: string };
    for (const item of [...(body1.items as ListedUser[]), ...(body2.items as ListedUser[])]) {
      expect(new Date(item.createdAt).toISOString()).toBe(item.createdAt);
      expect(new Date(item.updatedAt).toISOString()).toBe(item.updatedAt);
    }
  });

  // USR-04 (§4) — ANALYST may create ANALYST users; omitted role → ANALYST.
  it("USR-04: ANALYST creates an ANALYST with role omitted → 201 role ANALYST", async () => {
    // Given: an authenticated ANALYST (from USR-01)
    const analystLogin = await loginAs(app, IP.analystCreate, ANALYST.email, ANALYST.password) as {
      statusCode: number;
      body: { token: string };
    };
    expect(analystLogin.statusCode).toBe(200);

    // When: POST /users without a role field
    const res = await app.inject({
      method: "POST",
      url: "/users",
      remoteAddress: IP.analystCreate,
      headers: { authorization: `Bearer ${analystLogin.body.token}` },
      payload: { name: "Junior Analyst", email: JUNIOR_ANALYST_EMAIL, password: "junior-pass-123" },
    });

    // Then: 201 and the created user's role is ANALYST (omitted → ANALYST)
    expect(res.statusCode).toBe(201);
    expect((res.json() as { role: string; email: string }).role).toBe("ANALYST");
    const row = await prisma.user.findUniqueOrThrow({ where: { email: JUNIOR_ANALYST_EMAIL } });
    expect(row.role).toBe("ANALYST");
  });

  // USR-05 (§4) — ANALYST attempting any non-ANALYST role is 403, no row.
  it("USR-05: ANALYST attempting role EDITOR → 403 FORBIDDEN and no row", async () => {
    // Given: an authenticated ANALYST
    const analystLogin = await loginAs(app, IP.analystCreate, ANALYST.email, ANALYST.password) as {
      statusCode: number;
      body: { token: string };
    };
    expect(analystLogin.statusCode).toBe(200);

    // When: POST /users with role EDITOR
    const res = await app.inject({
      method: "POST",
      url: "/users",
      remoteAddress: IP.analystCreate,
      headers: { authorization: `Bearer ${analystLogin.body.token}` },
      payload: {
        name: "Escalated Editor",
        email: EDITOR_ATTEMPT_EMAIL,
        password: "escalate-123",
        role: "EDITOR",
      },
    });

    // Then: 403 FORBIDDEN and no user row was created
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    expect(await prisma.user.count({ where: { email: EDITOR_ATTEMPT_EMAIL } })).toBe(0);
  });
});
