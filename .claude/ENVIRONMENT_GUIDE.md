# Environment Guide — Definitions & Agent Behavior per Environment

> **Status: Verified against the real stack (Fastify API + React/Vite web + Postgres 16.4 in Docker Compose v2).** Commands below are real; update this file when the setup changes.

---

## 1. Environment Definitions

| Environment | Purpose | Characteristics |
|-------------|---------|-----------------|
| `development` | Local development and feature work | Debug mode on, verbose logging, hot reload, relaxed auth optional, no real external services required |
| `staging` | Pre-production validation | Mirrors production config, uses real (sandboxed) services, no debug mode, production-like data |
| `production` | Live system | No debug, minimal logging, hardened config, real services and secrets, high availability |

### How to Identify the Active Environment

- Check the `APP_ENV` environment variable (or `NODE_ENV`, `ENV`, `RAILS_ENV`, `GO_ENV` depending on stack — use the canonical variable for this project once determined).
- Inspect `.env` file presence and contents (if present, assume development unless proven otherwise — verify with `APP_ENV`).
- In Docker contexts, check which Compose files are being used (see Docker pattern below).
- **When in doubt, ask the user.** Do not assume development if evidence is ambiguous — treat ambiguity as potential production.

---

## 2. Agent Behavior by Environment

### In `development`

- Verbose logging is acceptable and encouraged for debugging.
- Debug ports and tools may be exposed (e.g., database GUIs like pgAdmin/Adminer, profilers, debuggers).
- Seed data scripts and fixtures may be run freely (`make seed`, `npm run seed`, etc. — replace with real command once known).
- Hot reload and volume mounts are expected in Docker Compose.
- Destructive operations on the local database are acceptable with standard caution (still avoid `DROP` without confirming it targets the dev DB).
- Relaxed auth (e.g.,_mock users, disabled rate limiting) is acceptable if explicitly documented and never leaks to other environments.

### In `staging` or `production`

- **The agent must never run destructive commands** (`DROP`, `DELETE`, `TRUNCATE`, irreversible migrations, `docker system prune`, `rm -rf`) **without explicit written confirmation from the user.**
- **The agent must never directly modify production config files or secrets** (no editing `.env.production`, no pushing secrets, no changing prod Compose env).
- **Any proposed change must be presented as a written plan first** — not executed immediately. Include: what will change, risk assessment, rollback plan, and required confirmation.
- **The agent must flag explicitly if it detects it is operating in a non-development context** — state the detected environment and ask for confirmation before proceeding.
- **Minimal logging, no debug mode, no exposed debug ports.** Verify this before deploying.
- **All secrets via injection** — never mount or commit env files with real secrets.

---

## 3. Docker Compose Environment Pattern

All Docker-based projects must follow this override pattern (this is the actual pattern in this repo):

| File | Purpose | When Loaded |
|------|---------|-------------|
| `docker-compose.yml` | Base: `db` (postgres:16.4-alpine, healthcheck, `pgdata` volume) + `api` | Always |
| `docker-compose.override.yml` | Dev-only: publishes db on `127.0.0.1:5432`, api on `127.0.0.1:3000`, live-code volume mounts | Loaded **automatically** by Docker Compose when no `-f` flags are given |
| `docker-compose.prod.yml` | Prod overlay: `name: secnews-cms-prod`, api/web built from Dockerfiles, api+web healthchecks, restart policies, only `WEB_PORT` published, fail-fast secret env | Loaded **explicitly** with `-f` |

```bash
# Development (override auto-merged): api + db, hot reload
docker compose up -d
docker compose ps

# Production (explicit — base + prod overlay, NO dev override):
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# …or one-click (creates .env with generated secrets, waits for api health):
./scripts/setup-prod.sh

# Inspect the running prod stack (short form of the two -f flags):
docker compose -p secnews-cms-prod ps
```

**Why the `name:` isolation matters:** `docker-compose.prod.yml` sets `name: secnews-cms-prod`, so prod containers, networks and the `pgdata` volume live in a *separate compose project* from dev. Consequences an agent must know:

- A bare `docker compose ps` targets the dev project (`secnews-cms`) and shows **nothing** while only the prod stack is running — that is expected, not a failure. Use the same two `-f` flags or `-p secnews-cms-prod`.
- You can run dev and prod stacks from the same clone simultaneously (different containers/volumes) — but they must not share the same host ports (`WEB_PORT` vs Vite `:5173`, and the dev db on `127.0.0.1:5432` vs the prod db which is unpublished).
- `docker compose down` in one project never touches the other project's volumes. Data volume: `secnews-cms-prod_pgdata` (prod), `secnews-cms_pgdata` (dev).
- Never pass `-f docker-compose.prod.yml` alone — the overlay only *overrides* db env vars; the base file supplies the db image, healthcheck and volume. Both files are required.

**Agent rules for Compose:**

- Always know which command applies to the current context — check `docker compose ls` to see which projects are actually running.
- **Always ask before running any Compose command that is not clearly development.**
- Never run `docker compose down -v` (destroys volumes) without explicit confirmation — this deletes databases.
- This project uses Compose V2 (`docker compose`, space).

---

## 4. `.env` File Pattern

```
.env.example        # Committed to repo — all keys with placeholder values + comments
.env                # Never committed — actual development secrets (gitignored)
.env.staging        # Never committed — staging secrets (gitignored)
.env.production     # Never committed — production secrets (gitignored)
```

### Example `.env.example`

```env
# Application environment: development | staging | production
APP_ENV=development

# Server
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/app_dev

# Auth
JWT_SECRET=replace-me-with-a-real-secret-in-env
JWT_EXPIRES_IN=15m

# External services (add as needed)
# REDIS_URL=redis://localhost:6379
# SMTP_HOST=smtp.example.com
```

### `.gitignore` Requirement

```gitignore
# Environment files — never commit real secrets
.env
.env.staging
.env.production
.env.local

# Keep the example
!.env.example
```

**Before the first commit of any session, verify `.env` is gitignored:**

```bash
git check-ignore -v .env
# should output: .gitignore:XX:.env
```

If it does not, add `.env` to `.gitignore` before writing any code that reads from it. This is a blocker.

---

## 5. Common Commands (Verified)

| Task | Development Command | Production Command |
|------|----------------------------------|----------------------------------|
| Start services | `docker compose up -d` (api :3000, db :5432) | `./scripts/setup-prod.sh` (one-click) or `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` |
| Inspect | `docker compose ps` | `docker compose -f docker-compose.yml -f docker-compose.prod.yml ps` (or `-p secnews-cms-prod ps`) |
| Logs | `docker compose logs -f api` | `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api` |
| Stop / destroy | `docker compose down` | `docker compose -f docker-compose.yml -f docker-compose.prod.yml down` (keeps `secnews-cms-prod_pgdata`; add `-v` only with explicit confirmation) |
| Run tests | `npm run typecheck && npm test` · web: `cd web && npm run lint && npm test` · e2e: `npm run test:e2e` | N/A — never run tests against prod |
| Lint & format | `npm run lint` / `npm run format:check` | Same, in CI |
| Health check | `curl http://127.0.0.1:3000/health` | `curl http://localhost:${WEB_PORT:-8080}/api/health` |
| DB migrations | `npx prisma migrate dev` | Automatic — `prisma migrate deploy` runs in the api container entrypoint on every start |
