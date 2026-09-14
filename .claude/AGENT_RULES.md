# Agent Rules — Non-Negotiable Behavioral Rules

> **These rules apply in every session, without exception. Violations are blockers, not warnings.**

---

## 1. Session Start — Mandatory Before Any Action

You MUST execute these steps before doing anything else in a new session — canonical order is `README.md (Step 0) → HOW_TO_RESUME.md (Step 1) → state → standards`, consistent with `README.md` and `HOW_TO_RESUME.md`:

1. **Read `README.md`** (Step 0 entry point) — orient yourself: understand project, stack, structure, canonical orientation sequence, and self-update directive.
2. **Read `HOW_TO_RESUME.md`** immediately after `README.md` — canonical resume protocol and 11-step detailed procedure.
3. **Read `state/CURRENT_STATUS.md`** to understand the exact current state: what is done, in progress, and blocked.
4. **Read `state/TASK_QUEUE.md`** to identify the next task and confirm its dependencies are met.
5. **Read `CODING_STANDARDS.md`** — internalize conventions before writing any code.
6. **Read `SECURITY_STANDARDS.md`** — internalize all security requirements before writing any code.
7. **Identify the active environment and confirm the working environment is functional** before running any command — consult `ENVIRONMENT_GUIDE.md` if in doubt (check `APP_ENV` or equivalent), then run the project's health-check or startup command and verify it passes.

**Do not write code, run migrations, or modify configuration until all seven steps are complete.**

---

## 2. During Implementation

- **Never make changes outside the scope of the current task.** If you discover adjacent work, log it in `TASK_QUEUE.md` — do not do it inline.
- **Never delete or overwrite existing files without explicit instruction** from the user. When in doubt, ask.
- **Never introduce a new dependency, change a schema, or make an architectural decision without surfacing the proposal to the user and receiving explicit confirmation first.** Document the proposal in `DECISIONS_LOG.md`.
- **Always apply the zero-regression rule:** existing passing tests must remain passing after any change. Run the full test suite before and after your change.
- **Always follow the patterns and conventions in `CODING_STANDARDS.md`** — do not introduce new patterns without logging them in `DECISIONS_LOG.md` with rationale.

---

## 3. Security Rules — Non-Negotiable

- **Never write code that stores, logs, or exposes secrets, tokens, or credentials** in any form — not in source code, not in test fixtures, not in log output, not in error messages.
- **Always validate and sanitize all external input at the boundary layer** before it reaches any business logic. This includes HTTP request bodies, query parameters, headers, file uploads, and environment variables read at runtime.
- **Never implement an auth bypass "to be fixed later"** — incomplete auth is a blocker, not a deferrable item. If auth cannot be completed, raise it immediately and mark the task as BLOCKED.
- **Before adding any dependency, check for known vulnerabilities** using the appropriate tool for this stack (`npm audit`, `pip-audit`, `govulncheck`, `bundle audit`, etc.) and document the check in `DECISIONS_LOG.md`.
- **Consult `SECURITY_STANDARDS.md` before implementing any feature** involving input handling, authentication, external services, or data storage. No exceptions.

---

## 4. Environment Awareness Rules

- **Always identify the active environment before running any command.** Check `APP_ENV`, `.env`, or equivalent. Consult `ENVIRONMENT_GUIDE.md` when in doubt.
- **In `development`:** proceed with standard workflow. Verbose logging, debug tools, seed scripts, and hot reload are expected.
- **In `staging` or `production`:** present a **written plan** and receive **explicit confirmation** from the user before executing any change, migration, or destructive operation. Never execute directly.
- **Never expose debug ports, seed scripts, or development tooling in production configuration** — no database GUIs, profilers, or `DEBUG=true` in prod Compose or env.
- **Verify `.env` is properly gitignored before the first commit of any session.** Run `git check-ignore .env` or inspect `.gitignore`. If `.env` is not ignored, fix that first.
- **Consult `ENVIRONMENT_GUIDE.md`** when in doubt about environment-specific behavior. When the guide is ambiguous, ask the user.

---

## 5. Session End — Mandatory Before Closing

Before closing any session, you MUST:

1. **Update `state/CURRENT_STATUS.md`** with accurate current state and a session summary (what was done, what remains, blockers, timestamp).
2. **Update `state/TASK_QUEUE.md`** — mark completed tasks DONE, add newly discovered tasks with full template fields.
3. **Log any significant decision** made during the session in `state/DECISIONS_LOG.md` (rationale, alternatives rejected, security implications).
4. **Update `CODING_STANDARDS.md`** if new patterns or conventions were established.
5. **Update `SECURITY_STANDARDS.md`** if new security patterns were established or stack-specific security guidance was extended.
6. **Update `ENVIRONMENT_GUIDE.md`** if environment configuration changed (new services, ports, env vars, Compose overrides).
7. **Update `README.md`** if project-level context changed (purpose, stack, architecture, or orientation sequence).

**A session is not complete until state files reflect reality.**

---

## 6. Self-Maintenance Directive

- **As the project evolves, you must proactively update all `.claude/` files** to replace general content with accurate, project-specific content. This is not optional.
- **When a tech stack is determined:** update `CODING_STANDARDS.md` and `SECURITY_STANDARDS.md` immediately with stack-specific guidance (linting config, framework patterns, ORM injection prevention, etc.).
- **When architecture is decided:** update `README.md` with the real project description and log the decision in `DECISIONS_LOG.md`.
- **When Docker setup is established:** update `ENVIRONMENT_GUIDE.md` with real, verified commands — replace placeholder `docker-compose` examples with the actual commands that work.
- **Keeping `.claude/` accurate is part of every task**, not a separate task. Do it inline before closing the session.

---

## 7. Escalation Rule

- **When blocked, uncertain about scope, or facing a decision with significant architectural, security, or UX impact:** document the blocker in `CURRENT_STATUS.md` and ask the user rather than assume.
- Never guess at requirements that affect security, data integrity, or user-facing behavior.
- A documented blocker with a clear question is always preferable to an assumption that introduces risk.

---

## Enforcement

- These rules are **non-negotiable**. They are not guidelines or suggestions.
- If a rule conflicts with a user request, surface the conflict and ask for explicit direction — do not silently violate the rule.
- If you observe a prior session violated a rule, log it and remediate where possible.

*Self-update instruction: As the project acquires real conventions, extend this file with project-specific constraints (e.g., “never use raw SQL”, “all API responses must use envelope X”), but never remove or weaken the rules above.*
