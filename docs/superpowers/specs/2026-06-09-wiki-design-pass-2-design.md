# SAND Wiki — Design Pass 2

**Date:** 2026-06-09
**App:** `sand-wiki/` (Next.js 16 + Prisma 6 + DaisyUI 5)
**Status:** Approved (brainstorm), pending implementation plan

## Goal

A second design pass on the Unofficial SAND Wiki. Four user asks, refined via visual
brainstorming into concrete decisions:

1. Sticky navbar pinned to the top.
2. Colored category tags.
3. Broader layout rework (items grid, home page, global spacing/width) — not just one page.
4. Present crown-recipes as **Buy/Sell** trades, and show on the item page when an item
   can be bought/sold.

This is purely the wiki's presentation layer plus a small pure trades helper. No data,
scraper, or DB-schema changes.

## Background: how trades exist in the data

There is **no vendor or seller-tier field**. Trades are ordinary `Recipe` rows that
involve the currency item **Coin Crown** (`slug: "coin-crown"`, `type: "MONEY"`):

- Coin Crown as an **input**, item as **output** → a **Buy**.
- Item as **input**, Coin Crown as **output** → a **Sell**.
- Neither side is Coin Crown → a normal crafting recipe.

Multiple prices for the same item differ by **quantity (bulk tiers)**, which changes the
effective **per-unit price**. Real example today — Pistol Ammo sells as `1→5`, `5→25`,
`100→1000` crowns (5, 5, and 10 ◈ per unit respectively). Current dataset: 1 buy recipe,
3 sell recipes. The design must not assume a "seller tier" that the data lacks.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Background | Darker dark-theme palette (option B). Light theme untouched. |
| Category tag style | Dot + label (neutral pill, colored dot, plain text). |
| Buy/Sell layout | Variant B — header indicator + dedicated Buy & Sell sections. |
| Multiple prices | Show **all** options as bulk-tier rows with per-unit price + "Best" flag. |
| Items grid | Variant A — compact sticky top filter bar, full-width denser grid. |
| Home | Reworked hero + category dot chips + restyled section cards. |

## Design

### 1. Theme & global frame

**`src/app/globals.css`** — update only the `desertnight` theme base colors:

```
--color-base-100: #100b06;
--color-base-200: #181009;
--color-base-300: #241910;
```

`base-content` and all semantic/accent colors stay as-is. `desertday` (light) is unchanged.

**Sticky navbar** — `src/components/MainNav.tsx` / `src/app/layout.tsx`: the `<header>`
becomes `sticky top-0 z-40` with a translucent blurred background
(`bg-base-100/90 backdrop-blur` + `supports-[backdrop-filter]` fallback) and the existing
bottom border. Nav link contrast must remain WCAG AA in both themes (keep the explicit
`text-base-content` links, not dimmed `.menu` links).

**Spacing / width**:
- List/grid pages (`/items` and other list views) widen their container to `max-w-6xl`.
- Item-detail stays `max-w-3xl` for readability.
- Home stays `max-w-5xl`.
- Slightly increased vertical rhythm between top-level sections.

The `<main>` wrapper in `layout.tsx` currently hard-codes `max-w-5xl`. Move max-width
control to the page level (or a small layout helper) so different page types can set their
own width.

### 2. Category tags — `CategoryTag` component

New `src/components/CategoryTag.tsx`:

```
<span class="badge badge-outline gap-1.5 …">
  <span class="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
  {label}
</span>
```

- Neutral DaisyUI `badge badge-outline`; the only inline style is the dot color.
- The **text label is the meaningful signal**; the dot is `aria-hidden` decoration, so no
  color-contrast/axe concern in either theme.
- Optional `size` prop (sm for cards, default for item header).

**Hue map** in `src/lib/taxonomy.ts` — a `CATEGORY_COLORS: Record<string, string>` keyed by
category slug, plus a `categoryColor(slug)` accessor (fallback to the Misc color):

| Category | Hex |
|---|---|
| weapons | `#d4654f` |
| guns | `#8b94a6` |
| ammo | `#e0a341` |
| resources | `#7fb069` |
| tools | `#4fb3a6` |
| attire | `#6aa9c9` |
| medical | `#d56a8c` |
| misc | `#9b8b73` |

`CategoryTag` replaces the plain category badge in `ItemCard`, the item-detail header, and
the home category chips.

### 3. Buy/Sell — `src/lib/trades.ts` (pure, unit-tested)

A new pure module that turns an item's recipe lists into trade data. Operates on the
`RecipeCard` shape already produced by `src/lib/recipes.ts` (rows carry `slug`, `name`,
`amount`), so no DB shape changes.

```
const CURRENCY_SLUG = "coin-crown";

interface TradeOption {
  recipeSlug: string;
  quantity: number;      // units of the item bought/sold
  totalCrowns: number;   // crowns paid (buy) or received (sell)
  unitPrice: number;     // totalCrowns / quantity
  isBest: boolean;
}

interface ItemTrades {
  buy: TradeOption[];    // sorted by quantity asc
  sell: TradeOption[];   // sorted by quantity asc
}
```

- **Classify** each `craftedBy` recipe: if an input row is `coin-crown` and an output row is
  the page item → **Buy** (quantity = item-output amount, totalCrowns = crown-input amount).
- **Classify** each `usedIn` recipe: if an input row is the page item and an output row is
  `coin-crown` → **Sell** (quantity = item-input amount, totalCrowns = crown-output amount).
- **Best flag**: Buy → lowest `unitPrice`; Sell → highest `unitPrice` (ties: all matching
  rows flagged, or first — pick first and document).
- The function also returns the leftover non-trade recipes so the page can render true
  crafts separately: `{ trades: ItemTrades, crafts: RecipeCard[], usedInCrafts: RecipeCard[] }`.
- **Exemption**: when the page item itself is the currency (`coin-crown`), classification is
  skipped — trades render as ordinary recipes there.

**Item page** (`src/app/items/[slug]/page.tsx`):
- Header: `◈ Buyable` badge if `buy.length > 0`; `◈ Sellable` if `sell.length > 0`
  (soft-tinted, with accessible text).
- New `Buy` section and `Sell` section (rendered by a new `TradeSection` component) above
  "Crafted by". Each row: `quantity × → totalCrowns ◈`, per-unit price, "Best" tag on the
  flagged row. ◈ is decorative; rows have readable text ("Sell 100 for 1,000 crowns").
- "Crafted by" / "Used in" render only the non-trade recipes returned by `trades.ts`.

### 4. Items grid (Variant A)

- `src/components/ItemFilters.tsx`: compact filter bar, `sticky top-[<navbar height>]` so it
  pins under the sticky navbar; collapses gracefully on mobile.
- `src/components/ItemCard.tsx`: denser card using `CategoryTag` (sm), tier badge, and a
  small `◈` marker (`aria-label="Buyable"` / `"Sellable"`) when applicable.
- `ItemCardData` gains `buyable: boolean` / `sellable: boolean`.
- New query helper in `src/lib/queries.ts`: `getTradeFlags()` runs **once per page render**
  and returns `{ buyable: Set<string>, sellable: Set<string> }` of item slugs that appear
  opposite `coin-crown` in any recipe. `items/page.tsx` maps the flags onto each card. No
  per-card query.

### 5. Home page (`src/app/page.tsx`)

- Hero restyled on the darker base; search join retained.
- The category links become `CategoryTag`-style dot chips into `/items?category=…`.
- "Browse by section" cards restyled to match the denser card treatment.

### 6. Testing & verification

- **vitest**: `trades.ts` — classification, unit-price math, best-flag (incl. the Pistol
  Ammo 3-tier case and the currency-exemption case); a `taxonomy` test asserting every item
  category has an entry in `CATEGORY_COLORS`.
- **Playwright e2e + axe**: extend specs to assert the Buy/Sell sections, the header
  buyable/sellable badge, and the ◈ grid markers render; **axe must pass in both
  `desertnight` and `desertday`**.
- **Full gate before done**: `vitest`, `tsc --noEmit`, `eslint`, `next build`, e2e+axe.

## Out of scope

- Light-theme (`desertday`) color changes.
- Placeholder pages (`/tech`, `/tools`, `/tramplers`, `/environment`).
- Any data, scraper, or Prisma-schema changes.

## Risks / notes

- Sticky filter bar offset depends on the navbar height — use a CSS variable or a fixed
  known height so the two stay in sync.
- `backdrop-blur` translucency must not drop nav text contrast below AA — verify with axe.
- Category dot hues are a single set for both themes; they are decorative, but spot-check
  they remain visually distinguishable on the light base too.
