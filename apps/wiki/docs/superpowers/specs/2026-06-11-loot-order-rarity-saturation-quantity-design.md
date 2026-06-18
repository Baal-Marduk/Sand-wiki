# Loot ordering, rarity saturation & recipe quantity

**Date:** 2026-06-11
**Status:** Approved (design)

## Goal

Three independent presentation tweaks to the wiki:

1. **Order container loot by rarity** — on environment-entity (container) detail pages,
   list each loot tier's items from Common → Experimental instead of the raw scrape order.
2. **More saturated rarity colors** — bump the palette so Common (grey), Uncommon (green),
   and Rare (blue) are easy to tell apart, keeping the muted in-game mood.
3. **More visible recipe quantity** — make the per-ingredient `×N` larger, bold, and
   full-contrast wherever it appears.

## 1. Loot ordering

`src/app/environment/[slug]/page.tsx` builds each tier's `LootTable` entries from
`t.entries` (currently in scrape/`sortOrder` order). Sort the mapped entries by:

- **primary:** rarity tier ascending (`rarityTier(rarity)`, 1=Common … 6=Experimental);
  unknown/absent rarity (tier `0`) sorts **last** (treat `0` as `Infinity`).
- **secondary:** item `name` A→Z (stable, deterministic within a tier).

Only this page changes. Recipes, ammo/used-by lists, and other icon lists keep their
existing order. A small reusable comparator `byRarityThenName` lives in `src/lib/rarity.ts`
(testable in isolation) and is applied in the page's `entries` map.

## 2. Rarity palette — moderate saturation boost

Replace the six `color` values in `RARITIES` (`src/lib/rarity.ts`). Names, tiers, ordering,
and all consumers (`rarityColor`, `rarityGradient`, `rarityTier`) are unchanged — only the
hex values move, so the gradient tiles and the detail-page rarity dot update automatically.

| Rarity | Old | New |
|---|---|---|
| Common | `#ADADAD` | `#AEAEB2` |
| Uncommon | `#889F83` | `#7CB079` |
| Rare | `#899FB7` | `#7AA8D2` |
| Noteworthy | `#9C86B7` | `#A37FC9` |
| Remarkable | `#E29554` | `#E59A52` |
| Experimental | `#D16469` | `#D85F64` |

`rarityGradient` keeps its formula (corner = `mix(c, #FFFFFF, 0.05)`, mid =
`mix(c, #14171F, 0.65)`, end `#11131A`); only the input `c` changes.

## 3. Recipe quantity visibility

`src/components/ItemIconLink.tsx` renders the amount as:
```tsx
{amount != null && <span className="text-xs text-base-content/60">×{amount}</span>}
```
Change the classes to **`text-sm font-bold text-base-content`** (larger, bold, full
contrast). Position (below the tile) and the `×` prefix are unchanged. This affects every
`×amount`: recipe ingredients/outputs (item detail) and trampler build-cost.

## Out of scope

- No data/seed/schema changes — palette and ordering are pure presentation.
- No new "delete"/edit affordances; this is display only.
- Quantity styling is a class swap, not a new badge component (Option C, not the corner-badge
  variant that was considered and rejected).

## Testing

- `src/lib/rarity.test.ts`: update the existing color assertions to the new hex values; add
  cases for `byRarityThenName` (Common before Rare; unknown rarity sorts after known;
  equal-tier ties break by name).
- The existing `rarityGradient` test **hard-codes the old Noteworthy hex `#9C86B7`** as the
  `mixHex` input, so it breaks on the palette change. Make it palette-independent by deriving
  the input from `rarityColor("Noteworthy")` (so the expected string tracks whatever the
  palette is), rather than re-hard-coding the new hex.
- Visual check: a container detail page shows loot Common→Experimental; grey/green/blue tiles
  are clearly distinct; recipe `×N` reads boldly.
