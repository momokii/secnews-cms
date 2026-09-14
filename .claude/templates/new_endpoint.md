# New API Endpoint Checklist

> Copy this checklist for each new API endpoint task. Work through it sequentially — do not skip sections.

## Before Starting

- [ ] Endpoint is defined in the API contract doc (if it exists) — method, path, request/response schema, auth requirements
- [ ] HTTP method, route, and expected behavior are clear (including status codes)
- [ ] Auth requirements are understood — is this public, authenticated, or role-restricted?
- [ ] Active environment identified and confirmed as `development` (check `APP_ENV`, see `ENVIRONMENT_GUIDE.md`)

---

## Implementation

- [ ] Route registered in the router/controller layer following existing project patterns
- [ ] Handler function created following existing patterns (separate handler from business logic)
- [ ] Input validation implemented — reject malformed requests before any logic runs (schema validation at boundary)
- [ ] Business logic separated from handler layer — handlers delegate to services/use-cases, not inline logic
- [ ] Correct HTTP status codes returned for all success and error cases (200/201/204 for success, 400 for validation, 401 for auth, 403 for permission, 404 for not found, 500 for server error)
- [ ] Error responses follow the project's standard error envelope (consistent shape across endpoints — no ad-hoc formats)
- [ ] No internal error details or stack traces exposed in error responses — generic message to client, detail logged server-side
- [ ] Caching layer integrated if applicable and consistent with existing patterns (cache key, TTL, invalidation)

---

## Security Review

- [ ] No secrets, tokens, or credentials hardcoded anywhere in new code (including tests and fixtures)
- [ ] All external input validated and sanitized at the boundary layer — query params, body, headers, path params
- [ ] Auth and permission checks enforced on all protected routes — default deny; verify middleware ordering
- [ ] Any new dependency checked for known vulnerabilities and logged in `DECISIONS_LOG.md` with tool output
- [ ] No sensitive data exposed in logs, error messages, or API responses (no stack traces, no internal paths)
- [ ] `.env.example` updated if new environment variables were introduced (with placeholder values and comments)
- [ ] Behavior verified correct in both `development` and `production` environment configs (auth enforced in both, no debug leakage)

---

## Testing

- [ ] Happy path test written — valid request returns expected status and body
- [ ] Input validation failure cases tested — malformed body, missing required fields, wrong types, boundary values
- [ ] Auth/permission edge cases tested — unauthenticated, wrong role, expired token, missing token
- [ ] All tests pass (new + existing) — run full suite

---

## Completion

- [ ] API contract documentation updated (route, method, schemas, auth, status codes, examples)
- [ ] `CURRENT_STATUS.md` and `TASK_QUEUE.md` updated (task marked DONE, session summary)
- [ ] `DECISIONS_LOG.md` updated if any significant decision was made (e.g., new auth pattern, caching strategy)
- [ ] Self-update: if this endpoint established new patterns, update `CODING_STANDARDS.md` / `SECURITY_STANDARDS.md` accordingly
