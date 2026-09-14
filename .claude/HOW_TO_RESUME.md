# How to Resume — Step-by-Step Protocol for Every New Session

> **Read this file immediately after `.claude/README.md` in any new session. Do not skip steps.**

This protocol ensures any agent — even one arriving with zero prior context — can orient itself and begin contributing correctly within minutes.

---

## Resume Protocol — 11 Steps

### Step 1: Read `.claude/README.md`
**Purpose:** Orient yourself — understand the project, stack, and structure.

- Canonical order is `README.md → HOW_TO_RESUME.md (this file) → state`. If you arrived here via `README.md` (the entry point per `README.md` Step 0), this step is already complete — verify you understood the orientation sequence and self-update directive, then proceed to Step 2.
- If you jumped directly to this file, read `README.md` now before continuing.
- Understand what the repository is, its current phase, and where to find everything.
- Note the orientation sequence and self-update directive.
- If README is still generic placeholder, you are in early-phase — expect to define the stack.

---

### Step 2: Read `.claude/state/CURRENT_STATUS.md`
**Purpose:** Know exactly what is done, in progress, and blocked.

- Understand the project phase, completed items, in-progress tasks, blockers, and open questions.
- Note the last session summary and timestamp — this tells you where the previous agent left off.
- If CURRENT_STATUS says “Awaiting first project task”, this is your first real working session.

---

### Step 3: Read `.claude/state/TASK_QUEUE.md`
**Purpose:** Identify the next task and confirm its dependencies are met.

- Find the highest-priority TODO task whose dependencies are DONE.
- Confirm acceptance criteria and security concerns for that task.
- If the queue is empty/placeholder, populate it with the user’s current goals before starting work.

---

### Step 4: Read `.claude/AGENT_RULES.md`
**Purpose:** Re-internalize all behavioral rules before touching anything.

- Session-start, during-implementation, security, environment-awareness, session-end, self-maintenance, and escalation rules.
- These are non-negotiable — internalize them before writing any code.

---

### Step 5: Read `.claude/CODING_STANDARDS.md`
**Purpose:** Re-internalize all conventions before writing any code.

- General principles, naming conventions, error handling, testing, documentation, style, and version control hygiene.
- Once the stack is known this file will contain language-specific guidance — follow it strictly.

---

### Step 6: Read `.claude/SECURITY_STANDARDS.md`
**Purpose:** Re-internalize all security requirements before writing any code.

- Secrets management, environment config, input validation, auth, dependency security, container security, and output security.
- Consult this file before implementing any feature involving input, auth, external services, or data storage.

---

### Step 7: Identify the Active Environment
**Purpose:** Know which environment you are operating in before running any command.

- Check `APP_ENV` or equivalent (`NODE_ENV`, `ENV`, etc. — see `ENVIRONMENT_GUIDE.md`).
- Inspect `.env` and Compose files if present.
- Consult `ENVIRONMENT_GUIDE.md` if in doubt.
- **If the environment is `staging` or `production`, switch to plan-first mode** — present written plans and receive confirmation before executing any change.

---

### Step 8: Read Task-Relevant Docs
**Purpose:** Gather context directly relevant to the current task.

- PRD section, architecture doc, API contract, design mockups, or any doc directly relevant to the next task in the queue.
- If no task-relevant docs exist yet (early-phase), confirm scope with the user before assuming.

---

### Step 9: Verify the Environment Is Functional
**Purpose:** Confirm the working environment is healthy before writing any code.

- Run the project's health-check or startup command.
- **Placeholders (replace with real commands once known):**
  ```bash
  # Docker-based project
  docker-compose config --quiet && echo "Compose config OK"
  docker-compose up -d --build
  curl -f http://localhost:3000/health && echo "Health OK"

  # Non-Docker project — use the stack-appropriate start
  make dev        # or: npm run dev | go run ./... | python manage.py runserver | cargo run
  ```
- If the environment is not functional, fix or report it before proceeding. Update `CURRENT_STATUS.md` with the blocker.
- **Update this step in this file with the real command once it is known** — the next agent will thank you.

---

### Step 10: Confirm No Regressions
**Purpose:** Establish a clean baseline before writing new code.

- Run the existing test suite before writing any new code.
- **Placeholders (replace with real command once known):**
  ```bash
  make test       # or: npm test | go test ./... | pytest | cargo test | bundle exec rspec
  ```
- If tests fail on a clean checkout, document the failure in `CURRENT_STATUS.md` and fix or escalate before proceeding.
- **Update this step in this file with the real test command once it is known.**

---

### Step 11: Begin the Task
**Purpose:** Implement, test, review, and report.

- Implement the next task from `TASK_QUEUE.md` following all standards and templates.
- Use the appropriate checklist from `.claude/templates/` for the task type.
- Flow: **Implement → Test → Security review → Update state files → Report**.
- At session end, execute the **Session End** checklist from `AGENT_RULES.md` — update all state and docs.

---

## Quick Reference Card

Canonical entry is `README.md (Step 0) → HOW_TO_RESUME.md (this file, Step 1 protocol) → state → standards`. If you started at README.md, README step is already complete.

```
1  README.md           → Orient (Step 0 entry, already done if via README)
2  HOW_TO_RESUME.md (this file) → Resume protocol (you are here, Step 1)
3  CURRENT_STATUS.md   → Know state
4  TASK_QUEUE.md       → Find next task
5  AGENT_RULES.md      → Rules
6  CODING_STANDARDS.md → Conventions
7  SECURITY_STANDARDS.md→ Security
8  ENVIRONMENT_GUIDE.md→ Which env?
9  Task docs           → Scope
10 Health check        → Env functional?
11 Test suite          → No regressions?
12 Begin               → Implement → Test → Review → Update state
```

---

## Self-Update Reminder

> After each working session, update the placeholder commands in Steps 9 and 10 with the real, verified commands for this project. The next agent’s ability to resume quickly depends on the accuracy of this file.

---

*This file is the canonical resume protocol and is aligned with `README.md` (entry point Step 0 → this file Step 1). Both define the same order `README.md → HOW_TO_RESUME.md → state → standards`. If any doc conflicts, this file’s detailed steps take precedence but the canonical order above must be preserved.*
