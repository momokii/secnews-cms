# Decisions Log — Permanent Record of Key Decisions

> Updated by the agent whenever a significant decision is made. Entries below are reconstructed from git history (tasks ship as `TASK-*` commits); append, never delete.

---

## Decisions Log

---
**Decision:** Stack = TypeScript/Node 22, Fastify API + Prisma 7 + PostgreSQL 16.4, React/Vite web UI, Docker Compose v2 deploy
**Date:** 2026-09-14
**Context:** Security-news aggregation CMS needs a typed API with relational ticket/audit data and an SPA frontend, deployable from a clean clone.
**Rationale:** Single language across API and web; Fastify's schema-first validation (zod v4) matches the API-contract-as-code approach (`src/modules/*/schema.ts`); Prisma 7 gives typed DB access; Compose v2 keeps deploy to Docker alone.
**Alternatives Rejected:** Other frameworks/ORMs — contract tests + zod schemas are load-bearing here; pinned images (`node:22-alpine`, `postgres:16.4-alpine`, `nginx:stable-alpine`) for reproducibility.
**Security Implications:** Non-root container users (api uid 100, web uid 101); only `WEB_PORT` published in prod; secrets only via gitignored `.env`; `zod` parses every boundary payload.
**Impact:** `src/`, `web/`, `prisma/`, `docker-compose*.yml`, `docs/API_CONTRACT.md`; tasks A1–A2, B1.
---

---
**Decision:** SMTP, WAHA, AI providers and threat-intel keys are configured in-app via the Integrations menu — DB-backed, `ENCRYPTION_KEY`-encrypted at rest, masked on read, with `check-connection` probes; env vars (`SMTP_*`, `WAHA_*`) demoted to code-level fallback and removed from `.env.example`
**Date:** 2026-09-16
**Context:** Ops staff must rotate channel credentials without redeploys or shell access; per-env env vars leaked config into infrastructure.
**Rationale:** Encrypted DB rows (TASK-INTGS `de9e620`) let ADMINs add/edit/test integrations from the UI; senders fall back to env only when no DB row exists, so nothing breaks during migration.
**Alternatives Rejected:** Env-only config — requires container restart and file access; plaintext DB columns — unacceptable for SMTP/WAHA credentials.
**Security Implications:** `ENCRYPTION_KEY` (32+ byte hex) becomes critical — losing it makes stored credentials unrecoverable; API never returns raw secrets (masked); `check-connection` probes must not log secrets.
**Impact:** `.env.example`, README Deploy, `src/modules/integrations/`, `src/modules/delivery/senders/`; UI Integrations page (ADMIN-gated).
---

---
**Decision:** Prod runs as an isolated Compose project `secnews-cms-prod` (base + prod overlay), with one-click bootstrap `scripts/setup-prod.sh` and auto-migrations via `prisma migrate deploy` in the api entrypoint
**Date:** 2026-09-16
**Context:** Bare `docker compose` auto-merges the dev override; prod and dev had to coexist from one clone without port/volume collisions.
**Rationale:** `name: secnews-cms-prod` in `docker-compose.prod.yml` isolates containers/networks/volumes (`secnews-cms-prod_pgdata`); both `-f` files are required since the overlay alone has no runnable db. TASK-COMPOSE `445e298`.
**Alternatives Rejected:** Single merged compose file — loses dev conveniences; separate repo for prod — drift risk.
**Security Implications:** Fail-fast secret env in the overlay; only `WEB_PORT` (default 8080) published; migrations are deploy-only (no `migrate dev` against prod).
**Impact:** README Deploy, `.claude/ENVIRONMENT_GUIDE.md`, `scripts/setup-prod.sh`, `docker-compose.prod.yml`.
---

## Template Format

Copy this block for each new decision:

---
**Decision:** [What was decided]
**Date:** [YYYY-MM-DD]
**Context:** [Why this decision was needed — what problem or requirement triggered it]
**Rationale:** [Why this option was chosen — what criteria or evidence supported it]
**Alternatives Rejected:** [Other options considered and why they were not chosen]
**Security Implications:** [Any security impact of this decision — attack surface, mitigation, residual risk]
**Impact:** [What this decision affects downstream — files, modules, workflows, future tasks]
---

## Log Maintenance Rules

- **Log decisions as they are made** — not at session end from memory.
- **Be specific** — “chose X” is not a decision entry; “chose X over Y because Z, with security implication W” is.
- **Security implications are mandatory** — even if “none” with justification (e.g., “no security impact — pure formatting config”).
- **Link to code** where helpful — file paths, PR numbers, or task IDs that embody the decision.
- **Never delete entries** — this is an append-only log. If a decision is reversed, add a new entry referencing the prior one.
