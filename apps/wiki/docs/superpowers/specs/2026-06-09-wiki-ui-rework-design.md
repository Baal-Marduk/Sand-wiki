# SAND Wiki — UI rework design

Date: 2026-06-09

## Goal

Rework the wiki's navigation, item taxonomy, cards, item-detail recipe display,
and global styling for a denser, sharper, more icon-forward look. Driven by a
RustClash-style reference: prominent icons, names on hover, squared corners.

## Scope

Six coordinated changes:

1. Fix the Items nav-dropdown hover gap.
2. Replace the `guns` category with `artillery` (data-layer only).
3. Redesign item cards (big icon + stacked name/category).
4. Item-detail recipe cells: icon-only with a custom name-on-hover tooltip; bigger icons.
5. Restructure the Items page: drop the filter bar, add a responsive sticky category quick-nav.
6. Reduce global corner radius; add ItemIcon sizes.

Out of scope: search behavior/index, trade tables, non-item sections, data scraping.

---

## §1 — Nav dropdown hover gap

**Problem:** `MainNav.tsx` dropdown uses `mt-1`, creating a 4px dead zone between
the trigger button and the menu. Moving the cursor across it drops the hover and
the menu closes.

**Change (`src/components/MainNav.tsx`):**
- Drop `mt-1`; keep the dropdown positioned `top-full` so it touches the trigger.
- Add `pt-2` (transparent) to the dropdown `<ul>` so the visual gap remains but the
  whole span stays inside the `group` hover region — no dead zone.
- Remove the `All {label}` link from the dropdown (per the All-category removal).
  The dropdown lists categories only.

**Verification:** Hovering "Items ▾" then moving down into the menu keeps it open;
clicking a category navigates to `/items?category=<slug>`.

---

## §2 — Taxonomy: drop Guns, add Artillery (data-layer only)

**Rule:** an item is `artillery` when its game type is a weapon type
(`WEAPON` / `WEAPON_BELT`) **and** its display name matches `/\d+\s?mm/i`
(a number followed by optional space and "mm", e.g. `40mm`, `85 mm`).
Otherwise weapon types are `weapons`. The split is computed **once, in the data
layer** (taxonomy mapping + seed). No consumer derives or remaps categories;
they all read the stored `category` string.

**Changes (`src/lib/taxonomy.ts`):**
- `itemCategories`: remove `{ slug: "guns" }`; add `{ slug: "artillery", label: "Artillery" }`.
  Final order: `weapons, artillery, resources, attire, tools, medical, ammo, misc`.
- `TYPE_TO_CATEGORY`: `WEAPON` and `WEAPON_BELT` → `weapons` (was `guns`).
- New `categoryForItem(type, name)`:
  - `const base = categoryForType(type)`.
  - If `base === "weapons"` and `/\d+\s?mm/i.test(name)` → return `"artillery"`.
  - Else return `base`.
  - `categoryForType` is unchanged otherwise and remains exported (type-only mapping).
- `CATEGORY_COLORS`: add `artillery` (use the old guns slate `#8b94a6`). Keep a `guns`
  entry as a harmless fallback so any legacy/stale value still renders a dot.

**Change (`prisma/seed.ts`):**
- Replace `categoryForType(i.type)` with `categoryForItem(i.type, i.displayName ?? i.name)`.
- The `isItemCategory(category)` guard still applies (now passes for `artillery`).

**Tests (`src/lib/taxonomy.test.ts`):**
- Update the "eight item categories" list to the new order (no `guns`, includes `artillery`).
- Update `categoryForType` weapon cases to expect `weapons`.
- Add `categoryForItem` cases: `("WEAPON", "40mm Cannon")` → `artillery`;
  `("WEAPON", "85 mm Howitzer")` → `artillery`; `("WEAPON", "Assault Rifle")` → `weapons`;
  `("WEAPON_BELT", "Belt")` → `weapons`; non-weapon type with "mm" in name
  (e.g. `("FOOD", "Yummy")`) stays in its mapped category (mm only matters for weapons).
- `CATEGORY_COLORS` test: ensure a color exists for every current category slug
  (now includes `artillery`).

**Re-seed:** Category is persisted, so a DB re-seed is required to apply the split.
Runs against the Neon dev DB and needs the seed data file present. The exact command
is confirmed with the user in the plan before running.

---

## §3 — Item cards (treatment 2)

**Change (`src/components/ItemCard.tsx`):** horizontal layout inside the link card:
- Left: big icon tile (new `card` ItemIcon size, ~72px), `decorative` (name is adjacent).
- Middle (`flex-1 min-w-0`): item **name** (font-medium), **category** below it
  (color dot + label, reuse the dot styling).
- Right: minimized badges stacked/aligned end — Tier (`T{n}`), Buy (`◈`), Sell (`◈`)
  shown only when applicable, with `aria-label`s preserved.
- Card keeps `bg-base-200 hover:bg-base-300 transition-colors`, whole card links to
  `/items/{slug}`, reduced radius from §6.

`ItemCardData` interface is unchanged.

---

## §4 — Recipe cells: icon-only + custom tooltip; bigger icons

Names show only on hover/focus in the recipe ingredient & output cells. Applies to
`IngredientList` (`src/components/recipe-cells.tsx`), used by `CraftTable` (Crafted-by)
and `UsedInTable` (Used-in). `TradeTable` has no item icons and is untouched.

**Change (`src/components/recipe-cells.tsx`):**
- `IngredientList` renders, per row: a **linked icon** (`/items/{slug}`) + `×{amount}`.
  No inline name text.
- Wrap each icon in a custom **CSS-only tooltip**: a `group` container with a child
  tooltip element shown via `group-hover` and `group-focus-within`. Dark theme
  (`bg-base-100`/near-black, `border-base-300`, base-content text, reduced radius,
  small arrow), positioned above the icon, `whitespace-nowrap`, `z`-raised.
- The icon is **no longer decorative**: pass the item name so `ItemIcon` renders a real
  `alt`/`aria-label`. The link gets `aria-label={name}` and is focusable, so keyboard
  users get the tooltip (`group-focus-within`) and SRs get the name. Tooltip element
  itself is `aria-hidden` (it duplicates the accessible name).
- Recipe icons use the new `recipe` ItemIcon size (~44px).

Stays a server component — no client JS added.

**Detail header icon:** already `lg` (112px); left as-is.

---

## §5 — Items page restructure + responsive sticky quick-nav

**Change (`src/app/items/page.tsx`):**
- Remove `<ItemFilters>` and its import. Delete `src/components/ItemFilters.tsx`.
  The workbench-tier filter is removed entirely; `listWorkbenchTiers` is no longer
  needed by this page (drop the call if unused elsewhere).
- Layout: `Items` `<h1>` + result-count line, then a two-column grid on `lg`
  (`lg:grid-cols-[1fr_220px]`, `items-start`): the item grid (left) and
  `<CategoryQuickNav>` (right).
- Default view (no `?category=`): show all items (full grid). Existing `?category=`
  and `?q=` filtering via `listItems(filter)` is unchanged; `isItemCategory` guard stays.

**New component (`src/components/CategoryQuickNav.tsx`):** server component.
- Props: `categories: Category[]`, `current?: string` (active category slug),
  `query?: string` (to preserve `?q=`).
- Each category is a `Link` to `/items?category={slug}` (append `&q=` when `query` set),
  with a color dot + label; the `current` one is highlighted (e.g. `bg-base-300`,
  `text-primary`, `aria-current="page"`).
- Responsive: on `lg+` a vertical **sticky** list (`hidden lg:block sticky top-[4.5rem]`,
  matching the navbar offset); below `lg` a horizontal scroll row of chips at the top
  (`lg:hidden flex overflow-x-auto`). One component renders both; the page places it
  once and CSS handles which form shows.
- An "All / Everything" affordance is **not** included (All category removed); the
  unselected state simply highlights nothing.

---

## §6 — Reduced radius + ItemIcon sizes

**Change (`src/app/globals.css`):** in **both** themes (`desertnight`, `desertday`):
- `--radius-box: 0.75rem` → `0.25rem`
- `--radius-field: 0.5rem` → `0.1875rem`

This squares cards, buttons, inputs, selects, and badges app-wide. (Slightly sharp,
not fully 0 — matches the approved mockup.)

**Change (`src/components/ItemIcon.tsx`):** extend the `size` union and `px` map:
- `sm`: `size-5` (existing, 20px)
- `recipe`: `size-11` (44px) — for recipe cells (§4)
- `md`: `size-12` (existing, 48px)
- `card`: `size-18` (72px) — for item cards (§3)
- `lg`: `size-28` (existing, 112px)

`rounded-box` on the icon now follows the smaller radius automatically. The decorative
vs labeled behavior (`alt`/`aria-label`/`title`) is unchanged; §4 simply passes
`decorative={false}`.

---

## Testing & verification

- **Unit:** updated `taxonomy.test.ts` (categories, `categoryForType`, new
  `categoryForItem`, colors). Existing `item-filter`, `search`, `item-view` tests must
  still pass (no behavior change there beyond the `guns`→`weapons/artillery` rename in
  fixtures if any reference `guns`).
- **e2e/manual:**
  - Nav: hover Items ▾, move into menu — stays open; no "All Items" link; categories
    include Artillery, not Guns.
  - Items page: no filter bar; quick-nav sticky on desktop, chip row on mobile; active
    category highlighted; navbar search still navigates.
  - Card: big icon, name+category stacked, badges right; squared corners.
  - Detail: recipe ingredients show icons + ×amount; hovering/focusing an icon shows the
    dark tooltip with the name; icons larger.
- **Re-seed** then spot-check a `*mm*` weapon lands in Artillery and a normal gun in Weapons.

## Risks / notes

- Re-seed is destructive (`deleteMany` then recreate) against the Neon dev DB — confirm
  with the user and ensure the seed data file is present before running.
- Search index / suggestions surface categories; after re-seed they reflect the new
  taxonomy automatically (no code change needed there).
- Known `guns` references (grep confirmed): `taxonomy.ts` (handled above) and two test
  fixtures — `item-filter.test.ts` and `search.test.ts` — where `guns` is an opaque
  category string the test logic doesn't depend on. Update those fixtures to a current
  slug (e.g. `weapons`) for cleanliness; no behavioral dependency. The kept `guns`
  color entry is only a render fallback, not an endorsed category.
- `listWorkbenchTiers` (queries.ts) is used **only** by the items page; after §5 it's
  unused. Leave the export in place (harmless) or remove it — implementer's call.
