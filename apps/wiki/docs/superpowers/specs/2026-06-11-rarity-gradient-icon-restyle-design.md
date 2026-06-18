# Rarity-gradient icon restyle

**Date:** 2026-06-11
**Status:** Approved (design)

## Goal

Rework item-icon presentation to read more like the in-game inventory slot:

1. The rarity tile background becomes a **gradient from the top-left corner** (bright
   rarity color in the corner fading to near-black at the bottom-right), replacing
   today's flat 65%-alpha wash.
2. The rarity tile appears **everywhere an icon is shown** — recipe rows, loot/crate
   lists, ammo and "used-by" lists, item cards, detail headers — not just the two call
   sites that pass `rarity` today.
3. The detail-page icon is **much bigger** (216px) on every detail page that uses the
   shared `lg` size (item detail, trampler-part detail).

## Chosen visual treatment ("V1")

Selected from live mockups. The tile background is a 135° linear gradient
(top-left → bottom-right):

- **0%** — rarity color lightened ~5% toward white
- **38%** — 35% rarity color over `#14171f` (dark slate)
- **100%** — `#11131a` (near-black)

The sprite gets a subtle drop-shadow (`drop-shadow(0 2px 3px rgba(0,0,0,.45))`,
scaled with size) for depth. Tile keeps the existing `rounded-box` radius.

Rejected alternatives: flat wash (current, no depth), corner radial glow (too dark),
beveled "game slot" (over-styled), and softer/less-dark gradient variants.

## Implementation shape

### `src/lib/rarity.ts` — gradient helper

Add `rarityGradient(name?: string | null): string | null`:

- Returns a CSS `background` value (`linear-gradient(135deg, <s0> 0%, <s1> 38%, #11131a 100%)`)
  for a known rarity, else `null`.
- Stops are computed as **concrete hex** by mixing the rarity hex with white and with the
  dark base in JS (a small `mixHex(a, b, t)` helper). This avoids `color-mix()` so the
  output renders identically during server rendering and in every browser.
- `rarityBgColor` (flat-wash helper) is no longer used by ItemIcon; remove it once no
  callers remain, or leave it if still referenced. (Verify during implementation.)

Keep `rarityColor` (solid hex) — still used for the badge dot on the detail page.

### `src/components/ItemIcon.tsx` — render the gradient + neutral fallback

- When `rarityGradient(rarity)` is non-null, set `style={{ background: gradient }}`.
- When it is null (no/unknown rarity — trampler parts, env entities), render a **neutral
  dark slot**: a fixed dark background (e.g. the same `#11131a`/base, optionally a faint
  top-left neutral gradient) instead of `bg-base-300`. The goal is a cohesive slot look,
  not a fake rarity color.
- Apply the sprite drop-shadow via the `item-sprite` class or inline.
- Resize `lg` from `size-28` (112px) to **`size-54` (216px)**. Other sizes unchanged.

### Thread `rarity` to item-icon call sites

Only the `Item` model has `rarity`, so this applies to icons that represent items:

| Call site | View type / query to extend |
|---|---|
| Recipe rows (`recipe-cells` → `ItemIconLink`) | `RecipeLineItem` + `RecipeCardRow` gain `rarity`; `row()` in `lib/recipes.ts` maps it. `getItemBySlug` already includes the full related item, so no Prisma `select` change. |
| Ammo / "Used by" lists (`ItemLinkList`) | `LinkItem` type + `getAmmoByCaliber` / `getWeaponsByCaliber` selects gain `rarity`. |
| Loot icons on environment detail (`LootTable`) | loot-entry `item` select in `getEnvEntityBySlug` gains `rarity`; `LootEntryView` gains `rarity`. (The item-page "loot" tab `CrateDropList` is a text table — no icons, no change.) |
| `ItemIconLink` | New optional `rarity?: string | null` prop, passed to `ItemIcon`. |
| `ItemCard`, item detail header | Already pass `rarity` — no change. |

Non-item icons keep the neutral slot (no plumbing):

- `TramplerCard` and trampler-part detail header — trampler parts have no rarity.
- `EnvCard` and environment detail — env entities have no rarity.

## Out of scope

- No new rarity data for tramplers/environment entities (they legitimately have none).
- No change to rarity colors, ordering, or the badge-dot indicator.
- No layout changes beyond the icon size bump.

## Testing

- `rarity.test.ts`: extend with `rarityGradient` cases — known rarity returns a gradient
  string containing the expected hex stops; unknown/null returns `null`; `mixHex`
  endpoints (t=0, t=1) are exact.
- Visual check via the running app: item detail header at 216px; recipe/loot/ammo tabs
  show gradient tiles; a trampler part shows the neutral slot.
