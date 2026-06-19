#!/usr/bin/env bash
# Pull the latest code and (re)deploy the stack on the VPS.
# Idempotent: safe to run repeatedly. `migrate` applies any new Prisma
# migrations, then `app` restarts with the new image.
#
# It NEVER seeds the database. Seeding is destructive and overwrites
# contributor edits — see docs/vps-deploy.md for one-time data import.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building images"
docker compose build

echo "==> Starting stack (db -> migrate -> app -> caddy)"
docker compose up -d

echo "==> Pruning dangling images"
docker image prune -f >/dev/null || true

echo "==> Status"
docker compose ps
