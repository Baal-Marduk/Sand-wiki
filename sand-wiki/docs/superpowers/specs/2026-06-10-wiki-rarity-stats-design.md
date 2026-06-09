# SAND Wiki — rarity + item stats (from sandgame.wiki) design

Date: 2026-06-10

## Goal

Enrich wiki items with **rarity** and **gameplay info fields** (weapon stats etc.)
sourced from the community wiki **sandgame.wiki** (the game files don't ship these —
see the 2026-06-10 rarity/stats investigation). Surface rarity as colored icon
backgrounds + a rarity quick-filter on the items list, and show the info fields as a
prominent stat box on item detail pages.

## Source data (sandgame.wiki, MediaWiki)

- MediaWiki API works: `https://sandgame.wiki/api.php?action=parse&page=<title>&prop=wikitext&format=json&formatversion=2`.
- Category enumeration: `action=query&list=categorymembers&cmtitle=Category:Weapons&cmlimit=500`.
- Weapon infobox is a `{{Weapons|...}}` template with params:
  `Name, Image, Rarity, Type, Mag, Damage, Ammo, Value`.
  - `Ammo` value is `{{Icon|<key>|3=<display name>|4=right}}` — the display name (param `3=`) is the join key to an ammo item.
  - `Name` is bolded wikitext, e.g. `'''M1866/9 "Einzel" Breechloader'''`.
- One wiki page can hold **multiple variants** via `<tabber>` (e.g. page "866/9 Rifle"
  contains both `M1866/9 "Einzel"` and `KF866/9R "Mehrzel"`, each its own `{{Weapons}}`).
- Pages may be `#REDIRECT [[Target]]`.
- Rarity values observed: `Common`, `Uncommon`, `Noteworthy` (more exist; the importer collects all).
- Non-weapon items (gear/utility) usually have **no infobox** — they get no stats (and
  rarity only if present somewhere). Partial coverage is expected and acceptable.

## Decisions (from brainstorming)

- **Import = one-off committed snapshot.** A Node script produces a committed JSON; the
  seed consumes it. Re-running is possible but not a maintained workflow.
- **Schema = hybrid.** `rarity` is a typed, indexed column (drives filter + color);
  variable fields live in a `stats Json?` column. No `externalUrl` (no external link shown).
- **Coverage = enrich what matches**, omit the rest (neutral icon, no stat box).
- **Rarity scale hardcoded** in `src/lib/rarity.ts` from the names the scrape surfaces.
- **Icon rarity treatment = tinted background tile** (the game's `bgDefault` palette).
- **Rarity filter = chip row above the grid.**
- **Detail = prominent stat box** under the header; rarity as a colored header badge.
- Recipe-table ingredient icons stay **neutral** (no rarity tint — avoids table noise).

---

## §1 — Data acquisition

**New: `prisma/import-wiki-enrichment.mjs`** (committed; lightly engineered one-off tool).

Flow:
1. Enumerate pages from `Category:Weapons`, `Category:Player_Weapons`, `Category:Mounted_Weapons`
   via `list=categorymembers`. Dedupe titles.
2. For each title, fetch wikitext (`action=parse&prop=wikitext`). If the page is
   `#REDIRECT [[X]]`, fetch `X` instead (one hop).
3. Parse **every** `{{Weapons|...}}` template in the wikitext (a tabber page yields >1).
   Extraction is a **pure function** `parseWeaponInfoboxes(wikitext): RawEntry[]` where
   `RawEntry = { name, rarity, type, mag, damage, ammoName, value }`:
   - Strip `'''bold'''` from `Name`.
   - `Ammo`: pull the `3=<display name>` arg from the inner `{{Icon|...}}`.
   - Numeric params (`Mag`, `Damage`, `Value`) parsed to numbers; non-numeric → omitted.
4. **Map each `RawEntry` to an item slug:** normalize `name` (lowercase, strip quotes/punctuation,
   collapse spaces) and match against a prebuilt index of item `displayName` and `derivedName`
   (read from `prisma/data.json`). Misses are resolved via committed `prisma/wiki-overrides.json`
   (`{ "<normalized wiki name>": "<item-slug>" }`). Still-unmatched → logged + skipped.
5. **Resolve `ammoName` → ammo item slug** by the same normalized-name index; unresolved → omit `ammoSlug` (keep nothing rather than a dangling ref), log a warning.
6. Emit `prisma/wiki-enrichment.json`, shape:
   ```json
   {
     "rifle-musket": {
       "rarity": "Common",
       "stats": { "type": "Single-Shot Rifle", "damage": 50, "magazine": 1, "value": 25, "ammoSlug": "ammo-9x42mm" }
     }
   }
   ```
   Keys present only when found. `rarity` omitted if absent.
7. Print a summary: pages scanned, entries parsed, matched, unmatched (listed), ammo unresolved.

**Tests:** `prisma/import-wiki-enrichment.test.ts` (or colocated) covers
`parseWeaponInfoboxes` with a fixture containing the real "866/9 Rifle" tabber markup
(two infoboxes) and a redirect string. Asserts both variants extracted with correct fields
and that the `Ammo` display name is pulled from `3=`. Network/CLI glue is not unit-tested.

**Note on accuracy:** the wiki is community-authored; values may be incomplete or wrong.
This is acceptable for v1 — the importer copies what's there; no validation beyond type coercion.

---

## §2 — Schema, seed, rarity taxonomy

**Migration `add_item_rarity_stats`** — add to `model Item`:
```prisma
  rarity String?
  stats  Json?
  @@index([rarity])
```

**New `src/lib/rarity.ts`** — single source for the rarity scale + colors:
```ts
export interface Rarity { name: string; tier: number; color: string }
export const RARITIES: Rarity[] = [
  { name: "Common",     tier: 1, color: "#ADADAD" },
  { name: "Uncommon",   tier: 2, color: "#889F83" },
  { name: "Noteworthy", tier: 3, color: "#899FB7" },
  { name: "Rare",       tier: 4, color: "#9C86B7" },
  { name: "Epic",       tier: 5, color: "#E29554" },
  { name: "Legendary",  tier: 6, color: "#D16469" },
];
```
(The tier-4/5/6 *names* are provisional — locked to whatever the scrape surfaces before
finalizing. The colors are the game's `bgDefault` palette, fixed.)

Helpers (pure, unit-tested in `rarity.test.ts`):
- `rarityColor(name?): string | null` — palette color, or `null` for unknown/absent (→ neutral tile).
- `rarityTier(name?): number` — tier for ordering; unknown → 0.
- `isRarity(name): boolean` — known rarity name (case-insensitive match; canonical-cased stored).
- `KNOWN_RARITY_NAMES: string[]` — for filter validation.

**Seed (`prisma/seed.ts`):** load `wiki-enrichment.json` once; for each item, if an entry
exists by slug, set `rarity` (validated via `isRarity`, else null + warn) and `stats`
(stored as-is). No network. Re-seed required to apply.

**Queries/filter:**
- `ItemFilter` (`src/lib/item-filter.ts`) gains `rarity?: string`; `buildItemQuery` adds
  `where.rarity = rarity` when set and valid. Unit-tested.
- `listItems` already takes an `ItemFilter` — no signature change beyond the new optional field.

---

## §3 — UI

**`src/lib/rarity.ts`** is the only place colors are defined (consumed by all UI below).

**`ItemIcon.tsx`** — new optional prop `rarity?: string | null`. When `rarityColor(rarity)`
is non-null, set the tile background to that color (inline style) instead of `bg-base-300`.
The placeholder glyph color may need darkening for contrast on light tints (use a fixed dark
glyph color when tinted). `decorative`/`alt` behavior unchanged.

**`ItemCard.tsx`** — pass `rarity` to `ItemIcon`; add `rarity` to `ItemCardData`. The items
page already maps DB rows → `ItemCardData`; include `rarity: i.rarity`. (Rarity name is not
shown as card text — the tint conveys it; the name is still accessible on the detail page.)

**`RarityFilter.tsx`** (new, **server component** — plain `Link`s, like `CategoryQuickNav`) —
a horizontal chip row: "All" + one chip per rarity **present in the current result set**, each
with a color dot + name. Each chip is a `Link` that sets/clears `?rarity=<name>` while preserving
`?category=`/`?q=`. Active chip highlighted (`aria-current="page"`).
Rendered above the grid on the items page (between the result count and the grid).
- Determining "rarities present": the page computes the distinct rarities among the filtered
  items (before the rarity filter is applied) so the chips reflect the category/search context.
  Simplest: query distinct rarities for the current category/query via a small `listRarities(filter)`
  helper in `queries.ts` (filter without the rarity constraint).

**`items/page.tsx`** — read `?rarity=`, validate via `isRarity`, pass into the filter; render
`<RarityFilter>` with the available rarities + current selection. Quick-nav (category) unchanged.

**`StatBox.tsx`** (new) — given an item's `stats` object, render a small responsive grid of
the present fields with friendly labels and ordering: **Damage, Magazine, Type, Ammo, Value**.
- `Ammo` renders as an internal `Link` to `/items/<ammoSlug>` (the display label is the ammo
  item's name; if `ammoSlug` unresolved, omit the row).
- `Value` shown as `<n> ◈`.
- Renders nothing if `stats` is null/empty.

**`items/[slug]/page.tsx`** — under the header, render `<StatBox stats={item.stats} ...>`;
add a rarity **badge** in the header badge row (colored dot via `rarityColor`, label = rarity
name) and pass `rarity` to the header `ItemIcon`. Right `ItemDetailsPanel` keeps
category/stack/workbench/buy-sell (rarity not duplicated there).

**A11y:** color dots/tints are decorative (`aria-hidden`); the rarity **name** is always
present as text (filter chip label + detail badge), so color is never the sole signal.
Stat box uses a `<dl>` or labeled cells. axe must stay clean in both themes.

---

## Testing & verification

- **Unit (Vitest):** `parseWeaponInfoboxes` (tabber + redirect fixture); `rarity.ts`
  helpers (color/tier/known-name, unknown fallback); `buildItemQuery` rarity branch.
- **Build/lint.**
- **e2e (Playwright):**
  - Items page shows a rarity chip row; clicking a rarity sets `?rarity=` and narrows the grid.
  - A known weapon detail page (e.g. `rifle-musket`) shows the stat box with Damage/Magazine/Value
    and an Ammo link; header shows the rarity badge.
  - axe clean on `/items` and an enriched detail page (dark + light).
- **Data:** run the importer → spot-check `wiki-enrichment.json` (e.g. `rifle-musket` rarity
  Common, damage 50); re-seed; confirm a query shows non-null `rarity`/`stats` for weapons.

## Risks / notes

- Re-seed is destructive (Neon dev DB) — confirm before running (per established pattern).
- Name→slug matching is the main fragility; the overrides file + logged unmatched list make
  gaps visible. Weapons should match well; many items legitimately get nothing.
- Community-wiki values may be wrong/missing — v1 copies as-is, no cross-checking.
- Rarity tier-4/5/6 names are provisional until the scrape confirms the real vocabulary;
  colors are fixed from the game palette.
- `imageAlt` column remains dead (pre-existing); not touched here.
