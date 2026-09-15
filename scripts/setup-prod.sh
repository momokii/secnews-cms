#!/usr/bin/env bash
# SecNews CMS — one-click production bootstrap.
#
# Creates .env with freshly generated secrets on first run (idempotent: an
# existing .env is kept as-is), builds and starts the full prod stack
# (db + api + web), waits until the API container reports healthy, then
# prints URLs and next steps. DB migrations (prisma migrate deploy) run
# inside the api container on every start — no manual step.
#
# Usage:   ./scripts/setup-prod.sh
# Options: WEB_PORT=18080 ./scripts/setup-prod.sh   (host port; default 8080)
set -euo pipefail

API_HEALTH_TIMEOUT=300   # seconds to wait for the api container to go healthy
POLL_INTERVAL=5

cd "$(dirname "$0")/.."   # repo root — script works from any cwd

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# ── 1. Preflight: docker + compose v2 + reachable daemon ────────────────────
step "Checking Docker"
command -v docker >/dev/null 2>&1 || die "docker not found — install Docker Engine with Compose v2 first"
docker compose version >/dev/null 2>&1 || die "docker compose v2 not available (run: docker compose version)"
docker info >/dev/null 2>&1 || die "docker daemon not reachable (is Docker running?)"
say "docker OK: $(docker compose version --short)"

# ── 2. .env: create with generated secrets if missing, keep if present ─────
step "Configuring .env"
if [[ -f .env ]]; then
  say "Existing .env found — keeping it (delete it to regenerate secrets)."
else
  cp .env.example .env
  JWT="$(openssl rand -hex 32)"
  ENC="$(openssl rand -hex 32)"
  INGEST="$(openssl rand -hex 32)"
  PGPW="$(openssl rand -hex 16)"
  sed -i \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" \
    -e "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENC}|" \
    -e "s|^INGEST_API_KEY=.*|INGEST_API_KEY=${INGEST}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PGPW}|" \
    -e "s|^POSTGRES_DB=.*|POSTGRES_DB=secnews_prod|" \
    -e "s|^APP_ENV=.*|APP_ENV=production|" \
    .env
  unset JWT ENC INGEST PGPW
  chmod 600 .env
  say "Created .env with freshly generated secrets (POSTGRES_PASSWORD, JWT_SECRET,"
  say "ENCRYPTION_KEY, INGEST_API_KEY) and POSTGRES_DB=secnews_prod. Never commit it."
  if [[ -t 0 && -n "${EDITOR:-}" ]]; then
    printf 'Open .env now to review secrets before starting? [y/N] '
    read -r answer
    if [[ ${answer:-n} =~ ^[Yy] ]]; then "$EDITOR" .env; fi
  else
    say "Review later with: \${EDITOR:-nano} .env"
  fi
fi

# ── 3. Build + start the full prod stack (db + api + web) ──────────────────
# WEB_PORT comes from the shell or .env; compose falls back to 8080.
step "Building and starting the production stack"
"${COMPOSE[@]}" up -d --build

# ── 4. Wait for the api container healthcheck ───────────────────────────────
step "Waiting for api to become healthy (timeout: ${API_HEALTH_TIMEOUT}s)"
cid="$("${COMPOSE[@]}" ps -q api)"
[[ -n $cid ]] || { "${COMPOSE[@]}" logs --tail=50 api >&2 || true; die "api container not found after up — see logs above"; }

deadline=$((SECONDS + API_HEALTH_TIMEOUT))
while :; do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo missing)"
  case $status in
    healthy) say "api is healthy."; break ;;
    unhealthy)
      "${COMPOSE[@]}" logs --tail=50 api >&2 || true
      die "api healthcheck failed — see logs above"
      ;;
  esac
  if (( SECONDS >= deadline )); then
    "${COMPOSE[@]}" logs --tail=50 api >&2 || true
    die "timed out waiting for api health after ${API_HEALTH_TIMEOUT}s — see logs above"
  fi
  sleep "$POLL_INTERVAL"
done

# ── 5. Print URLs and next steps ─────────────────────────────────────────────
port_line="$("${COMPOSE[@]}" port web 8080 2>/dev/null || true)"
host_port="${port_line##*:}"
host_port="${host_port:-8080}"

step "SecNews CMS is up"
say "  Bootstrap first admin : http://localhost:${host_port}/bootstrap"
say "  Sign in               : http://localhost:${host_port}/login"
say "  Health check          : curl http://localhost:${host_port}/api/health"
say ""
say "DB migrations (prisma migrate deploy) ran inside the api container on start."
say "Useful commands (note the -f flags — the stack lives in project 'secnews-cms-prod'):"
say "  ${COMPOSE[*]} ps"
say "  ${COMPOSE[*]} logs -f api"
say "  ${COMPOSE[*]} down          # keeps data (volume secnews-cms-prod_pgdata)"
