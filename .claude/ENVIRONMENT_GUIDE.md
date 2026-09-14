# Environment Guide — Definitions & Agent Behavior per Environment

> **Status: General placeholder.** Replace placeholder commands with real, verified commands once the stack and Docker setup are established.

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

All Docker-based projects must follow this override pattern (adapt file names if the project uses a different Compose setup — document the actual pattern here once known):

| File | Purpose | When Loaded |
|------|---------|-------------|
| `docker-compose.yml` | Base service definitions, environment-agnostic | Always |
| `docker-compose.override.yml` | Development overrides: hot reload, debug ports, volume mounts for live code | Loaded **automatically** by Docker Compose in dev |
| `docker-compose.prod.yml` | Production overrides: no volume mounts, resource limits, restart policies, no exposed debug ports | Loaded **explicitly** with `-f` |

```bash
# Development (automatic — docker-compose.override.yml is loaded by default)
docker-compose up
# or (explicit)
docker-compose -f docker-compose.yml -f docker-compose.override.yml up

# Production (explicit — only base + prod override, no dev override)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Staging (same as production, with staging env file)
APP_ENV=staging docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Agent rules for Compose:**

- Always know which command applies to the current context.
- **Always ask before running any Compose command that is not clearly development.**
- Never run `docker-compose down -v` (destroys volumes) without explicit confirmation — this deletes databases.
- Prefer `docker compose` (V2, space) over `docker-compose` (V1, hyphen) if the project has migrated — check `docker compose version`.

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

## 5. Common Commands (Placeholders — Replace with Real Commands)

| Task | Development Command (placeholder) | Production Command (placeholder) |
|------|----------------------------------|----------------------------------|
| Start services | `docker-compose up` | `docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |
| Run tests | `make test` or `npm test` | N/A — never run tests against prod |
| Lint & format | `make lint` / `npm run lint` | Same, in CI |
| Health check | `curl http://localhost:3000/health` | `curl https://api.example.com/health` |
| Seed database | `make seed` or `npm run seed` | Never — use migrations |

> **Self-update instruction:** Once the actual project stack and Docker setup are established, replace every placeholder command in this file with real, verified commands. Include actual ports, service names, health-check endpoints, and seed/migration commands. Document any stack-specific env vars that control environment behavior.
