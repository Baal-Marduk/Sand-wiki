# Search Enrichment + Clickable Buy Prices — Design

**Date:** 2026-06-17
**Status:** Approved, implementing directly (small UI change)

Two small, related front-end enhancements sharing the existing enriched-icon pattern
(`ItemIcon` + `rarityColor`, already used by the contribute pickers).

## 1. Enriched search (home hero + top-bar)

The single `SearchBox` component (`variant: "hero" | "navbar"`) powers both. Today every
result renders a generic `CategoryIcon` and a default-colored label. Enrich **item** results
only; **Category** (filter) and **Place** (loot container / landmark) results are unchanged.

- `IndexItem` (`src/lib/search.ts`) gains `icon: string | null` and `rarity: string | null`.
- `/api/search-index` (`route.ts`) adds `icon: true, rarity: true` to the item `select`
  (places/categories unchanged). ~50 bytes/item more; still `cache-control: public, max-age=3600`.
- `SearchBox`: the internal `Flat` type gains optional `icon?`/`rarity?`; `buildGroups` passes
  them through for the `item` group only. In the row:
  - `kind === "item"` → render `<ItemIcon name={f.label} icon={f.icon} rarity={f.rarity}
    categorySlug={f.category} size="sm" decorative />` in the icon column, and color the label
    with `rarityColor(f.rarity) ?? undefined` (inline style). The `highlightMatch` `<b>` keeps
    its `text-primary` highlight; the surrounding text takes the rarity color.
  - `kind === "category" | "place"` → unchanged (bordered `CategoryIcon` glyph, default label).
  - Verify `ItemIcon size="sm"` fits the existing `grid-cols-[32px_1fr_auto]` icon column; if it
    renders smaller/larger, keep it visually centered (adjust the column or wrap if needed).

## 2. Clickable buy-tab price components (`src/components/BuyOptions.tsx`)

Each cost chip becomes a link to the cost item's page.

- A cost with a non-null `slug` (all priced components, including Coin Crown → `/items/coin-crown`)
  renders as `<Link href={`/items/${c.slug}`}>` with a hover affordance (`hover:border-primary`).
  A cost with `slug === null` stays a plain `<span>`.
- Move the `+` separator OUT of the chip so it sits *between* chips and isn't part of the
  clickable target.
- Icon + amount + name remain inside each chip (the `ItemIcon` already shows rarity).

## Testing / verification

No new pure logic to unit-test; the existing suite must stay green. Gate on `npm run lint`,
`npm run build`, and a manual look at the hero search, navbar search, and an item's Buy tab.

## Files

- `src/lib/search.ts` (IndexItem fields)
- `src/app/api/search-index/route.ts` (select)
- `src/components/SearchBox.tsx` (item row enrichment)
- `src/components/BuyOptions.tsx` (clickable price links)

## Out of scope

- Enriching Category/Place search results (kept as generic glyphs per the approved scope).
- Any change to search ranking/matching or the dropdown groups/order.
