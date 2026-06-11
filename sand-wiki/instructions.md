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
  `storageStack`, `workbenchTier`, `icon`, **`rarity`** (string, indexed),
  flat wiki-stat columns **`statType`/`statValue`/`damage`/`playerDamage`/`tramplerDamage`/
  `splashDamage`/`magazine`/`ammoName`**, and recipe relations (`producedBy`/`usedIn`).
  Ammo↔weapon linking is derived from `ammoName` caliber families (`src/lib/ammo.ts`) — there is
  deliberately NO ammo FK: `ammoName` ↔ ammo item is 1:1 in the wiki data, so a relation column
  (`ammoItemId`, removed 2026-06-11) added nothing. Resolve by name if an exact item is needed.
- **`Recipe`** / `RecipeInput` / `RecipeOutput` — crafting graph; ingredients reference items.
- **`EnvEntity`** — environment content: `slug`, `category`, `name`, `description`, `sourceUrl`,
  `icon`; loot tables (loot containers only) are relational: **`lootTiers`** → **`LootTier`**
  (`tier`, `col1–3Label`, `sortOrder`, unique per entity+tier) → **`LootEntry`** (`item?` FK with
  `name` display fallback, `value1–3` strings like `"10-20"`, `sortOrder`, unique per
  tier+sortOrder).
- **`TramplerPart`** — `costEntries` → **`TramplerPartCost`** (`item?` — null for Crowns, `name`,
  `amount`, `sortOrder`, unique per part+sortOrder).

## Taxonomy (`src/lib/taxonomy.ts` — single source of truth)

- **Sections** (nav): Items (data), Environment (data), Tramplers / Tech / Tools (placeholders).
- **Item categories**: weapons, artillery, resources, attire, tools, medical, ammo, misc.
  - `categoryForItem(type, name, slug)` maps the scraper's game `type` → category at seed time:
    weapon types with a `\d+\s?mm` name → **artillery**; per-slug overrides in `CATEGORY_OVERRIDES`
    (e.g. untyped M1866 → weapons, MedKit → medical); `ENERGY` → tools.
- **Environment categories**: loot-containers, landmarks, game-modes, npcs (npcs has no source yet).
- **Rarity** (`src/lib/rarity.ts`): Common, Uncommon, Rare, Noteworthy, Remarkable, Experimental
  (tiers 1–6) → fixed game-palette colors (Rare=blue tier 3, Noteworthy=purple tier 4, matching
  the in-game palette). Rarity tints the item icon background + drives a filter.
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
3. **Seed** (`prisma/seed.ts`) **upserts by `slug`**, merging the committed JSON snapshots —
   row IDs stay stable across re-seeds. Update payloads omit fields the source has no value for,
   so manual edits to source-empty fields survive; a field the scraper HAS a value for is
   overwritten (values never transition back to NULL via the seed). Rows whose slug leaves the
   snapshot are pruned (with a log line). Fully scraper-owned child rows (recipe lines, loot
   tiers/entries, cost rows) are recreated each seed. Invalid categories now throw instead of
   skipping; post-seed count assertions guard duplicate slugs.
   **Re-seed = `npm run db:seed`** (against the Neon dev DB).
4. **Refresh data** = run the relevant importer (`node prisma/import-*.mjs`) then re-seed.

Community-wiki content is uneven/stubby (many landmark pages are empty; some loot tables sparse).
Imports copy what exists and link back via `sourceUrl`.

## Backoffice (Directus, local Docker)

- `npm run directus:up` → http://localhost:8055 (admin creds in `.env`: `DIRECTUS_*`; image pinned
  to the version the committed schema snapshot was taken with).
- Runs against the same Neon dev DB. System tables live in the `directus` Postgres schema
  (`DB_SEARCH_PATH=directus,public`) so `prisma migrate` never sees them — do NOT move them to
  `public`. The schema must exist before first boot:
  `'CREATE SCHEMA IF NOT EXISTS directus;' | npx prisma db execute --stdin --schema prisma/schema.prisma`.
- Collection config is snapshotted to `directus/snapshots/snapshot.yaml`
  (`npm run directus:snapshot` / `directus:apply`). After changing the data model in the Studio,
  re-snapshot and commit the diff. Directus names M2O fields after the FK column (`itemId`,
  `recipeId`, …), not Prisma's relation names.
- **Recipes are editable as one document**: `Recipe.inputs`/`outputs` are O2M editor fields
  (alias fields + `one_field` on the FK relations) — add/edit lines inline, item picked from a
  dropdown. NB: hand-authored recipes are still wiped by `npm run db:seed` (prune + line
  recreation) — avoid re-seeding after hand-authoring, or ask for the `manual`-flag seed change.
- **Icons render in the Studio** via a local display extension
  (`directus/extensions/directus-extension-display-image-path`, mounted by compose; no build
  step — hand-written ESM): shows `icon` paths as thumbnails prefixed with a base URL
  (configured to `http://localhost:3000`, where the Next app serves `public/icons/`). Needs the
  compose CSP override `CONTENT_SECURITY_POLICY_DIRECTIVES__IMG_SRC` and the Next dev server
  running. Applied to `Item`/`EnvEntity`/`TramplerPart.icon`; the Item list shows an icon column.
  **Dev-only as configured** — the production checklist (baseUrl, CSP, PUBLIC_URL, hosting) is
  tracked in `TODO.md`.
- Field interfaces (in the snapshot): taxonomy-owned sets are **closed dropdowns**
  (`Item.rarity`/`Item.category`, `EnvEntity.category`, `TramplerPart.category`); wiki-sourced
  sets are **dropdowns with "other" allowed** (`Item.statType`/`ammoName`/`workbenchTier`,
  `LootTier.tier`/`col1–3Label`, `Recipe.workbench`, `TramplerPart.dimensions`/`researchNode`/
  `researchTier`) — when the wiki introduces a new value, add it to the choice list; all FK
  fields are relational selects displaying names instead of raw ids. No DB-level enums on
  purpose: Directus wouldn't auto-render them, value sets move (taxonomy + wiki), and the seed
  already validates the closed sets.
- Edits made in Directus survive `npm run db:seed` (upsert-by-slug), EXCEPT fields the scraper has
  a value for — those are overwritten. Scraper-owned child rows (recipe lines, loot tiers/entries,
  cost rows) are always recreated. **Rows created in Directus are deleted on re-seed** (the prune
  removes any slug not in the snapshot) — don't author new entities there until the corrections
  workflow (TODO #15–16) lands.
- **This machine**: Docker lives inside WSL2 Ubuntu — run compose via
  `wsl -e bash -lc "cd /mnt/d/Documents/SandLabs/sand-wiki && docker compose …"` (the npm scripts
  are portable; the WSL wrapper is machine-specific). WSL's DNS is currently broken
  (Tailscale-managed resolv.conf) — a gitignored `docker-compose.override.yml` pins container DNS
  so Directus can reach Neon; fix WSL DNS to retire it. WSL idles out ~15s after the last wsl.exe
  session closes, taking the container with it (`restart: unless-stopped` brings it back when WSL
  returns).
- Gotchas: `docker compose exec` right after `directus:up` can race a cold container (~10s boot);
  `npm run directus:down` stops every service in the compose file; admin email must not use a
  `.local` TLD (Directus validator rejects it).
- **`DIRECT_DATABASE_URL` (the Neon URL without `-pooler`) is required twice**: prisma migrate's
  advisory lock sticks to pgbouncer backends (hanging deploys on the pooler URL) — the schema's
  `directUrl` routes the CLI around the pooler; and **Directus itself must use it** — its
  `DB_SEARCH_PATH` relies on `SET search_path`, which Neon's transaction-mode pooler does not
  preserve across queries (symptom: intermittent 500s / `42P01 relation does not exist` on
  login). Only the Next.js app stays on the pooled `DATABASE_URL`.

## UI conventions

- Reduced corner radius (squared look): `--radius-box: .25rem`, `--radius-field: .1875rem`.
- **Cards**: big icon left, name (+ category) stacked; rarity tints the icon background.
- **Item detail**: header (rarity-tinted icon, rarity badge, category) + `StatBox` (Damage/Magazine/
  Type/Ammo/Value, player/trampler/splash for ammo) + tabs (Crafted by / Used in / Buy / Sell /
  **Loot**) + right details panel.
- **Items list — layout**: server component reading `searchParams`. Content grid is
  `sm:grid-cols-2 xl:grid-cols-3 gap-3` inside an `lg:grid-cols-[1fr_220px]` shell (cards + sticky
  nav) — this is the **canonical list grid**; new list pages (environment, future tramplers) should
  match it. Ordered alphabetically by `name` (`item-filter.ts`, `orderBy:{name:"asc"}`) — this is the
  default; rarity/type-based ordering is a *desired change*, tracked in `TODO.md`, not yet shipped.
  `ItemCard` = `card card-side`, rarity-tinted icon, truncated name, Buyable/Sellable badges.
  `CategoryQuickNav` is a sticky vertical sidebar on `lg+` and a horizontal-scroll chip row below;
  active item uses `aria-current="page"`. Result count lives in an `aria-live="polite"` badge.
- **Items list — filters**: all filtering is URL-driven and server-side — `?q=` (case-insensitive
  substring on `name`/`derivedName`), `?category=`, `?rarity=` — and they always **AND-combine** in
  the Prisma `where` (`item-filter.ts`); switching category preserves `q`/`rarity` and vice versa.
  Treat this precedence as fixed. `RarityFilter` is a server component of `Link`s that preserves the
  other params, renders **only** rarities present in the current (category+query) result set, ordered
  by game tier, with an "All" reset chip. When filters match nothing, the list renders an explicit
  `No items match your filters.` message (not a bare blank grid) and the count badge reads
  `0 result(s)`. (Active-chip styling rule is the AA bullet below.)
- **Search-as-you-type** (`SearchBox`, client): fetches `/api/search-index` once per page load
  (singleton promise; route sends `Cache-Control: public, max-age=3600`, payload
  `{slug,name,category,derivedName}`). Matching is instant (no debounce) — case-insensitive substring
  over item `name`, `derivedName`, and category labels, capped at 8 results. Results mix
  category-filter rows ("filter" badge → `/items?category=`) and item rows ("page" badge → detail).
  Full combobox a11y: `role="combobox"` with `aria-expanded`/`-controls`/`-autocomplete="list"`/
  `-activedescendant`, listbox/option roles, and ArrowUp/Down + Enter + Escape nav. The dropdown
  renders only when there are matches, so the no-matches path leaves it closed (`aria-expanded`
  flips to `false`) rather than showing an empty listbox — but there is currently **no live region
  announcing the result count** to screen readers (known a11y gap). Two variants: `navbar` (hidden on
  the homepage) and `hero`. Indexes items + categories only — landmarks/loot containers are not yet
  searchable.
- **Icon + tooltip**: `ItemIconLink` (shared by recipe ingredients and loot grids) — icon, hover/
  focus name tooltip, links to the item; recipes add `×amount`, loot shows no amount.
- **Environment**: `/environment` landing (category cards with counts / "coming soon"),
  `?category=` grids, `/environment/<slug>` detail (description + tier tabs of loot icons + source).
- **Tabs**: `ItemTabs` (client, ARIA tablist) — reused for item relationships and crate loot tiers.
- **Active filter chips** must NOT rely on `text-primary`-on-`base-300` or `primary`/`primary-content`
  (both fail AA in the light theme) — use `bg-base-300 text-base-content font-semibold`.

## Gotchas

- Re-seed upserts by slug (no longer destructive), but it still overwrites scraper-sourced fields
  and recreates scraper-owned child rows — see Data pipeline step 3 before relying on manual edits.
- `prisma generate` can EPERM on Windows if a dev server holds
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
