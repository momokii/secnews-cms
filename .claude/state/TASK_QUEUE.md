# Task Queue — Ordered Implementation Backlog

> This backlog is empty pending the first user instruction.
> The agent must populate this file once the project goals and PRD are established.
> Use the template format below for every task added.

---

## Task Queue

_No tasks yet. The repository is in initialization phase — `.claude/` infrastructure has been scaffolded and the project awaits its first real task._

**Next action for the agent in the first working session:**

1. Gather project goals from the user (purpose, target users, core features, constraints).
2. Populate this queue with the initial backlog — ordered by priority and dependency.
3. Begin the highest-priority unblocked task using the appropriate template from `.claude/templates/`.

---

### Template Format (use for every task added)

Copy this block for each new task:

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

### Example (remove when real tasks are added)

| Field               | Value |
|---------------------|-------|
| Task ID             | TASK-001 |
| Name                | Define project purpose and tech stack |
| Priority            | High |
| Status              | TODO |
| Complexity          | S |
| Depends On          | — |
| Scope               | Decide language, framework, database, and deployment target with the user; document in DECISIONS_LOG.md and update README.md, CODING_STANDARDS.md, SECURITY_STANDARDS.md |
| Acceptance Criteria | DECISIONS_LOG.md has an entry for stack choice; README.md describes real project; CODING_STANDARDS.md contains stack-specific conventions |
| Security Concerns   | Dependency choices affect attack surface — vulnerability check for initial dependencies |

| Field               | Value |
|---------------------|-------|
| Task ID             | TASK-002 |
| Name                | Establish project skeleton and environment |
| Priority            | High |
| Status              | TODO |
| Complexity          | M |
| Depends On          | TASK-001 |
| Scope               | Scaffold project layout, Dockerfile, docker-compose.yml + overrides, .env.example, .gitignore, health-check endpoint, and test harness |
| Acceptance Criteria | `docker-compose up` starts app; `/health` returns 200; `make test` (or equivalent) passes; `.env` is gitignored |
| Security Concerns   | Non-root container user; no secrets in repo; no debug exposed in prod compose; .env gitignore verified |

---

## Queue Management Rules

- **Order by priority and dependency** — highest priority, unblocked tasks at the top.
- **One task IN PROGRESS at a time** — mark it `IN PROGRESS` when started, `DONE` or `BLOCKED` when finished.
- **Never start a task whose dependencies are not DONE.**
- **Log newly discovered tasks** immediately — do not do them inline without queuing.
- **Security concerns are mandatory** for every task — even if “None” with justification.
