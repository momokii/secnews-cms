# Bug Fix Checklist

> Copy this checklist for each bug fix task. Work through it sequentially — reproduce first, then diagnose, then fix.

## Reproduce First

- [ ] Bug is reproducible — repro steps documented before touching any code:
  - Steps to reproduce: <!-- list exact steps -->
  - Environment: <!-- APP_ENV, branch, commit, data setup -->
  - Repro command / request: <!-- curl, test, or manual steps -->
- [ ] Expected behavior clearly stated: <!-- what should happen -->
- [ ] Actual broken behavior clearly stated: <!-- what actually happens, with error output -->
- [ ] Active environment confirmed — reproduction performed in `development` only (never reproduce destructive bugs against staging/production)

---

## Root Cause Analysis

- [ ] Root cause identified and documented before any fix is applied — explain *why* the bug occurs, not just *where*
- [ ] Checked whether the same bug exists in related areas of the codebase — search for similar patterns (same validation, same auth check, same query)
- [ ] Assessed whether the bug has security implications (data exposure, auth bypass, injection risk, privilege escalation) — if **yes**, escalate to user immediately before proceeding and mark task as security-sensitive

---

## Fix

- [ ] Minimal, targeted fix applied — no opportunistic refactoring in the same change (refactoring belongs in a separate task)
- [ ] Fix resolves only the stated bug — no scope creep, no extra behavior changes
- [ ] Fix does not introduce new behavior beyond resolving the specific bug — verify diff is narrowly scoped

---

## Verification

- [ ] Bug is no longer reproducible with the fix applied — re-run the exact repro steps and confirm correct behavior
- [ ] Regression test written and passing — a test that would have caught this bug before the fix, now green
- [ ] Full test suite passes — no regressions introduced (`make test` or equivalent)

---

## Completion

- [ ] `DECISIONS_LOG.md` updated if root cause revealed an important insight (pattern to avoid, convention to add, dependency to replace)
- [ ] `CURRENT_STATUS.md` updated with session summary (bug, root cause, fix, verification)
- [ ] `TASK_QUEUE.md` updated — task marked DONE
- [ ] If the bug revealed a standards gap, update `CODING_STANDARDS.md` or `SECURITY_STANDARDS.md` to prevent recurrence
