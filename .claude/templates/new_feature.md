# New Feature Implementation Checklist

> Copy this checklist for each new feature task. Work through it sequentially — do not skip sections.

## Before Starting

- [ ] Task is defined in `TASK_QUEUE.md` with clear acceptance criteria
- [ ] All dependencies for this task are marked DONE
- [ ] Relevant PRD and technical docs have been read
- [ ] Current test suite passes (`make test` or stack-equivalent — see `ENVIRONMENT_GUIDE.md`)
- [ ] Active environment identified and confirmed as `development` (check `APP_ENV`, see `ENVIRONMENT_GUIDE.md`)

---

## Design

- [ ] Feature scope is clearly understood — list all files to be created or modified:
  - Files to create: <!-- list here -->
  - Files to modify: <!-- list here -->
- [ ] Edge cases identified and documented (empty input, max size, concurrent access, etc.)
- [ ] Security implications identified before implementation begins (input handling, auth, data exposure)
- [ ] If this requires a new dependency or schema change: confirm with user first — do not proceed without explicit approval
- [ ] If this requires a new dependency: vulnerability check performed and logged in `DECISIONS_LOG.md` (e.g., `npm audit`, `pip-audit`, `govulncheck`)

---

## Implementation

- [ ] Code written following `CODING_STANDARDS.md` (naming, error handling, docs, style)
- [ ] Error handling implemented for all failure paths — no silent swallows, no leaked internals
- [ ] Logging added where appropriate — no sensitive data logged (no secrets, tokens, PII in logs)

---

## Security Review

- [ ] No secrets, tokens, or credentials hardcoded anywhere in new code (including tests and fixtures)
- [ ] All external input validated and sanitized at the boundary layer (handler/controller) before business logic
- [ ] Auth and permission checks enforced — default deny posture confirmed; every new route is protected unless explicitly public
- [ ] Any new dependency checked for known vulnerabilities and logged in `DECISIONS_LOG.md` with tool output
- [ ] No sensitive data exposed in logs, error messages, or API responses (no stack traces to client)
- [ ] `.env.example` updated if new environment variables were introduced (with placeholder values and comments)
- [ ] Behavior verified correct in both `development` and `production` environment configs (no debug leakage, correct env-var wiring)

---

## Testing

- [ ] Unit tests written for all new logic
- [ ] Integration test written if the feature touches external systems (DB, API, queue)
- [ ] All tests pass (new + existing) — run full suite, not just new tests
- [ ] Tests are isolated and not flaky — no dependency on execution order or shared mutable state

---

## Completion

- [ ] `TASK_QUEUE.md` updated — task marked DONE
- [ ] `CURRENT_STATUS.md` updated with session summary (what was built, what remains)
- [ ] `DECISIONS_LOG.md` updated if any significant decision was made (dependency choice, pattern introduced, trade-off)
- [ ] Relevant docs updated if behavior changed (README, API contract, architecture doc)
- [ ] Self-update: if this feature established new patterns, update `CODING_STANDARDS.md` / `SECURITY_STANDARDS.md` / `ENVIRONMENT_GUIDE.md` accordingly
