# Universal Agent Infrastructure — Orientation Guide

> **First file any agent reads. Start here.**

## What This Repository Is

**SecNews CMS** — a security-news aggregation and operations platform: ingest security feeds, triage them into tickets, enrich with threat intel (OTX) and AI, then deliver bulletins via email / WhatsApp / Telegram.

- **Stack:** TypeScript on Node 22 — Fastify API (`src/`, Prisma 7 + PostgreSQL 16.4), React/Vite web UI (`web/`), Docker Compose v2 (dev override auto-merged; prod overlay runs db + api + web under project `secnews-cms-prod`; one-click via `scripts/setup-prod.sh`).
- **Key modules:** auth/bootstrap/users, tickets workflow + audit, feeds + ingest, OTX IOC sync, AI fill/enrich with prompt templates (revision history, placeholders), delivery channels, bulletin render, HTML email-template studio, research-notebook sources, Integrations menu (SMTP / WhatsApp / AI providers / threat intel — DB-backed, encrypted, masked, check-connection).
- **Agent-facing docs:** machine contract in `docs/API_CONTRACT.md` + `docs/STATES.md`; env/Compose truth in `.claude/ENVIRONMENT_GUIDE.md`; live state in `.claude/state/`.
- **Work tracking:** tasks ship as git commits prefixed `TASK-<NAME>`; current state lives in `.claude/state/CURRENT_STATUS.md`.

This README is a living document — update it whenever the stack, deployment, or module surface changes.

---

## Agent Orientation Sequence

Canonical order is **README.md (this file) → HOW_TO_RESUME.md → state → standards**. You are reading the entry point — this step is complete. Proceed to HOW_TO_RESUME.md next and continue in order. This resolves the circular reference between README and HOW_TO_RESUME: README is Step 0, HOW_TO_RESUME Step 1.

| Step | File | Purpose |
|------|------|---------|
| 0 | `.claude/README.md` (this file) | Entry point — you are here. Understand project, stack, and structure |
| 1 | `.claude/HOW_TO_RESUME.md` | Step-by-step resume protocol — the canonical session-start checklist |
| 2 | `.claude/state/CURRENT_STATUS.md` | Exact current state: done, in progress, blocked, open questions |
| 3 | `.claude/state/TASK_QUEUE.md` | Ordered backlog — identify the next task and its dependencies |
| 4 | `.claude/AGENT_RULES.md` | Non-negotiable behavioral rules for every session |
| 5 | `.claude/CODING_STANDARDS.md` | Conventions to follow before writing any code |
| 6 | `.claude/SECURITY_STANDARDS.md` | Security requirements — mandatory before any implementation |
| 7 | `.claude/ENVIRONMENT_GUIDE.md` | Environment definitions and how behavior differs per env |
| 8 | Task-relevant docs | PRD, architecture doc, API contract — anything directly relevant to the current task |

**Do not skip steps. Do not read out of order.** Each file builds on the previous one. If you jumped directly to HOW_TO_RESUME.md without starting here, read this file first and then resume at HOW_TO_RESUME Step 2.

---

## Where to Find Key Information

| Need | Location |
|------|----------|
| Current task state & backlog | `.claude/state/CURRENT_STATUS.md` and `.claude/state/TASK_QUEUE.md` |
| Architectural / product decisions | `.claude/state/DECISIONS_LOG.md` |
| Security requirements | `.claude/SECURITY_STANDARDS.md` |
| Environment behavior & Docker patterns | `.claude/ENVIRONMENT_GUIDE.md` |
| Behavioral rules (non-negotiable) | `.claude/AGENT_RULES.md` |
| Coding conventions | `.claude/CODING_STANDARDS.md` |
| Resume protocol | `.claude/HOW_TO_RESUME.md` |
| Task checklists (feature, endpoint, test, bug) | `.claude/templates/` |
| Tool permissions & agent settings | `.claude/settings.json` |

### Directory Layout

```
.claude/
├── settings.json        # Tool permissions and agent settings
├── README.md            # This file — master orientation doc
├── AGENT_RULES.md       # Non-negotiable behavioral rules
├── CODING_STANDARDS.md  # Best-practice coding standards (stack-agnostic)
├── SECURITY_STANDARDS.md# Security requirements — mandatory
├── ENVIRONMENT_GUIDE.md # Environment definitions & behavior per env
├── HOW_TO_RESUME.md     # Step-by-step resume protocol
├── state/
│   ├── CURRENT_STATUS.md# Living doc: done / in progress / blocked
│   ├── TASK_QUEUE.md    # Ordered implementation backlog
│   └── DECISIONS_LOG.md # Key decisions and rationale
└── templates/
    ├── new_feature.md   # Checklist for new features
    ├── new_endpoint.md  # Checklist for new API endpoints
    ├── new_test.md      # Checklist for new test scenarios
    └── bug_fix.md       # Checklist for bug fixes
```

---

## Self-Update Directive

> **After each working session, the agent MUST update this file and all other `.claude/` files to reflect new project-specific knowledge discovered.**

This is not optional — keeping `.claude/` accurate is part of every task (see `AGENT_RULES.md` Self-Maintenance Directive).

| Trigger | Action |
|---------|--------|
| Tech stack determined | Update `CODING_STANDARDS.md` and `SECURITY_STANDARDS.md` with stack-specific guidance immediately |
| Architecture decided | Update this README with real project description; log in `DECISIONS_LOG.md` |
| Docker setup established | Update `ENVIRONMENT_GUIDE.md` with real, verified commands |
| New conventions established | Update `CODING_STANDARDS.md` |
| New security patterns established | Update `SECURITY_STANDARDS.md` |
| Environment config changed | Update `ENVIRONMENT_GUIDE.md` |
| Project purpose clarified | Rewrite the “What This Repository Is” section above with accurate description |

---

## Evolution Note

The `.claude/` files began as stack-agnostic placeholders and have been refined into project-specific guidance as the stack became real. Remaining placeholder text (if any) is a bug: any agent that spots generic advice contradicting the actual stack (Fastify/Prisma/React/Compose) should fix it in the same session.

**The goal:** Zero manual re-briefing. Any Claude Code agent can drop in, read `.claude/README.md` → `HOW_TO_RESUME.md` → state files, and begin contributing immediately.

---

## Quick Links

- Resume protocol: [`HOW_TO_RESUME.md`](./HOW_TO_RESUME.md)
- Rules: [`AGENT_RULES.md`](./AGENT_RULES.md)
- Current status: [`state/CURRENT_STATUS.md`](./state/CURRENT_STATUS.md)
- Task queue: [`state/TASK_QUEUE.md`](./state/TASK_QUEUE.md)
- Decisions: [`state/DECISIONS_LOG.md`](./state/DECISIONS_LOG.md)

---

*Last updated: 2026-09-16 — rewritten with the real SecNews CMS stack (Fastify + Prisma 7 + React/Vite + Compose v2, DB-backed Integrations). Update after every working session.*
