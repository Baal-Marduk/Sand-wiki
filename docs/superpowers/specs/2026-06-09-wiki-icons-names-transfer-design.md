# Wiki: transfer matched icons + real names from scraper

**Date:** 2026-06-09
**Status:** Approved (brainstorm)
**App:** `sand-wiki/` (Next.js 16 + Prisma 6 + Neon), on `master`.
**Source:** `sand-scraper` worktree (`feat/sand-scraper-impl`), `out/` outputs.

## Goal

The wiki currently seeds from an older scraper snapshot that lacks real display
names/descriptions, and renders a placeholder glyph for every item. The scraper
now extracts real localized English names (`displayName`/`description`) and, with
the now-completed `icon_overrides.json`, maps (near) all items to sprite PNGs.
Transfer both into the wiki: real names become the primary item name, real
descriptions populate the detail page, and matched icons replace the placeholder
on grid cards, detail headers, and recipe tables.

## Non-goals (YAGNI)

- **No multiple languages.** English only (`Languages[0]`), which the scraper
  already extracts. No scraper localization changes.
- **No automated sync pipeline.** One-time copy of `out/data.json` + matched
  PNGs into the wiki, committed to the repo (matches how `data.json` was handled
  before). A future refresh is a manual re-copy.
- **No icon for unmatched items.** Any item missing from `icons.json` keeps the
  existing placeholder.
- **No slug changes.** Slugs remain the scraper-derived identifiers so URLs and
  recipe references stay stable, even though the displayed name changes.

## Source data (scraper `out/`)

Regenerate once from the scraper worktree with the completed overrides:

```
.venv/Scripts/python -m sand_scraper --icons --validate
```

Produces:
- `out/data.json` = `{meta, items[], recipes[]}`. Each item already carries
  `displayName` (real name, e.g. "The Great Silence") and `description`. Two
  items lack `displayName` and fall back to the derived `name`.
- `out/icons.json` = `{ itemId: "icons/icon_*.png" }` — only matched items
  appear. Keyed by `item.id` (e.g. `item_antiReactorGun`), which matches
  `data.json` item `id`.
- `out/icons/*.png` — 1172 sprites; only those referenced by `icons.json` are
  copied to the wiki.

The plan step will report the final match count after regeneration (expected
~123/123).

## Wiki changes

### Assets (committed)
- Copy fresh `out/data.json` → `sand-wiki/prisma/data.json`.
- Copy each PNG referenced in `out/icons.json` → `sand-wiki/public/icons/`
  (~120 small files), committed to the repo so the build is self-contained.

### Schema (Prisma migration `add_item_icon`)
Add two nullable columns to `Item`:
- `icon String?` — web path, e.g. `/icons/icon_antiReactorGun.png`. Null → placeholder.
- `derivedName String?` — the scraper-derived descriptive name, retained for
  search matching only (not displayed). See Search.

### Seed (`prisma/seed.ts`)
Extend `ScrapItem` with `displayName?`, `description?`. Per item:
- `name = displayName ?? name` (real name primary; derived fallback).
- `derivedName = <derived name>` (the scraper `name` field).
- `description = description ?? undefined`.
- `icon`: if `icons.json[item.id]` exists, store `"/icons/" + basename(path)`.

`seed.ts` reads `out/icons.json` (copied alongside, or read from
`prisma/icons.json`) to build the id→icon map. **Decision:** copy `icons.json`
to `prisma/icons.json` and read it in the seed (keeps the seed's inputs together
under `prisma/`).

### Rendering
- **`ItemIcon`** (the documented single swap point): accept an optional `icon`
  prop. When present, render `<img src={icon} alt={name}>` filling the existing
  sized box (object-contain); otherwise the current `▦` placeholder span.
  Plain `<img>` from `/public` — no `next/image` loader config; sprites are tiny
  and local.
- Thread `icon` through every call site:
  - Item detail header (`items/[slug]/page.tsx`) — already passes `item.name`.
  - Recipe tables: the line projection in `recipes.ts` (`toRecipeCard` / line
    mapping) must carry each line item's `icon`; `recipe-cells.tsx` passes it on.
  - **Item grid cards** (`ItemCard.tsx`) — add `ItemIcon` to each card (new;
    grid currently has no icon).
- Query field selection (`queries.ts`, search-index route) extended to include
  `icon` (and `derivedName` where search needs it).

### Search (`/api/search-index` + `src/lib/search.ts`)
Because `name` becomes the real game name, the descriptive derived name would
otherwise become unsearchable (e.g. typing "anti reactor gun" would not find
"The Great Silence"). Fix:
- `search-index` route selects `slug, name, category, derivedName`.
- `IndexItem` gains `derivedName?`.
- `searchSuggestions` matches the query against **both** `name` and
  `derivedName`; the suggestion still **displays** `name`.

## Data flow

```
scraper out/data.json  ─copy─►  prisma/data.json ─┐
scraper out/icons.json ─copy─►  prisma/icons.json ┤─ seed.ts ─► Postgres (Item.icon, name, derivedName, description)
scraper out/icons/*.png ─copy─► public/icons/*.png                 │
                                                                   ▼
                          queries.ts (select icon, derivedName) ─► pages/components
                          ItemIcon: <img src={icon}> | placeholder
                          search-index + searchSuggestions: name ∪ derivedName
```

## Testing / verification

- Unit (vitest): `searchSuggestions` matches on derivedName; `ItemIcon` renders
  `<img>` when `icon` set and placeholder when not (component or pure-logic test
  as fits existing patterns).
- Seed sanity: items with a mapped icon get a `/icons/...` path; name precedence
  (displayName over derived) holds; the two no-displayName items fall back.
- Full gate (per wiki convention): `npx prisma generate` → seed →
  `vitest`, `tsc`, `eslint`, `next build`, Playwright e2e + axe in **both**
  themes. axe must still pass with real `<img>` icons (alt text present).

## Risks / constraints

- **DB**: dev data is the disposable Neon seed; re-seeding is safe. `.env` with
  `DATABASE_URL` must be present for seed/e2e (recreate from the Neon dev string
  if missing). `prisma migrate dev` is fine; a full reset would need
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
- **Prisma v6 pin** and **Next 16** conventions unchanged.
- **PATH/PowerShell**: run wiki Node commands via the PowerShell tool after a
  PATH refresh; the scraper run uses its `.venv` Python from its worktree.
- **axe**: every `<img>` carries `alt={name}`; decorative placeholder stays
  `aria-hidden`. Verify no contrast/role regressions in both themes.
