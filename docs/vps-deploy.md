# Deploying sand-wiki on a VPS (Docker Compose + self-hosted Postgres)

This is the full runbook for self-hosting the wiki on a single Linux VPS, replacing Vercel + Neon. The stack runs entirely from `docker-compose.yml` at the repo root.

## What runs where

```
Internet ──443──> Caddy (TLS, reverse proxy) ──> app (Next.js standalone :3000)
                                                    │
                                              migrate (one-shot: prisma migrate deploy)
                                                    │
                                                   db (PostgreSQL 16, volume: pgdata)
```

Only Caddy is exposed to the internet (ports 80/443). `app` and `db` are reachable only on the internal compose network.

Files involved:
- `apps/wiki/Dockerfile` — multi-stage build (`builder` does the migration, `runner` serves)
- `docker-compose.yml` — the four services + volumes
- `deploy/Caddyfile` — TLS + reverse proxy
- `.env.example` — copy to `.env` and fill in
- `deploy/deploy.sh` — pull + build + restart
- `.github/workflows/deploy.yml` — optional push-to-deploy over SSH

---

## One-time server setup

1. **Provision a VPS** — Ubuntu 24.04 LTS, ≥ 2 GB RAM (the Next.js build is memory-hungry; on 1 GB add swap, see below). Point your domain's **DNS A record** at the server IP.

2. **Install Docker Engine + Compose plugin:**
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker "$USER"   # log out/in so this takes effect
   ```

3. **Clone the repo** to a stable path (used by the CI secret `VPS_PATH`):
   ```bash
   sudo mkdir -p /opt/sandlabs && sudo chown "$USER" /opt/sandlabs
   git clone <your-repo-url> /opt/sandlabs
   cd /opt/sandlabs
   ```

4. **Create the environment file:**
   ```bash
   cp .env.example .env
   nano .env   # set DOMAIN, a strong POSTGRES_PASSWORD, and matching DATABASE_URL/DIRECT_DATABASE_URL
   ```

5. **(Optional) Add swap** if RAM < 2 GB, so `next build` doesn't get OOM-killed:
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

6. **Open the firewall** for web + SSH only:
   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
   ```

---

## First deploy

```bash
cd /opt/sandlabs
docker compose build          # builds the app image (5–10 min first time)
docker compose up -d          # starts db, runs migrate, starts app + caddy
docker compose ps             # all should be "running"/"healthy" (migrate "exited 0")
docker compose logs -f app    # watch it come up
```

Caddy obtains a TLS cert automatically on first hit. Visit `https://<DOMAIN>`.

At this point the database has the **schema** (from `prisma migrate deploy`) but **no data**. Load data next.

---

## ⚠️ Moving your data off Neon — do NOT re-seed

Your live Neon database contains hand-curated contributor edits (rarity fields, loot/cost links, admin-applied changes). **`npm run db:seed` / `db:seed:force` / `db:reset` are destructive and will silently revert those edits** — they are never part of deploys.

Migrate the real data with a Postgres dump/restore instead:

```bash
# 1. From your machine (or the VPS), dump the live Neon DB:
pg_dump "<NEON_DIRECT_CONNECTION_STRING>" \
  --no-owner --no-privileges --format=custom -f sandwiki.dump

# 2. Copy the dump to the VPS, then restore into the self-hosted db.
#    --data-only because `migrate deploy` already created the schema;
#    --disable-triggers avoids FK-ordering errors during the load.
docker compose cp sandwiki.dump db:/tmp/sandwiki.dump
docker compose exec db pg_restore \
  --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --data-only --disable-triggers --no-owner /tmp/sandwiki.dump
```

If schema versions differ, restore the full dump into a fresh DB instead of `--data-only` and skip the migrate step for that initial load. Verify row counts before pointing the domain at it.

---

## Routine updates

After the first deploy, shipping a change is one command on the VPS:

```bash
./deploy/deploy.sh
```

It does `git pull` → `docker compose build` → `docker compose up -d`. New Prisma migrations apply automatically via the `migrate` service before `app` restarts. Old images are pruned.

To automate it on every push to `master`, set the four `VPS_*` repo secrets and the included GitHub Action (`.github/workflows/deploy.yml`) will SSH in and run the script for you.

---

## Operations

| Task | Command |
|------|---------|
| Logs | `docker compose logs -f app` |
| Restart just the app | `docker compose restart app` |
| Apply migrations manually | `docker compose run --rm migrate` |
| Open a DB shell | `docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"` |
| Stop everything | `docker compose down` (data survives in the `pgdata` volume) |
| **Backups** | `docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" --format=custom > backup-$(date +%F).dump` |

Schedule the backup line via `cron` and copy the dump off-box. The `pgdata` volume is the only stateful thing on the server — losing it loses your data, so back it up.

**Rollback:** `git checkout <previous-good-sha>` then `./deploy/deploy.sh`. Note that DB migrations are not auto-reverted; avoid destructive migrations, or restore from a backup taken before the migration.

---

## Scaling notes (later, not now)

- **CDN:** A single VPS serves all traffic from one region. Putting **Cloudflare** in front (free tier) caches `/_next/static`, `/icons`, `/tramplers` at the edge and shields the origin. The immutable `Cache-Control` headers in `next.config.ts` already make those assets cache-perfectly.
- **Registry-based CI:** If building on the VPS is too slow/heavy, build the image in GitHub Actions, push to GHCR, and change `docker-compose.yml` from `build:` to `image: ghcr.io/...`; the VPS then only runs `docker compose pull && up -d`.
- **Zero-downtime:** `docker compose up -d` briefly drops in-flight requests on `app` restart. At this scale that's a sub-second blip; revisit with a rolling/blue-green setup only if it matters.
