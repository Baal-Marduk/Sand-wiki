# Translucent rarity tile background + default rarity — design

TODO #9: "Make rarity background color slightly translucent like in game."
Plus: **every item must have a rarity — default to `Common` when there is no info.**

## Goal

Two related changes to how item rarity is shown:

1. **Translucent tile tint.** The item-icon tile is tinted with the item's rarity color.
   Currently the tint is the solid rarity hex; in-game the rarity color is a softened,
   slightly translucent wash. Make the tile background ~65% opacity so it reads as a tint.
2. **Universal rarity.** Many items have no rarity today (no wiki enrichment → `null` →
   no tint, no badge, absent from the rarity filter). Every item should carry a rarity;
   when no rarity info exists, default it to `Common`. After this, every item icon is
   tinted, every item shows a rarity badge, and the rarity filter covers all items.

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

The `bg-base-300` fallback is retained as defensive code, though after the default below
every item carries a rarity, so it effectively never fires for real items.

### Default rarity for all items (`src/lib/rarity.ts` + `prisma/seed.ts`)

Add a centralized default and apply it once, at seed time, so the stored `rarity` field is
always populated — keeping the rarity filter, sort, badge, and tile tint consistent:

```ts
// rarity.ts
export const DEFAULT_RARITY = "Common";
```

In `prisma/seed.ts`, the current logic leaves `rarity` undefined when enrichment has none:

```ts
let rarity: string | undefined;
if (e?.rarity) {
  if (isRarity(e.rarity)) rarity = e.rarity;
  else console.warn(`Unknown rarity "${e.rarity}" for ${i.slug} — skipped`);
}
```

Change so it falls back to `DEFAULT_RARITY` whenever a valid rarity is absent (unknown
strings still warn, then default):

```ts
let rarity = DEFAULT_RARITY;
if (e?.rarity) {
  if (isRarity(e.rarity)) rarity = e.rarity;
  else console.warn(`Unknown rarity "${e.rarity}" for ${i.slug} — defaulting to ${DEFAULT_RARITY}`);
}
```

`rarity` is then always a string; `prisma.item.create` stores it for every item.
Re-seed (`npm run db:seed`) to apply.

**Consequences (intended):** every item now has a translucent tile tint (Common = grey
for previously-untagged items), shows a rarity badge on its detail page, and is covered by
the rarity filter (which always includes Common).

## Testing

- **Vitest** (`src/lib/rarity.test.ts`):
  - `rarityBgColor` returns the solid hex + `A6` for a known rarity (e.g. `Noteworthy` →
    `#9C86B7A6`), is case-insensitive, and returns `null` for unknown/absent — mirroring
    the existing `rarityColor` tests.
  - `DEFAULT_RARITY` is a valid rarity (`isRarity(DEFAULT_RARITY)` is true) and equals
    `"Common"`.
- **Seed default** is verified by re-seeding and confirming zero items have a `null`
  rarity (`prisma.item.count({ where: { rarity: null } })` → 0).
- **Test audit:** check existing unit/e2e tests for assumptions that some item has *no*
  rarity (e.g. an item expected to render without a rarity badge). Update any such
  assertion, since every item is now at least `Common`.
- The existing `npm run test:e2e` axe gate (both themes) confirms no contrast/a11y
  regression. The tile background is decorative (the rarity name is always shown as text),
  and the icon image sits on top, so translucency does not affect any text contrast.

## Out of scope / notes

- No change to the rarity palette, tiers, or `rarityColor`.
- No new visual elements; purely softens an existing tint.
