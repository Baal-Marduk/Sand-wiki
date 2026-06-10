# Translucent rarity tile background — design

TODO #9: "Make rarity background color slightly translucent like in game."

## Goal

The item-icon tile is tinted with the item's rarity color. Currently the tint is the
solid rarity hex; in-game the rarity color is a softened, slightly translucent wash over
the slot. Make the tile background ~65% opacity so it reads as a tint, not a solid fill.

## Scope

- **In scope:** the `ItemIcon` tile background (`src/components/ItemIcon.tsx`), the only
  place a rarity color fills a background.
- **Out of scope:** the small rarity badge dot on the item detail page
  (`src/app/items/[slug]/page.tsx:75`, a `size-2 rounded-full` indicator) stays **solid** —
  a tiny dot reads better at full opacity. No other rarity usage exists.

## Approach

Add a sibling helper to `src/lib/rarity.ts` that returns the translucent form of a rarity
color, keeping the existing `rarityColor` solid for the dot. Implement translucency by
appending an 8-digit-hex alpha suffix to the existing 6-digit hex — deterministic, pure,
and unit-testable. ~65% opacity → alpha byte `A6`.

### `src/lib/rarity.ts`

```ts
/** Alpha-blended rarity color for filled backgrounds (the item-icon tile), ~65% opacity —
 *  a softened tint matching the in-game slot wash. Solid `rarityColor` is kept for small
 *  indicators (the rarity badge dot). Null for unknown/absent. */
export function rarityBgColor(name?: string | null): string | null {
  const c = rarityColor(name);
  return c ? `${c}A6` : null; // 0xA6 ≈ 65% alpha
}
```

(`A6` = 166/255 ≈ 0.651.) 8-digit `#RRGGBBAA` hex is supported by all current browsers and
by the Chromium used in the e2e suite.

### `src/components/ItemIcon.tsx`

- Import `rarityBgColor` (replacing or alongside the current `rarityColor` import — the
  component only uses the color for the tile background, so it switches to `rarityBgColor`).
- The existing line `const tint = rarityColor(rarity);` becomes `const tint = rarityBgColor(rarity);`.
- No other change: `tint` already drives both the `style={{ backgroundColor: tint }}` and the
  `bg` / text-color fallback logic, which all still work with the translucent value.

The fallback when there is no rarity (`bg-base-300`) is unchanged.

## Testing

- **Vitest** (`src/lib/rarity.test.ts`): `rarityBgColor` returns the solid hex + `A6` for a
  known rarity (e.g. `Noteworthy` → `#9C86B7A6`), is case-insensitive, and returns `null`
  for unknown/absent — mirroring the existing `rarityColor` tests.
- The existing `npm run test:e2e` axe gate (both themes) confirms no contrast/a11y
  regression. The tile background is decorative (the rarity name is always shown as text),
  and the icon image sits on top, so translucency does not affect any text contrast.

## Out of scope / notes

- No change to the rarity palette, tiers, or `rarityColor`.
- No new visual elements; purely softens an existing tint.
