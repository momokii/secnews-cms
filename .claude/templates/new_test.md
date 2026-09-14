# New Test Scenario Checklist

> Copy this checklist for each new test scenario. Work through it sequentially — do not skip sections.

## Before Starting

- [ ] Test objective clearly defined — what specific behavior is being verified (one behavior per test)
- [ ] Test type identified: `unit` / `integration` / `end-to-end` / `load`
- [ ] Test environment is functional — run health check / startup command (see `HOW_TO_RESUME.md` Step 9)
- [ ] Active environment confirmed — **load and destructive tests must never run against `staging` or `production`**; verify `APP_ENV` before running

---

## Implementation

- [ ] Test file follows this project's naming and folder conventions (see `CODING_STANDARDS.md`; update that file if conventions are not yet defined)
- [ ] Test is isolated — no dependency on external shared state unless intentional and documented; no reliance on execution order
- [ ] No real secrets or credentials used in test fixtures — use test doubles, factories, and fake data (e.g., `test@example.com`, `sk_test_fake`)
- [ ] Setup and teardown handled cleanly — resources created in setup are cleaned up in teardown; no leaked state between tests
- [ ] Assertions are specific and meaningful — assert observable outcomes and exact expectations, not just “no error thrown”
  - Bad: `expect(result).toBeDefined()`
  - Good: `expect(result.status).toBe(200); expect(result.body.user.email).toBe("test@example.com")`

---

## Completion

- [ ] Test passes reliably — run it at least 3 times to confirm no flakiness:
  ```bash
  # Example — adapt to stack
  for i in 1 2 3; do make test -- -run TestName; done
  # or: for i in 1 2 3; do npm test -- --testNamePattern="should do X"; done
  ```
- [ ] Test is included in the standard test suite run — `make test` (or equivalent) picks it up without extra flags
- [ ] `CURRENT_STATUS.md` updated with session summary (what was tested, outcome)
- [ ] If this test revealed a gap in standards, update `CODING_STANDARDS.md` or `SECURITY_STANDARDS.md` accordingly
