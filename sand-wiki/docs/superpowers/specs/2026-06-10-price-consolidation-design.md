# Price Consolidation — Design

**Date:** 2026-06-10
**TODO item:** "Normalize buy/sell price on items details table and remove elsewhere" (TODO.md line 2)
**Status:** Approved, pending implementation plan

## Goal

Surface every money figure (buy price, sell price, intrinsic value) in exactly **one**
place on the item pages — the **Details** panel on the item detail page. Remove the
buy/sell/value displays that are scattered elsewhere (header badges, StatBox, the Buy/Sell
tabs, and the grid-card badges). The buyable/sellable tags are removed entirely for now.

## Current state (the "prices all over" problem)

Money/trade info currently appears in five places:

| Location | Renders | File |
|---|---|---|
| Detail header badges | `◈ Buyable` / `◈ Sellable` | `src/app/items/[slug]/page.tsx` |
| Detail StatBox | `VALUE N 🪙` (wiki `value` stat) | `src/components/StatBox.tsx` |
| Detail Buy/Sell tabs | quantity/price/per-unit table + "Best" | `src/components/TradeTable.tsx` |
| Detail Details panel | `Buyable`/`Sellable  N 🪙 / unit` | `src/lib/item-view.ts` + `ItemDetailsPanel` |
| Items grid cards | `◈ Buy` / `◈ Sell` badges | `src/components/ItemCard.tsx` |

The Details panel is the keeper; the other four are removed.

## Changes

### 1. Details panel is the single source (`src/lib/item-view.ts`)
- `ItemFacts` gains `value?: number | null`.
- `itemDetailRows` gains a **`Value`** row, rendered only when `value != null`:
  `{ label: "Value", value: formatCrowns(value), coin: true }` (coin sprite, no `/unit`).
- Keep the existing `Buyable` / `Sellable` rows (cheapest buy unit price / best sell unit
  price, `coin: true, unit: "/ unit"`).
- Row order: `Category → Stack size → Workbench tier → Resource → Value → Buyable → Sellable`
  (money grouped at the bottom).
- `availableTabs` drops the `buy` and `sell` pushes. The `TabId` union drops `"buy" | "sell"`.

### 2. Move Value out of StatBox (`src/components/StatBox.tsx`)
- Remove the `Value` cell (the `stats.value` → `{value} <CoinIcon/>` block).
- Remove the now-unused `CoinIcon` import.
- Keep `value?: number` in the `ItemStats` interface (it is still the DB stats-JSON shape;
  the detail page reads `stats.value` to feed the Details `Value` row).

### 3. Remove badges + Buy/Sell tabs (`src/app/items/[slug]/page.tsx`)
- Delete the header `◈ Buyable` / `◈ Sellable` badges.
- Delete the `buy` / `sell` entries from `tabContent` and the `TradeTable` import.
- Drop the unused `buy` / `sell` locals from the `const { ... } = trades` destructure
  (they were only feeding the badges/tabs; `itemDetailRows` reads `trades` directly for
  the price rows). Keep `crafts` / `usedInCrafts` (they feed the Crafted-by / Used-in tabs).
- Pass `value: stats?.value` into the `itemDetailRows(...)` facts argument.
- StatBox call is unchanged (it simply no longer renders a value cell).

### 4. Delete the Buy/Sell tab table
- **Delete `src/components/TradeTable.tsx`** (its only consumers were the buy/sell tabs).

### 5. Remove grid-card badges (`src/components/ItemCard.tsx`)
- Remove `buyable` / `sellable` from `ItemCardData` and the two badge `<span>`s.
- Grid cards then show icon + name + rarity tint only.

### 6. Delete the grid trade-flags query
- **Delete `getTradeFlags`** from `src/lib/queries.ts`. `CURRENCY_SLUG` is used **only**
  inside `getTradeFlags` in this file (verified), so also remove its
  `import { CURRENCY_SLUG } from "./trades"` line — otherwise eslint `no-unused-vars` fails.
- `src/app/items/page.tsx`: remove the `getTradeFlags` import + its `Promise.all` entry +
  the `buyable` / `sellable` props passed to `ItemCard`.

### 7. Consequent cleanup (`src/lib/trades.ts`)
- Delete `formatUnitPrice` (only `TradeTable` used it) and its test case.
- Keep `classifyTrades`, `TradeOption`, `withBest`, `formatCrowns` unchanged — `classifyTrades`
  still computes the buy/sell prices the Details rows use AND still separates trade-recipes
  from real crafts so the Crafted-by/Used-in tabs stay clean. `isBest`/`withBest` are left
  in place (harmless fields of a still-used return type; stripping them is test churn for no
  lint benefit).

## Tests
- `src/lib/item-view.test.ts`:
  - `availableTabs` "fixed order" test: drop the `buy` / `sell` expected entries.
  - `itemDetailRows`: add a case asserting a `Value` row appears when `value` is set
    (`{ label: "Value", value: "<n>", coin: true }`), and is absent when null/undefined.
  - The existing Buyable/Sellable-rows test is unchanged.
- `src/lib/trades.test.ts`: remove the `formatUnitPrice` test and drop it from the import.
- Existing `classifyTrades` tests unchanged.

## Out of scope
- Re-introducing buy/sell tabs or badges later (the data + `classifyTrades` remain, so this
  is a UI re-enable, not a re-build).
- Any change to how prices are computed or to the recipe/trade data model.

## Files touched
- Modify: `src/lib/item-view.ts`, `src/lib/item-view.test.ts`, `src/components/StatBox.tsx`,
  `src/app/items/[slug]/page.tsx`, `src/components/ItemCard.tsx`, `src/app/items/page.tsx`,
  `src/lib/queries.ts`, `src/lib/trades.ts`, `src/lib/trades.test.ts`.
- Delete: `src/components/TradeTable.tsx`.
