#!/usr/bin/env bash
# SecNews CMS — one-click production teardown.
#
# Stops and removes the prod stack (db + api + web) created by setup-prod.sh.
# Data volumes are kept by default (so a later `./scripts/setup-prod.sh`
# brings the same DB back). Pass --volumes to also wipe the DB volume.
#
# Usage:   ./scripts/down-prod.sh          # keep data
#          ./scripts/down-prod.sh --volumes # also remove pgdata volume
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

WITH_VOLUMES=false
for arg in "$@"; do
  case "$arg" in
    --volumes|-v) WITH_VOLUMES=true ;;
    --help|-h)
      echo "Usage: $0 [--volumes]"
      echo "  --volumes  also remove the postgres data volume (irreversible)"
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

echo "==> Stopping secnews-cms-prod stack (api + db + web)..."
if $WITH_VOLUMES; then
  "${COMPOSE[@]}" down --volumes --remove-orphans
  echo "Stack down — volumes removed."
else
  "${COMPOSE[@]}" down --remove-orphans
  echo "Stack down — data kept in volume secnews-cms-prod_pgdata."
fi

echo ""
echo "Check with:"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
echo "  docker volume ls | grep secnews-cms-prod"
