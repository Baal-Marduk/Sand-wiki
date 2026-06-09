# Unofficial SAND Wiki

A community-built, **unofficial** database for the game *SAND: Raiders of Sophie* — helping
players find crafting recipes, item details, and the technology tree.

> ⚠️ **Disclaimer:** This is a fan-made, unofficial project. It is **not affiliated with,
> endorsed by, or connected to tinyBuild** or the game's developers. No protected game assets
> (extracted images, sounds, or 3D models) are used. All data is community-contributed for
> informational purposes.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [Adding & updating game data](#adding--updating-game-data)
- [Testing](#testing)
- [Accessibility](#accessibility)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Project conventions & notes](#project-conventions--notes)

---

## Features

- **Item database** — every craftable item and raw resource, with recipes, required materials,
  workbench level, craft time, and unlock conditions.
- **Search** — find items by name from the landing page or the items list.
- **Filter & sort** — filter the item list by type, workbench level, and required resource; sort
  by name or workbench level.
- **Item detail pages** — full recipe (with links to each ingredient), the unlocking technology,
  and a reverse **"Used in"** list of everything that consumes the item.
- **Tech tree** — an interactive graph of the technology DAG plus an equivalent accessible table.
- **Cost calculator** — pick a target technology and get the **total resource cost to unlock it
  from scratch** (the sum over its full transitive prerequisite chain, counting shared
  prerequisites once).
- **Accessible by design** — semantic markup, keyboard navigation, sufficient contrast, image
  `alt` text, and automated accessibility checks in the test suite.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 16** (App Router, TypeScript) — UI **and** data access in one app, no separate API service |
| Database | **PostgreSQL** (hosted; e.g. [Neon](https://neon.tech) or [Supabase](https://supabase.com)) |
| ORM | **Prisma 6** |
| Styling | **Tailwind CSS** (v4) |
| Graph | **React Flow** (tech-tree visualization) |
| Unit tests | **Vitest** |
| E2E + a11y | **Playwright** + **axe-core** |

---

## Prerequisites

- **Node.js 20+** (developed on v24) and npm.
- A **PostgreSQL database**. The easiest path is a free hosted instance:
  - **Neon** — create a project, copy the connection string (turn the *Pooled connection* toggle
    **off** so Prisma migrations can run), keep `?sslmode=require`.
  - **Supabase** — Project → **Connect** → use the **Session/Direct** connection URI.
- No Docker required.

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure the database
#    Copy the example env file and set your connection string.
cp .env.example .env
#    Then edit .env so DATABASE_URL points at your hosted Postgres:
#    DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require"

# 3. Create the database tables
npx prisma migrate dev

# 4. Load data (sample dataset by default)
npm run db:seed

# 5. Start the dev server
npm run dev
# → http://localhost:3000
```

> **Windows / PowerShell note:** if Node was just installed and `node`/`npm` aren't found in a
> fresh terminal, refresh PATH from the registry once per session:
> ```powershell
> $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
> ```

The `.env` file holds your database password and is **gitignored** — never commit it. Only
`.env.example` (a placeholder) is tracked.

---

## Available scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Start the Next.js dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:e2e` | Run Playwright e2e + accessibility tests (builds, starts the app, needs a seeded DB) |
| `npm run db:seed` | Seed the database from `prisma/sample-data.json` (or `SEED_FILE`) |
| `npm run db:reset` | Drop, re-migrate, and re-seed the database (destructive) |

Prisma helpers: `npx prisma migrate dev` (apply/iterate schema), `npx prisma studio` (browse data
in a GUI), `npx prisma generate` (regenerate the client after schema changes).

---

## Project structure

```
sand-wiki/
├─ prisma/
│  ├─ schema.prisma          # data model (Item, RecipeIngredient, TechNode, TechCost, TechPrerequisite)
│  ├─ migrations/            # SQL migration history
│  ├─ seed.ts                # idempotent seed script (reads JSON → DB)
│  └─ sample-data.json       # sample dataset (replace with real data)
├─ src/
│  ├─ lib/
│  │  ├─ tech-tree.ts        # pure cost-closure logic (transitive prerequisites, dedup, cycle-safe)
│  │  ├─ tech-tree.test.ts
│  │  ├─ item-filter.ts      # builds Prisma queries from UI filters
│  │  ├─ item-filter.test.ts
│  │  ├─ queries.ts          # all database read functions used by pages
│  │  └─ db.ts               # Prisma client singleton
│  ├─ app/
│  │  ├─ layout.tsx          # shell: nav + persistent disclaimer footer
│  │  ├─ page.tsx            # landing + search
│  │  ├─ items/page.tsx      # item list (search / filter / sort)
│  │  ├─ items/[slug]/page.tsx  # item detail (recipe + "used in")
│  │  ├─ tech/page.tsx       # tech graph + table + cost calculator
│  │  ├─ about/page.tsx      # disclaimer / legal
│  │  └─ globals.css
│  └─ components/
│     ├─ SearchBar.tsx
│     ├─ ItemCard.tsx
│     ├─ ItemFilters.tsx
│     ├─ TechTreeGraph.tsx   # React Flow (decorative, inert)
│     └─ TechTreeTable.tsx   # accessible equivalent of the graph
├─ tests/e2e/wiki.spec.ts    # Playwright + axe specs
├─ vitest.config.ts
├─ playwright.config.ts
└─ .env.example
```

**Design principle:** pure domain logic (`tech-tree.ts`, `item-filter.ts`) is isolated from the
database and the UI so it can be reasoned about and unit-tested on its own. Pages call thin query
functions in `queries.ts`; the database is only touched at request time.

---

## Data model

All entities live in `prisma/schema.prisma`:

- **`Item`** — both manufacturable items **and** raw resources (distinguished by `isResource`),
  since recipes reference both. Fields: `slug`, `name`, `description`, `type`, `workbenchLevel`,
  `craftTimeSeconds`, `unlockConditions`, `imageAlt`, optional `unlockedBy` (a `TechNode`).
- **`RecipeIngredient`** — a self-referential join: an item's recipe is a list of
  `(ingredient, quantity)`. Powers both "what's in this" and the reverse "used in".
- **`TechNode`** — a technology in the tree.
- **`TechCost`** — resource cost to unlock a node (`resource` + `quantity`).
- **`TechPrerequisite`** — the DAG edges between technologies.

---

## Adding & updating game data

The seed script (`prisma/seed.ts`) reads a JSON file and rebuilds the database idempotently, so
it's safe to re-run after each game update.

1. **Edit or replace the dataset.** Use `prisma/sample-data.json` as the template, or point the
   seed at your own file:
   ```bash
   # uses prisma/sample-data.json
   npm run db:seed

   # uses a custom dataset
   SEED_FILE=path/to/real-data.json npm run db:seed
   ```
   On Windows PowerShell: `$env:SEED_FILE="path\to\real-data.json"; npm run db:seed`

2. **JSON shape** (see `sample-data.json` for a complete example):
   ```json
   {
     "items": [
       {
         "slug": "scrap-rifle",
         "name": "Scrap Rifle",
         "type": "weapon",
         "isResource": false,
         "workbenchLevel": 2,
         "craftTimeSeconds": 30,
         "unlockConditions": "Requires Basic Weapons tech",
         "unlockedBy": "basic-weapons",
         "imageAlt": "A makeshift rifle built from scrap",
         "recipe": [
           { "ingredient": "iron-plate", "quantity": 3 },
           { "ingredient": "fuel", "quantity": 1 }
         ]
       }
     ],
     "techNodes": [
       {
         "slug": "basic-weapons",
         "name": "Basic Weapons",
         "description": "Unlocks scrap weaponry.",
         "costs": [
           { "resource": "iron-ore", "quantity": 10 },
           { "resource": "fuel", "quantity": 5 }
         ],
         "prerequisites": ["metalworking"]
       }
     ]
   }
   ```
   - `ingredient`, `resource`, `unlockedBy`, and `prerequisites` entries all reference other
     entities by their **`slug`**. The seed resolves them and fails loudly if a slug is missing.
   - Raw resources are just items with `"isResource": true` (and usually no recipe).

3. **Changing the schema?** Edit `prisma/schema.prisma`, then
   `npx prisma migrate dev --name <change>` and `npx prisma generate`.

---

## Testing

```bash
npm run test       # unit: tech-tree cost logic + item-filter query building
npm run test:e2e   # end-to-end + accessibility (axe) across all pages
```

- **Unit tests** are pure and need no database.
- **E2E tests** build and start the app and run against the **seeded** database, so run
  `npm run db:seed` first. They assert real behavior, including that the calculator returns the
  correct transitive totals and that **no serious/critical accessibility violations** exist on
  any page.

---

## Accessibility

Accessibility is a first-class requirement, not an afterthought:

- Semantic HTML and labelled form controls; `role="search"` on search forms.
- `aria-live` regions for result counts and calculator output.
- The decorative tech-tree graph is marked `inert` (removed from focus order and the
  accessibility tree); the **`TechTreeTable`** carries the same information for keyboard and
  screen-reader users.
- Dark theme with checked color contrast.
- `alt` text stored for every image.
- Automated **axe** checks run on every page in the e2e suite.

---

## Deployment

This is a standard Next.js app and deploys to any Node host (Vercel, Netlify, a container, etc.):

1. Set `DATABASE_URL` in the host's environment to your production Postgres.
2. Run migrations against it: `npx prisma migrate deploy`.
3. Seed it: `npm run db:seed` (or your real dataset).
4. `npm run build` then `npm run start`.

On Vercel, set `DATABASE_URL` as an environment variable and let it run `next build`; run
`prisma migrate deploy` as part of the build or a release step.

---

## Troubleshooting

- **`node`/`npm` not found on Windows** — refresh PATH (see the note in *Getting started*), or
  open a new terminal after installing Node.
- **Prisma can't connect / migrations hang** — make sure you're using a **direct** (non-pooled)
  connection string and that it ends with `?sslmode=require` for Neon/Supabase.
- **`prisma migrate dev` fails with a datasource error** — this project uses **Prisma 6**, where
  the `datasource` block keeps `url = env("DATABASE_URL")`. (Prisma 7 moved this to a config file;
  don't upgrade without adjusting the schema and client setup.)
- **E2E tests fail to find data** — run `npm run db:seed` first; the suite expects the sample data.
- **Want to start fresh** — `npm run db:reset` drops, re-migrates, and re-seeds (destructive).

---

## Roadmap

**Phase 1 (done):** read-only wiki — items, recipes, search, filters, tech tree, cost calculator,
accessibility.

**Phase 2 (planned):** community contributions — user accounts, an "report an error / suggest a
change" workflow, and a manual moderation/review queue before changes go live. The data model
already leaves room for this.

---

## Project conventions & notes

- Specs and the implementation plan live in `docs/superpowers/` at the repository root.
- The app intentionally runs as a **single Next.js application** (no separate Express backend) and
  uses **hosted Postgres** rather than local Docker.
- The dark theme is applied via Tailwind utilities on `<body>` in `layout.tsx`; do **not** set
  `background`/`color` on `body` in `globals.css` (it overrides those utilities and breaks
  contrast).

---

## License & legal

Unofficial fan project. Not affiliated with tinyBuild. Game names and terminology belong to their
respective owners; this project stores only community-contributed textual data and no extracted
game assets.
