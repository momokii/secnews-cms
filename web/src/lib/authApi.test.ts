import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorMessage, login } from "./authApi";
import { clearToken, getToken, getUser, setToken, setUser } from "./tokenStore";

/** EXACT wire shape the Fastify API answers for POST /auth/login —
 * backend Prisma PKs are String uuid() on all 12 models, so user.id is a
 * uuid string and extra fields (active/createdAt/lastLoginAt) ride along. */
const BACKEND_LOGIN_PAYLOAD = {
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.kelana-session.sig",
  user: {
    id: "c528cea2-f3e7-4673-8def-37ac36981adf",
    name: "kelana",
    email: "kelana@protergo.id",
    role: "ADMIN",
    active: true,
    createdAt: "2026-09-14T06:04:11.435Z",
    lastLoginAt: null,
  },
};

describe("REG-UUID-01: login parses the real backend uuid payload", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
  });

  it("accepts the exact login payload: token passes through and user.id is the uuid string", async () => {
    // Given: the backend answers POST /auth/login with uuid-string user ids
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(BACKEND_LOGIN_PAYLOAD), { status: 200 }),
        ),
    );

    // When: login() submits valid credentials
    const result = await login("kelana@protergo.id", "correct horse");

    // Then: the token passes through and user.id keeps its uuid string shape
    expect(result.token).toBe(BACKEND_LOGIN_PAYLOAD.token);
    expect(result.user.id).toBe("c528cea2-f3e7-4673-8def-37ac36981adf");
    expect(result.user.email).toBe("kelana@protergo.id");
    expect(result.user.name).toBe("kelana");
    expect(result.user.role).toBe("ADMIN");
  });

  it("stores the uuid-shaped session user from the exact payload", async () => {
    // Given: the exact backend payload on the wire
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(BACKEND_LOGIN_PAYLOAD), { status: 200 }),
        ),
    );
    const result = await login("kelana@protergo.id", "correct horse");
    // LoginPage stores the session after a successful login.
    setToken(result.token);
    setUser(result.user);

    // When: the session user is read back from localStorage
    const stored = getUser();

    // Then: the uuid id survives the store round-trip
    expect(stored).not.toBeNull();
    expect(stored?.id).toBe("c528cea2-f3e7-4673-8def-37ac36981adf");
    expect(getToken()).toBe(BACKEND_LOGIN_PAYLOAD.token);
  });

  it("rejects a payload whose id is not a string", async () => {
    // Given: a legacy payload still carrying a numeric id
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            token: "t",
            user: { id: 1, name: "kelana", email: "kelana@protergo.id", role: "ADMIN" },
          }),
          { status: 200 },
        ),
      ),
    );

    // When: login() parses it
    const error = await login("kelana@protergo.id", "x").then(
      () => null,
      (e: unknown) => e,
    );

    // Then: the strict id check rejects the numeric id
    expect(apiErrorMessage(error)).toBe("Invalid user response");
  });
});
