# SecNews CMS

Security-news aggregation CMS: Fastify API (`src/`), React/Vite web UI (`web/`), PostgreSQL. Everything below is reproducible from a clean clone.

| Service | Image (pinned) | Runs as | Host port |
|---|---|---|---|
| web — nginx serving the SPA, proxying `/api/*` to the API | build `node:22-alpine` → serve `nginx:stable-alpine` | uid 101 (`nginx`) | `8080` (the only published port; override with `WEB_PORT`) |
| api — Fastify + Prisma 7 | multi-stage `node:22-alpine` | uid 100 (`appuser`) | none (internal) |
| db — PostgreSQL | `postgres:16.4-alpine` | image default | none (internal) |

## Prerequisites

- Docker Engine with Compose v2 — deploying needs nothing else
- Node.js >= 22 — only for local development / tests
- `openssl` — secret generation (preinstalled on most systems)

## Deploy

### One-click

```sh
./scripts/setup-prod.sh
```

The script checks Docker, creates `.env` from `.env.example` with freshly generated secrets on first run (an existing `.env` is kept — delete it to regenerate), builds and starts the full stack, waits until the API container reports healthy, then prints URLs and next steps. Safe to re-run. DB migrations (`prisma migrate deploy`) run inside the api container on every start — no manual step. Host port defaults to 8080; override with `WEB_PORT=18080 ./scripts/setup-prod.sh`.

### Manual (same steps, by hand)

#### 1. Configure

```sh
cp .env.example .env
```

Generate secrets and paste them into `.env` (each command prints one value):

```sh
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY   (encrypts credentials at rest)
openssl rand -hex 32   # INGEST_API_KEY   (shared secret for feed ingest)
openssl rand -hex 16   # POSTGRES_PASSWORD
```

While in `.env`, also set `POSTGRES_DB=secnews_prod`. Set `WEB_PORT` only if 8080 is taken on the host. `CORS_ORIGIN` is not needed for the bundled web UI (nginx serves SPA and API on one origin). `SMTP_*` / `WAHA_*` only if you use those channels — prefer configuring them in the Integrations menu (ADMIN, stored encrypted, testable); the env vars remain the fallback until a DB row exists. Never commit `.env`.

### 2. Start the production stack

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The API container waits for the DB healthcheck, then on every start runs `prisma generate && prisma migrate deploy && npm start` — migrations apply automatically.

#### 3. Bootstrap the first ADMIN

Open `http://localhost:8080/bootstrap` and create the first administrator (name / email / password). Under the hood this is `POST /api/bootstrap`; it answers `409 CONFLICT` once any user exists.

#### 4. Sign in

Open `http://localhost:8080/login` and sign in with the admin account. Sanity check:

```sh
curl http://localhost:8080/api/health   # → {"status":"ok"}
```

### Logs / stop

> **Why is `docker compose ps` (no flags) empty?** The prod stack runs under the isolated project `secnews-cms-prod` (set via `name:` in `docker-compose.prod.yml`), while a bare `docker compose` targets the dev project `secnews-cms` and auto-merges `docker-compose.override.yml`. Always pass the two `-f` flags, or use the short form `docker compose -p secnews-cms-prod ps`.

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.yml -f docker-compose.prod.yml down   # keeps data (volume secnews-cms-prod_pgdata)
```

## Local development

Dev conveniences live in `docker-compose.override.yml` (auto-merged): hot-reload API on `127.0.0.1:3000`, DB on `127.0.0.1:5432`.

```sh
npm ci
npx prisma generate                       # src/generated/ is gitignored — required once per clone
docker compose run --rm api sh -c "npm ci && npx prisma generate"   # …or install + generate inside the container (no local Node needed)
docker compose up -d                      # api + db
cd web && npm ci && npm run dev           # Vite on :5173, proxies /api → :3000
```

Fully native alternative: `docker compose up -d db`, set `DATABASE_URL` in `.env` to your dev DB, then `npx prisma migrate dev && npm run dev`.

### Dev database on :5433 (required by `npm run test:e2e`)

The e2e suite truncates its database and refuses to run unless `APP_ENV` is `development`/`test` **and** `DATABASE_URL` points at `:5433`. Skip the command below if the `secnews-cms-pg` container already exists (just `docker start secnews-cms-pg`):

```sh
docker run -d --name secnews-cms-pg \
  -p 127.0.0.1:5433:5432 \
  -e POSTGRES_USER=secnews -e POSTGRES_PASSWORD=<dev-password> -e POSTGRES_DB=secnews_dev \
  postgres:16.4-alpine
```

Then in `.env`:

```
DATABASE_URL=postgresql://secnews:<dev-password>@localhost:5433/secnews_dev
```

## Tests

```sh
npm run typecheck                 # tsc --noEmit (API)
npm run lint
npm test                          # unit tests (vitest, API)
cd web && npm run lint && npm test  # unit tests (vitest, web)
```

End-to-end (API-level suites S1–S5 against the :5433 dev DB; spawns its own transport-stubbed server — SMTP/WAHA are stubbed, zero external traffic, the production stack is never touched):

```sh
npm run test:e2e
```

## WhatsApp (WAHA) — external service

WAHA is **not** part of the compose stack. `WAHA_BASE_URL`, `WAHA_SESSION` and `WAHA_API_KEY` in `.env` point to an externally hosted WhatsApp gateway; WhatsApp channel deliveries require it to be reachable. The e2e suite stubs it, so tests never call WAHA.
