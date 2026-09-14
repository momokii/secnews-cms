import {
  ANALYST_EMAIL,
  ANALYST_PASSWORD,
  api,
  expectError,
  loadState,
  ok,
  step,
} from "./lib.js";

/**
 * E2E-S4 RBAC: a second bootstrap → 409 CONFLICT (BST-01); an ANALYST token
 * creating a user (escalating to ADMIN) → 403 FORBIDDEN (USR-01 — only
 * ADMIN creates users).
 */

async function main(): Promise<void> {
  const admin = loadState();

  // Double bootstrap → 409 CONFLICT.
  const second = await api<unknown>("POST", "/bootstrap", {
    body: { name: "E2E Late Admin", email: "e2e-late-admin@secnews.test", password: "e2e-late-password-1" },
  });
  expectError(second, 409, "CONFLICT", "second bootstrap");
  step("double bootstrap → 409 CONFLICT");

  // ADMIN mints the analyst used for the escalation attempt.
  const created = await api<{ id: string; role: string }>("POST", "/users", {
    token: admin.token,
    body: { name: "E2E Analyst", email: ANALYST_EMAIL, password: ANALYST_PASSWORD, role: "ANALYST" },
  });
  ok(created.status === 201 && created.body.role === "ANALYST", "admin created the ANALYST", created.body);

  const analystLogin = await api<{ token: string; user: { role: string } }>("POST", "/auth/login", {
    body: { email: ANALYST_EMAIL, password: ANALYST_PASSWORD },
  });
  ok(analystLogin.status === 200 && analystLogin.body.user.role === "ANALYST", "analyst login → 200", analystLogin.body);

  // Analyst attempts analyst-create-admin → 403 FORBIDDEN.
  const escalation = await api<unknown>("POST", "/users", {
    token: analystLogin.body.token,
    body: { name: "E2E Rogue Admin", email: "e2e-rogue-admin@secnews.test", password: "e2e-rogue-password-1", role: "ADMIN" },
  });
  expectError(escalation, 403, "FORBIDDEN", "analyst creating an ADMIN user");
  const noRogue = await api<{ total: number }>("GET", `/users?q=e2e-rogue-admin`, { token: admin.token });
  ok(noRogue.status === 200 && noRogue.body.total === 0, "no user row was created by the 403 call", noRogue.body);
  step("analyst-create-admin → 403 FORBIDDEN");

  console.log("E2E-S4 PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
