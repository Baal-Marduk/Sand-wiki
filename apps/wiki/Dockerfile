# syntax=docker/dockerfile:1
#
# Multi-stage build for the sand-wiki Next.js app in an npm-workspaces monorepo.
# Build context MUST be the repo root (see docker-compose.yml), because the app
# depends on the `@sandlabs/data` workspace and the root package-lock.json.
#
# Stages:
#   base    - node + openssl (Prisma's query engine needs libssl)
#   builder - full install + prisma generate + next build (also used to run
#             `prisma migrate deploy`, since it has the CLI + schema + migrations)
#   runner  - minimal standalone server, no node_modules install, non-root

# ---------- base ----------
FROM node:22-bookworm-slim AS base
# Prisma's native query engine links against OpenSSL at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- builder ----------
FROM base AS builder

# Copy only manifests first for better layer caching. Every workspace listed in
# the root package.json "workspaces" globs needs its package.json present for
# `npm ci` to resolve the lockfile.
COPY package.json package-lock.json ./
COPY apps/wiki/package.json ./apps/wiki/package.json
COPY packages/data/package.json ./packages/data/package.json
COPY packages/datamine/package.json ./packages/datamine/package.json

# Install with the committed lockfile. --ignore-scripts skips apps/wiki's
# `postinstall: prisma generate` here (the schema isn't copied yet); we run
# generate explicitly below once the source is in place.
RUN npm ci --ignore-scripts

# Now bring in the full source.
COPY . .

# Generate the Prisma client against the app's schema, then build.
RUN npx prisma generate --schema=apps/wiki/prisma/schema.prisma
RUN npm run build --workspace=apps/wiki

# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as an unprivileged user.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# The standalone output reproduces the monorepo layout under .next/standalone,
# so server.js lives at apps/wiki/server.js. Static assets and public/ are NOT
# copied into standalone by Next — we copy them alongside so server.js serves them.
COPY --from=builder --chown=nextjs:nodejs /app/apps/wiki/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/wiki/.next/static ./apps/wiki/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/wiki/public ./apps/wiki/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/wiki/server.js"]
