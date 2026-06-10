# SAND Wiki — Instructions & Conventions

Living reference for the **Unofficial SAND Wiki** (a fan wiki for *SAND: Raiders of Sophie*).
The top sections document how things work today; the **Requirements / TODO** section at the
bottom is yours to keep specifying.

> Note: `AGENTS.md` is separate and only carries the "this Next.js version differs from your
> training data — read `node_modules/next/dist/docs/` first" caveat. This file is the product/
> data/UX reference.

## Overview

Next.js 16 (App Router) + React 19 + Prisma 6 + Neon Postgres + Tailwind v4 / DaisyUI 5.
Two custom themes: `desertnight` (default dark) and `desertday` (light). Display font: Oswald.
Accessibility is a hard gate — axe must pass in both themes (`npm run test:e2e`).

## Data model (Prisma)

- **`Item`** — `slug`, `name`, `derivedName` (search-only), `description`, `category`,
  `isResource`, `storageStack`, `workbenchTier`, `icon`, **`rarity`** (string, indexed),
  **`stats`** (JSON: weapon/ammo fields), plus recipe relations (`producedBy`/`usedIn`).
- **`Recipe`** / `RecipeInput` / `RecipeOutput` — crafting graph; ingredients reference items.
- **`EnvEntity`** — environment content: `slug`, `category`, `name`, `description`, `sourceUrl`,
  `icon`, **`loot`** (JSON: `{ tiers: [{ tier, columns, entries: [{ slug?, name, values }] }] }`,
  only on loot containers).

## Taxonomy (`src/lib/taxonomy.ts` — single source of truth)

- **Sections** (nav): Items (data), Environment (data), Tramplers / Tech / Tools (placeholders).
- **Item categories**: weapons, artillery, resources, attire, tools, medical, ammo, misc.
  - `categoryForItem(type, name, slug)` maps the scraper's game `type` → category at seed time:
    weapon types with a `\d+\s?mm` name → **artillery**; per-slug overrides in `CATEGORY_OVERRIDES`
    (e.g. untyped M1866 → weapons, MedKit → medical); `ENERGY` → tools.
- **Environment categories**: loot-containers, landmarks, game-modes, npcs (npcs has no source yet).
- **Rarity** (`src/lib/rarity.ts`): Common, Uncommon, Noteworthy, Rare, Remarkable, Experimental
  (tiers 1–6) → fixed game-palette colors. Rarity tints the item icon background + drives a filter.
- **Category icons** (`CategoryIcon.tsx`, react-icons `gi`): monochrome glyph per category — these
  replaced the old colored dots. `CATEGORY_COLORS`/`categoryColor` still exist but are no longer
  used in the UI.

## Data pipeline (all data is scraped, then seeded)

1. **Game files** → `sand-scraper` (separate Python tool, `feat/sand-scraper-impl` worktree) reads
   the installed game's Unity bundles → `prisma/data.json` (items + recipes) + `prisma/icons.json`
   + sprite PNGs in `public/icons/`. Game files do NOT contain rarity or gameplay stats.
2. **Community wiki** (`sandgame.wiki`, MediaWiki API) supplies rarity, weapon/ammo stats, and
   environment content:
   - `prisma/import-wiki-enrichment.mjs` → `prisma/wiki-enrichment.json` (per-item rarity + stats).
     Pure parser: `prisma/wiki-parse.mjs` (`{{Weapons}}`/`{{Ammo}}`/`{{Items}}` infoboxes).
   - `prisma/import-env-content.mjs` → `prisma/env-content.json` (loot containers + landmarks +
     game modes; descriptions + loot tables). Pure parser: `prisma/wiki-text.mjs`
     (`stripWikiMarkup`, `titleToSlug`, `parseLootTable`).
   - `prisma/wiki-overrides.json` — normalized-name → slug overrides for match misses (shared by
     both importers).
3. **Seed** (`prisma/seed.ts`) deletes + recreates Items/Recipes/EnvEntity, merging the committed
   JSON snapshots. **Re-seed = `npm run db:seed`** (destructive, against the Neon dev DB).
4. **Refresh data** = run the relevant importer (`node prisma/import-*.mjs`) then re-seed.

Community-wiki content is uneven/stubby (many landmark pages are empty; some loot tables sparse).
Imports copy what exists and link back via `sourceUrl`.

## UI conventions

- Reduced corner radius (squared look): `--radius-box: .25rem`, `--radius-field: .1875rem`.
- **Cards**: big icon left, name (+ category) stacked; rarity tints the icon background.
- **Item detail**: header (rarity-tinted icon, rarity badge, category) + `StatBox` (Damage/Magazine/
  Type/Ammo/Value, player/trampler/splash for ammo) + tabs (Crafted by / Used in / Buy / Sell /
  **Loot**) + right details panel.
- **Items list**: responsive `CategoryQuickNav` (sticky sidebar / mobile chip row) + a `RarityFilter`
  chip row (`?rarity=`); search via the navbar.
- **Icon + tooltip**: `ItemIconLink` (shared by recipe ingredients and loot grids) — icon, hover/
  focus name tooltip, links to the item; recipes add `×amount`, loot shows no amount.
- **Environment**: `/environment` landing (category cards with counts / "coming soon"),
  `?category=` grids, `/environment/<slug>` detail (description + tier tabs of loot icons + source).
- **Tabs**: `ItemTabs` (client, ARIA tablist) — reused for item relationships and crate loot tiers.
- **Active filter chips** must NOT rely on `text-primary`-on-`base-300` or `primary`/`primary-content`
  (both fail AA in the light theme) — use `bg-base-300 text-base-content font-semibold`.

## Gotchas

- Re-seed is destructive (Neon dev DB). `prisma generate` can EPERM on Windows if a dev server holds
  the engine DLL — the client still updates; verify with a quick query rather than killing processes.
- Playwright `reuseExistingServer` will reuse a stale `:3000` dev server (serving old code) → false
  e2e failures; build + `next start -p <other>` + a throwaway `playwright.tmp.config.ts` to verify.

---

## Requirements / TODO (you specify here)

_Add desired features, content, and rules below — this section is owned by the maintainer._

- [ ] NPCs: no community-wiki source yet — decide on a data source or author manually.
- [ ] Landmarks/Game Modes: most wiki pages are empty stubs — consider authoring descriptions
      locally instead of relying on the wiki.
- [ ] Weapon/artillery pages: render the `StatBox` "Ammo" stat as an icon + tooltip
      (`ItemIconLink`) instead of the current plain text link, matching the loot/recipe
      icon grids. (Reverse view — ammo's "Used by" tab — is already implemented.)
- [ ] (add more here…)
