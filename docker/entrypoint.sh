#!/bin/sh
# Homi container entrypoint.
# Applies pending, committed Prisma migrations (`prisma migrate deploy` never resets data or
# generates new migrations) and then starts the server. Set MIGRATE_ON_START=false to run
# migrations manually, e.g.:  docker compose run --rm homi homi-migrate
set -eu

migrate() {
  echo "[homi] applying database migrations…"
  cd /app/apps/server
  node /app/node_modules/prisma/build/index.js migrate deploy --config prisma.config.ts
  cd /app
}

if [ "${1:-}" = "homi-migrate" ]; then
  migrate
  exit 0
fi

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  attempts=0
  until migrate; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 10 ]; then
      echo "[homi] migrations failed after $attempts attempts" >&2
      exit 1
    fi
    echo "[homi] database not ready yet – retrying in 3 s ($attempts/10)"
    sleep 3
  done
fi

exec "$@"
