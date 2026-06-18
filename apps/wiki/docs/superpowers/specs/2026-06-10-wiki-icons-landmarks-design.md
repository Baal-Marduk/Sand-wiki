# SAND Wiki — category icons, loot icon display, Landmarks/Game Modes, instructions.md

Date: 2026-06-10

## Goal

Four related polish/content changes:
1. Replace category **color dots** with monochrome **react-icons** glyphs.
2. Loot display → **item icons + tooltips** (like recipes); drop the amount columns everywhere.
3. **Populate Landmarks (15) + Game Modes (2)** (description-only, same pipeline as loot containers).
4. Start **`sand-wiki/instructions.md`** — a living conventions doc + a user-owned requirements section.

## Decisions (from brainstorming)

- Category icons are **monochrome** (`currentColor`); fully drops per-category color-coding in the UI.
- **Drop amounts everywhere**: crate loot = icon grid w/ tooltips; item "Loot" tab = Crate + Tiers only.
- Landmarks/Game Modes are **description-only** (no infoboxes / no loot tables); NPCs stays "coming soon".
- `instructions.md`: I draft conventions + a clearly-marked "Requirements / TODO" section for the user.

---

## §1 — Category icons (react-icons)

Add dependency **`react-icons`** (`npm i react-icons`).

**New `src/components/CategoryIcon.tsx`** (server-safe — react-icons render plain SVG):
```tsx
import type { IconType } from "react-icons";
import { GiPistolGun, GiFieldGun, GiOreMound, GiArmorVest, GiWrench, GiFirstAidKit,
  GiAmmoBox, GiCardboardBox, GiOpenChest, GiCastle, GiGamepad, GiPerson } from "react-icons/gi";

const ICONS: Record<string, IconType> = {
  weapons: GiPistolGun, artillery: GiFieldGun, resources: GiOreMound, attire: GiArmorVest,
  tools: GiWrench, medical: GiFirstAidKit, ammo: GiAmmoBox, misc: GiCardboardBox,
  "loot-containers": GiOpenChest, landmarks: GiCastle, "game-modes": GiGamepad, npcs: GiPerson,
};

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICONS[slug] ?? GiCardboardBox;
  return <Icon aria-hidden className={className ?? "size-4 shrink-0"} />;
}
```
(At implementation, verify every imported name resolves in `react-icons/gi`; swap any that don't to a close equivalent and note it.)

**Replace the color dot** (`<span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(...) }} />`) with `<CategoryIcon slug={...} />` in:
- `src/components/CategoryTag.tsx`
- `src/components/CategoryQuickNav.tsx`
- `src/components/MainNav.tsx` (dropdown items)
- `src/components/SearchBox.tsx` (autocomplete options — only for `kind === "category"` rows; item rows currently also show a dot → replace with the item's category icon)
- `src/app/environment/page.tsx` (landing category cards)

Remove now-unused `categoryColor` imports from those files. Keep `categoryColor`/`CATEGORY_COLORS` + their tests in `taxonomy.ts` (still exported library helpers; `rarityColor` is separate and unaffected).

A11y: icons are `aria-hidden`; the category **label text** stays beside them, so meaning isn't icon-only.

---

## §2 — Loot display: icons + tooltips, no amounts

**Shared tooltip icon.** Extract the recipe-cell "linked icon + name tooltip" into a reusable
component so loot and recipes share one implementation:
- New `src/components/ItemIconLink.tsx` — props `{ slug?: string; name: string; icon?: string | null; amount?: number }`.
  Renders the `group`/`ItemIcon`/CSS-tooltip markup currently in `recipe-cells.tsx` `IngredientList`
  (icon size `recipe`, `aria-label={name}` on the link, dark tooltip on hover/focus). When `slug`
  is absent it renders the icon + tooltip with **no link**. When `amount` is set, shows `×{amount}`
  under it (recipes); when unset, no amount (loot).
- `recipe-cells.tsx` `IngredientList` is refactored to map rows to `<ItemIconLink … amount={r.amount} />`
  (behavior unchanged; recipe e2e must still pass).

**Crate detail (`LootTable.tsx`):** replace the `<table>` with a flex-wrap **icon grid** per tier:
`columns` prop is dropped; render `entries.map((e) => <ItemIconLink slug={e.slug} name={e.name} />)`
(no amount). Crate `[slug]/page.tsx`: pass only `entries` to `LootTable` (no `columns`).

**Item "Loot" tab (`CrateDropList.tsx`):** drop the Amount column. Group `drops` by crate →
one row per crate: **Crate** (link) + **Tiers** (the crate's tiers joined, e.g. "Normal, Rare, Very Rare").
`getCratesContaining` keeps returning `values/columns` (harmless); the component ignores them.

---

## §3 — Populate Landmarks + Game Modes

**`prisma/import-env-content.mjs`:** replace the single `members("Loot Container")` with a category
map and loop:
```js
const CATS = [
  { wiki: "Loot Container", slug: "loot-containers", loot: true },
  { wiki: "Landmarks", slug: "landmarks", loot: false },
  { wiki: "Gamemodes", slug: "game-modes", loot: false },
];
```
For each: fetch members; per page → `{ category: cat.slug, name, description: stripWikiMarkup(wt), sourceUrl }`,
and only when `cat.loot` also parse `loot = { tiers: … }`. Slugs via `titleToSlug`; on a slug collision
across categories, keep first + warn (none expected). Re-emit `env-content.json` (~24 entities).

Seed already handles any env category via `isEnvCategory`. After re-seed: landing shows counts for
Loot Containers / Landmarks / Game Modes; their category grids list entries; detail pages show
description + source. NPCs remains empty → "coming soon".

---

## §4 — `sand-wiki/instructions.md`

New file documenting (concise, current):
- **Overview** — what the wiki is; game "SAND: Raiders of Sophie".
- **Data model** — `Item` (category, rarity, stats JSON, recipes) and `EnvEntity` (category, description,
  sourceUrl, loot JSON); the taxonomy sections/categories.
- **Data pipeline** — game scraper (separate `sand-scraper`) → `prisma/data.json` + icons; community-wiki
  enrichment (`import-wiki-enrichment.mjs` for rarity/stats, `import-env-content.mjs` for environment),
  the pure parsers (`wiki-parse.mjs`, `wiki-text.mjs`), `wiki-overrides.json`; "refresh = run importer + re-seed".
- **Categories & rarity** — item categories, env categories, rarity scale + game-palette colors,
  `categoryForItem` mm/override rules; category icons via `CategoryIcon`.
- **UI conventions** — squared radius, card style, tabs (`ItemTabs`), icon+tooltip (`ItemIconLink`),
  rarity-tinted icons, a11y (axe must pass both themes), the `:3000` stale-dev-server e2e caveat.
- **## Requirements / TODO (you specify here)** — a clearly-marked, mostly-empty section with a couple
  of starter bullets, owned by the user for future specs.

Committed; updated as the project evolves. (Not the same as `AGENTS.md`, which stays the Next.js caveat.)

---

## Testing & verification

- **Unit:** existing parser + taxonomy + rarity tests still pass (no signature changes). `categoryColor`
  tests remain (function kept).
- **Build / lint** (confirm all `react-icons/gi` imports resolve; no unused `categoryColor` imports left).
- **e2e (Playwright):**
  - Crate detail: tier tabs show item **icon links** (e.g. a link to `/items/small-cannon-ammo`) and **no**
    "Shipwreck Amount"/"Count" column headers.
  - Item Loot tab: shows Crate link + tiers, no Amount header.
  - `/environment` shows Landmarks + Game Modes with counts (not "coming soon"); a landmark detail
    (e.g. `/environment/fort-arpad`) shows a description + source link.
  - Category nav/cards render icons (dots gone); axe clean both themes on `/items`, `/environment`,
    a crate, and an item page.
- **Data:** run importer → `env-content.json` has loot-containers + landmarks + game-modes; re-seed;
  `envCategoryCounts()` shows landmarks 15, game-modes 2.

## Risks / notes

- A react-icons glyph name might not exist exactly as listed — verify on build; substitute close matches.
- Landmark/game-mode prose are stubs (like loot containers); expected.
- Re-seed is destructive (Neon dev DB) — authorized per workflow.
- Dropping amounts is display-only; the scraped values remain in `loot` JSON for future use.
