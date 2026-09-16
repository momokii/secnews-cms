# Current Status — Living Project State

> **This is a living document. The agent must update this file after every working session with accurate current state and a session summary.**

---

## Project Phase

**MVP feature-complete, actively hardening.** The SecNews operations platform is deployed via a one-click Compose stack (`scripts/setup-prod.sh` → project `secnews-cms-prod`: db + api + web). 90+ `TASK-*` commits landed; work is now incremental UX/UX-hardening and docs accuracy rather than scaffolding.

---

## Stack Snapshot

- **API:** TypeScript, Node 22, Fastify (`src/`), Prisma 7 + adapter-pg, zod v4 schemas per module (`src/modules/*/schema.ts`).
- **Web:** React + Vite (`web/`), nginx stable-alpine serving the SPA and proxying `/api/*` in prod.
- **DB:** PostgreSQL 16.4-alpine; migrations auto-run via `prisma migrate deploy` in the api container entrypoint.
- **Deploy:** Compose v2 — base `docker-compose.yml` + `docker-compose.override.yml` (dev, auto-merged) + `docker-compose.prod.yml` (overlay, project name `secnews-cms-prod`, only `WEB_PORT` published).
- **Tests:** vitest — API unit suites (`tests/*.test.ts`) + API-level e2e (`npm run test:e2e`, transport-stubbed, needs :5433 dev DB); web unit tests.

## Completed (major surfaces)

- [x] Auth & users — JWT login with env-driven `JWT_EXPIRES_IN` (sidebar countdown), roles ADMIN/EDITOR/ANALYST, bootstrap-first-admin gate, change-password.
- [x] Tickets workflow — full state machine (`docs/STATES.md`), take/transition gates, audit activity timeline with action filter and old→new values, CVE-id guards, IOC value-vs-type validation, pending-suggestions hard block.
- [x] Research-notebook sources — rich sources on tickets (title + notes), tooltip display, per-source edit, audit trail (TASK-SOURCES).
- [x] Feeds & ingest — RSS/Atom poller on `FEED_POLL_CRON`, `POST /ingest` with timing-safe `INGEST_API_KEY`.
- [x] OTX threat intel — IOC push/patch/remove with real upstream ids, diff-based sync, re-push converges to the ticket's canonical IOC set.
- [x] AI enrichment — Fill/Enrich prompt templates persisted with revision history + per-card guidance + history viewer, 16 placeholders (aggregated + granular) with legend mirroring the backend renderer, provider+model choice per call (Gemini, DeepSeek), suggestion accept/delete with audit.
- [x] Delivery — channels CRUD (email / WhatsApp-WAHA / Telegram-channel), central send transport, audited send + resend from SENT, upstream error detail surfaced (telegram network cause/timeouts).
- [x] Bulletin — render pipeline from READY tickets.
- [x] Email template studio — HTML email templates with editor + render preview (TASK-UX+EMAIL).
- [x] **Integrations menu** — SMTP, WAHA, AI providers, threat-intel keys configured **in-app** (ADMIN role): stored encrypted in DB (`ENCRYPTION_KEY`), masked on read, `check-connection` probes for SMTP/WAHA/Telegram/DeepSeek. Env vars (`WAHA_*`, `SMTP_*`) remain a code-level fallback only — **no longer listed in `.env.example`** (TASK-INTGS + this docs pass).
- [x] Prod deploy — `scripts/setup-prod.sh` one-click (idempotent .env generation, build, wait-for-health); `prisma migrate deploy` runs in api entrypoint; compose project isolation documented (`docker compose ps` empty → use `-f … -f docker-compose.prod.yml ps` or `-p secnews-cms-prod ps`).

## In Progress

- [ ] None carried across sessions. Current session: docs/state alignment (TASK-DOCS) — see Session History.

## Blocked

None.

## Open Questions

- None blocking. (Historic ones — stack, deploy path, test commands — resolved; see `ENVIRONMENT_GUIDE.md` for the verified command table.)

## Security Notes

- Secrets only via `.env` (gitignored): `JWT_SECRET`, `ENCRYPTION_KEY`, `INGEST_API_KEY`, `POSTGRES_*`; `setup-prod.sh` generates them with `openssl rand -hex`.
- `ENCRYPTION_KEY` encrypts integration credentials (SMTP, WAHA, AI providers) at rest; API returns them masked.
- `CORS_ORIGIN` empty disables cross-origin browser access (secure default); prod bundled UI needs none (single origin).
- Prod containers run non-root (api uid 100, web uid 101); only `WEB_PORT` published; db unpublished in prod.
- No real WAHA/SMTP credentials in repo; e2e stubs both transports (zero external traffic).

---

## Session History

### Session — 2026-09-04 — Infrastructure Bootstrap

- **Agent:** Sisyphus (bootstrap)
- **Goal:** Initialize universal `.claude/` agent infrastructure for a blank repository
- **Outcome:** All 14 files created with substantive, general-first content per file specifications. No product code changed. Ready for first working session.

### Session — 2026-09-04 — Oracle Verification Fixes (1/500)

- **Agent:** Sisyphus (verification)
- **Goal:** Address Oracle NOT VERIFIED gaps (5 items)
- **Fixes:** settings.json hardening; README→HOW_TO_RESUME canonical order; .env.example/.gitignore prerequisites; CURRENT_STATUS accuracy.
- **Outcome:** All 5 gaps resolved, prerequisites now satisfied.

### Session — 2026-09-16 — TASK-DOCS: repo docs + env cleanup

- **Agent:** Sisyphus-Junior
- **Goal:** Align repo docs and `.claude` state with the current stack after Integrations went DB-backed.
- **Changes:** `.env.example` — removed `WAHA_*` and `SMTP_*` blocks, replaced with Integration-menu pointer (env fallback documented as code-level only); README — Deploy intro now explains base+overlay compose files under project `secnews-cms-prod`, in-app SMTP/WAHA config, manual section and WAHA section rewritten accordingly; `.claude/README.md` — real project identity replaces greenfield placeholder; this file + `TASK_QUEUE.md` + `DECISIONS_LOG.md` reflect the actual stack (prompt templates, email template studio, research-notebook sources, integrations).
- **Outcome:** Docs consistent with TASK-INTGS/TASK-COMPOSE reality; no code changes; tests re-run green.

---

## Last Updated

2026-09-16 — TASK-DOCS: state files aligned with current stack; .env.example dropped WAHA/SMTP env vars. Updated by Sisyphus-Junior.
