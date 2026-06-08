# Unofficial SAND Wiki

Community, unofficial wiki for *SAND: Raiders of Sofia*. Not affiliated with tinyBuild.

## Local development

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to your hosted Postgres (Neon/Supabase).
2. `npm install`
3. `npx prisma migrate dev` — apply schema.
4. `npm run db:seed` — load data (set `SEED_FILE=path/to/data.json` for the real dataset).
5. `npm run dev` — http://localhost:3000

## Tech stack

- Next.js (App Router, TypeScript) — UI + data access in one app.
- PostgreSQL via Prisma (v6).
- Tailwind CSS. React Flow for the tech-tree graph.
- Vitest (unit) + Playwright/axe (e2e + accessibility).

## Tests

- `npm run test` — unit (Vitest): tech-tree cost logic, item filtering.
- `npm run test:e2e` — Playwright + axe accessibility checks (builds and starts the app; requires a seeded DB).

## Data

The seed reads `prisma/sample-data.json` by default. Replace it (or point `SEED_FILE` at)
the real dataset using the same shape. See `prisma/seed.ts` for the expected fields.

## Project structure

- `prisma/` — schema, migrations, seed script + sample data.
- `src/lib/` — `tech-tree.ts` (cost-closure logic), `item-filter.ts` (query building), `queries.ts` (DB reads), `db.ts` (Prisma client).
- `src/app/` — routes: `/`, `/items`, `/items/[slug]`, `/tech`, `/about`.
- `src/components/` — UI components.
- `tests/e2e/` — Playwright specs.
