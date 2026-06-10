# Item list filter & sort controls

**Date:** 2026-06-10
**TODO items addressed:** 3 (order by rarity/alphanumeric), 4 (order weapons by type), 5 (order artillery by type)

## Goal

Replace the rarity chip row on `/items` with a row of `<select>` controls that filter
and sort the item list, all driven through URL search params. Default ordering becomes
**rarity** (Common → Experimental) instead of alphanumeric.

## Controls

A single control row above the items grid, replacing the current `RarityFilter` chip row.
Three selects, each a thin client component that writes exactly one URL param and pushes
the new URL (`router.push`); the server re-renders and does all filtering/sorting.

| Select | Param | Scope | Options |
|---|---|---|---|
| **Sort by** | `?sort` | all categories | `Rarity` (default, absent param) · `Name (A–Z)` (`name`) |
| **Rarity** | `?rarity` | all categories | "All" + rarities present in current results |
| **Type filter** | `?class` or `?tier` | category-dependent | see below |

### Type-dependent third select

Chosen by the active category:

- **weapons / artillery / ammo → "Class"** (`?class`): caliber-class labels
  (Pistol, Rifle, Sniper, Shotgun, Autocannon, Naval, Rocket) derived from item
  name / `stats.ammoName` via `lib/ammo.ts`. Filtered **app-side** (caliber is derived,
  not a stored column).
- **all other categories → "Workbench tier"** (`?tier`): DB-level filter via the
  existing `buildItemQuery` `workbenchTier` support.
- If the active category has no values for its dimension (e.g. no items with a workbench
  tier), the third select is not rendered.

Options for the third select are scoped to the current category + query (the way
`listRarities` already scopes rarity options), so they only show values that exist in
the current context.

## Default sort

Absent `?sort` ⇒ **rarity ascending** (Common → Experimental, tier 1 → 6), with item
**name ascending as the tiebreaker**. `?sort=name` ⇒ name ascending only.

Rarity is a string whose tier order is non-alphabetical, so rarity sorting is performed
**app-side** after fetch using `rarityTier()`. Name sorting stays DB-level.

## Architecture

Keep DB-level and app-level concerns split, both unit-testable without a DB.

### `lib/item-filter.ts`

Extend `ItemFilter`:

```ts
export interface ItemFilter {
  query?: string;
  category?: string;
  workbenchTier?: number;
  rarity?: string;
  sort?: "rarity" | "name";   // new — default "rarity"
  weaponClass?: string;        // new — caliber-class label, app-side filter
}
```

- `buildItemQuery(filter)` (DB): `where` = category + query + rarity-equality +
  workbenchTier; `orderBy` = `{ name: "asc" }` (stable base ordering for both sort modes).
- New pure function `applyItemView(items, { sort, weaponClass })` (app-side):
  1. If `weaponClass` set, filter to items whose `weaponCaliber(slug, stats.ammoName)`
     maps (via `caliberLabel`) to that class.
  2. If `sort` is `"rarity"` (or undefined), stable-sort by `rarityTier(item.rarity)`
     ascending; the DB's name-asc order already provides the tiebreaker, so a stable sort
     preserves it.
  3. If `sort === "name"`, return as-is (DB already ordered by name).

  Returns the transformed item array. No DB types beyond the fields it reads
  (`slug`, `name`, `rarity`, `stats`).

### `lib/queries.ts`

- `listItems(filter)`: `buildItemQuery` → `prisma.item.findMany` → `applyItemView`.
- `listWorkbenchTiers(filter)`: change the currently-unused, unscoped helper to accept an
  `ItemFilter` and scope to category + query (drop any tier/rarity/class constraint), mirroring
  `listRarities`. Returns ascending distinct tiers.
- New `listItemClasses(filter)`: distinct caliber-class labels present among items matching
  category + query (weapons/artillery/ammo only). Derived app-side from fetched
  `{ slug, name, stats }` rows. Returns labels in the canonical class order from `ammo.ts`.

### Components

- **Delete** `components/RarityFilter.tsx` (chip row, no longer used).
- **Add** `components/FilterSelect.tsx` — generic `"use client"` select:
  props `{ name, label, value, options: { value: string; label: string }[], allLabel }`.
  On change: clone `useSearchParams`, set/delete `name`, `router.push(\`${pathname}?${qs}\`)`.
  Renders an accessible labelled native `<select>`.
- **Edit** `app/items/page.tsx`: parse/validate `sort`, `rarity`, `class`, `tier` from
  searchParams; build the `ItemFilter`; fetch items + option lists in parallel; render the
  three selects (third chosen by category). Validation mirrors existing `isRarity` /
  `isItemCategory` guards — unknown values are ignored.
- **Edit** `components/CategoryQuickNav.tsx`: preserve `?sort` across category switches
  (user's chosen ordering is category-agnostic); continue to drop `rarity` / `class` /
  `tier` (category-relative).

## Validation & edge cases

- Unknown/invalid param values are ignored (treated as absent), as `rarity`/`category`
  already are.
- A `?class` that isn't among the current category's available classes is ignored
  (no empty-list trap) — validated against `listItemClasses`.
- Switching category drops the type-dependent param, so a `class` from weapons can't
  leak into a tier-based category.

## Testing

- `item-filter.test.ts`: extend for `sort`/`weaponClass` in `buildItemQuery` (DB shape)
  and add `applyItemView` cases — rarity-tier ascending with name tiebreaker, name mode
  passthrough, class filtering, items with null rarity sorting to tier 0 (first).
- Pure-function tests only; no DB. Class derivation reuses already-tested `ammo.ts`.

## Out of scope

- Pagination / multi-sort.
- Sort direction toggles (only the two modes above).
- Persisting filter state beyond the URL.
