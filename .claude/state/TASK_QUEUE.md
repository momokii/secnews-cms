# Task Queue — Ordered Implementation Backlog

> Tasks ship as git commits prefixed `TASK-<NAME>` (see `git log --oneline`); this queue tracks what is queued/next, while `CURRENT_STATUS.md` records what is done.

---

## Task Queue

| Field               | Value |
|---------------------|-------|
| Task ID             | TASK-DOCS |
| Name                | Repo docs + env cleanup (Integration-menu reality) |
| Priority            | High |
| Status              | DONE |
| Complexity          | S |
| Depends On          | TASK-INTGS, TASK-COMPOSE |
| Scope               | `.env.example` drops `WAHA_*`/`SMTP_*` (Integration menu is DB-backed, encrypted); README Deploy explains one-click setup, compose files (base + prod overlay = db+api+web under `secnews-cms-prod`), auto-migrations, in-app SMTP/WAHA, and the empty-`docker compose ps` gotcha; `.claude` state files reflect the current stack |
| Acceptance Criteria | Docs consistent with code (senders keep env fallback); no unrelated sections touched; tests green |
| Security Concerns   | None — docs only; secure defaults (encrypted credentials, gitignored .env) remain documented |

_No further tasks queued. Add new work as `TASK-*` table entries here, ordered by dependency._

---

### Template Format (use for every task added)

| Field               | Value                                               |
|---------------------|-----------------------------------------------------|
| Task ID             | TASK-001                                            |
| Name                | [Task name]                                         |
| Priority            | High / Medium / Low                                 |
| Status              | TODO / IN PROGRESS / DONE / BLOCKED                 |
| Complexity          | S / M / L                                           |
| Depends On          | [Task IDs this task requires to be done first]      |
| Scope               | [Exact description of what must be built]           |
| Acceptance Criteria | [What "done" looks like, measurable]                |
| Security Concerns   | [Any security considerations specific to this task] |

---

## Queue Management Rules

- **Order by priority and dependency** — highest priority, unblocked tasks at the top.
- **One task IN PROGRESS at a time** — mark it `IN PROGRESS` when started, `DONE` or `BLOCKED` when finished.
- **Never start a task whose dependencies are not DONE.**
- **Log newly discovered tasks** immediately — do not do them inline without queuing.
- **Security concerns are mandatory** for every task — even if “None” with justification.
