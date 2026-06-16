# Buy Options — Design

**Date:** 2026-06-16
**Status:** Approved, pending implementation plan

## Goal

Replace the *derived* "Buyable" price (currently inferred from Coin Crown recipes) with a
**stored, editable** buy model that supports:

- **Multiple buy options per item** — an item can be purchased in several distinct ways.
- **Multi-entity prices** — each option's price is a bundle of `{entity + amount}` components
  (e.g. Cannon T2: Option 1 = 500 Coin Crown **+** 1 Wine Crate; Option 2 = 1,200 Coin Crown).
- **Per-option yield** — an option states how many of the item you receive (default 1).
- **Per-option tech-tree unlock** — an option may be gated by a tech node ("unlocked at end of
  the tech tree"); optional and independent per option.

Buying is modelled as its own relation — **not** as a Coin Crown "craft". The existing
coin-trade recipes that fake this today are removed.

## Current state

- "Buyable" is computed in `src/lib/trades.ts` (`classifyTrades`): any recipe with `coin-crown`
  as an input and the item as an output is treated as a buy; the cheapest unit price renders as
  the **Buyable** row in the Details panel (`src/lib/item-view.ts`). "Sellable" is the mirror
  (item → coins). Neither is editable.
- Tab-style editing already exists: `EntityLink` rows + a fixed role catalog in
  `src/lib/entity-links.ts` (`LINK_ROLES`), edited via `LinkEditForm`/`LinkPicker`
  (the enriched item picker: search + icons + rarity + value field). Roles go through the
  admin-reviewed Proposal pipeline and are seed-safe.
- Tech nodes exist as `Entity(kind: "tech-node")` with their own `EntityLink` roles.

## Chosen approach (A): grouped EntityLinks on the item

All buy data lives on the **item being bought**, as `EntityLink` rows bundled into options by a
new `buyGroup` discriminator. No intermediate "buy-option" entity, no reuse of the Recipe table.

### Data model

**Schema (`prisma/schema.prisma`):** add one nullable column to `EntityLink`:

```
buyGroup Int?   // option index within an item's buy options; null for all non-buy roles
```

`EntityLink` has no unique constraint (only `@@index([sourceId, role])` / `@@index([targetId])`),
so multiple rows per `(source, target, role)` across groups — and item→item self-rows — are safe.

**Three new roles** in `LINK_ROLES` (`src/lib/entity-links.ts`):

| role | target | meaning | editable fields |
|---|---|---|---|
| `buy-cost`  | a cost item (Coin Crown, Wine Crate, any item) | one price component | `["amount"]` |
| `buy-yield` | the item itself (self-row) | how many you receive | `["amount"]` |
| `buy-unlock`| a `tech-node` entity | gates this option (optional, ≤1 per group) | `[]` |

**An option = all rows sharing one `buyGroup`.** Example (Cannon T2):

| role | target | amount | buyGroup |
|---|---|---|---|
| buy-cost | coin-crown | 500 | 0 |
| buy-cost | wine-crate | 1 | 0 |
| buy-yield | cannon-t2 (self) | 1 | 0 |
| buy-unlock | heavy-ordnance (tech-node) | – | 0 |
| buy-cost | coin-crown | 1,200 | 1 |
| buy-yield | cannon-t2 (self) | 1 | 1 |

Rendering rule: group rows by `buyGroup`; within a group the `buy-cost` rows are the price, the
`buy-yield` row is the quantity received (absent ⇒ 1), the optional `buy-unlock` row is the gate.

`LinkField` (currently `"amount" | "tier" | "value1"`) is unchanged — `buy-cost`/`buy-yield` use
`amount`. `isLinkRole`/`linkFields` pick the new roles up automatically once registered.

### Seed safety

Two tiers, matching existing precedent:

- **`buy-cost` / `buy-yield` — seed-managed + protected.** The seed importer detects coin-trade
  recipes in source data and emits these links *instead of* `Recipe` rows. They are therefore
  written by the seed (role-scoped delete + recreate) and protected by the existing
  curated-flag + applied-edit lock-map, exactly like `loot` / `cost`. A dev reseed reproduces
  buy prices and never clobbers an applied contributor edit.
- **`buy-unlock` — contributor-only / never seeded.** No unlock data exists in the scrape, so
  this role is fresh and fully seed-immune (same pattern as the key-progression roles). A reseed
  cannot touch hand-entered unlock links.

The seed's role-scoped delete must be extended to include `buy-cost` and `buy-yield` (so a reseed
cleans them before re-importing) and must **not** include `buy-unlock`.

### One-time migration (`prisma/migrate-coin-trades-to-buy.ts`)

A targeted script, run **once** on dev and on live (a migration, not a reseed — respects the
never-reseed-live rule). For each item:

- **Buy recipes** (Coin Crown input, item output): create a buy option — `buy-cost` →
  coin-crown (`amount` = total crowns), `buy-yield` → the item (`amount` = output quantity), with
  a fresh `buyGroup` per recipe. Then **delete** the recipe.
- **Sell recipes** (item input, Coin Crown output): **delete**, no replacement. The Details
  **Value** field already conveys sell worth.

The script must be idempotent (skip items that already have `buy-cost` rows) so it can be re-run
safely.

### Code removal

- `src/lib/trades.ts`: remove `classifyTrades`'s buy **and** sell detection. `crafts` /
  `usedInCrafts` become the real (non-coin) recipes. Keep `formatCrowns`. `CURRENCY_SLUG` stays
  only if still referenced (by the migration / cost rendering); drop the import where it becomes
  unused to satisfy eslint.
- `src/lib/item-view.ts`: remove the **Buyable** and **Sellable** Details rows; keep **Value**.
- Item detail page: drop any buy/sell tab wiring tied to the old derived trades.

## Editor — grouped buy-options editor

The existing `LinkPicker` edits a *flat* list per role; buy options need a **grouped** editor.

**New `BuyOptionsEditor` client component**, rendered in `src/app/contribute/edit-tabs/page.tsx`
for **item** targets (a new "Buy options" section; `item` gains buy roles in `ROLES_FOR_TYPE`
handling, but as a single combined section rather than one `LinkEditForm` per role):

- A list of **Option blocks**. Each block contains:
  - **Cost rows** — the enriched item picker (`LinkPicker` / `EntitySearchBox`, icons + rarity)
    to add each cost component, each with an `amount` input. Target scope: **any item**.
  - **Yield** — a number input ("You receive ___", default 1) → the `buy-yield` self-row.
  - **Unlocked by** — a single enriched picker **restricted to `kind: "tech-node"`**, optional
    and clearable → the `buy-unlock` row.
  - A remove-option control.
- **"+ Add buy option"** appends a new block (new `buyGroup`).
- Serializes to index-aligned FormData arrays carrying `buyGroup` per row.

**New server action `submitBuyOptionsEdit`** (`src/app/contribute/actions.ts`): parses the
grouped FormData, builds the full set of `buy-cost`/`buy-yield`/`buy-unlock` rows for the item,
and submits a standard **Proposal** (admin-reviewed). It replaces all three roles' rows for the
item atomically (snapshot-replace, like the other link editors) so removing an option deletes its
rows.

Picker scoping: cost picker → all items; unlock picker → `tech-node` entities only. Both reuse
the standardized enriched-select styling.

## Rendering — item detail page

**Layout B:** a **"Buy" tab** alongside Crafted by / Used in (not an always-on panel).

- `src/lib/item-view.ts`: `TabId` gains `"buy"`; `availableTabs` pushes a **Buy** tab first when
  the item has any `buy-cost` rows.
- New `BuyOptions` render component (server-rendered card list):
  - One **card per option** (`buyGroup`), in `buyGroup` order, labelled "Option N".
  - **Price**: each `buy-cost` component as `icon + amount` (Coin Crown uses the crown sprite),
    joined with "+".
  - **Yield**: "You receive: N× <item>" (from `buy-yield`, default 1).
  - **Unlock**: when a `buy-unlock` row exists, an "Unlocked by: <tech node>" chip linking to
    `/tech?select=<node-slug>` (the existing tech-page jump link).
- The item page passes the item's grouped buy links into this component (new query helper, e.g.
  `getBuyOptions(slug)`, returning options grouped by `buyGroup` with targets resolved to
  slug/name/icon/kind — reusing the `LinkRow` flattening already used for outgoing links).

### Reverse link (tech-node page) — optional, low cost

Because `buy-unlock` links item → tech node, the tech-node detail page can show "Unlocks purchase
of: <item>" via a reverse `buy-unlock` query. Included as a small additive step; can be dropped
without affecting the rest.

## Testing

- `src/lib/entity-links.test.ts`: `isLinkRole` / `linkFields` recognise `buy-cost`, `buy-yield`,
  `buy-unlock`; grouping helper (`groupBuyOptions`) bundles rows by `buyGroup`, orders options,
  resolves yield default = 1, and attaches the optional unlock.
- `src/lib/item-view.test.ts`: `availableTabs` includes **Buy** iff buy-cost rows exist; **Buyable**
  / **Sellable** Details rows are gone; **Value** remains.
- `src/lib/trades.test.ts`: remove buy/sell `classifyTrades` cases; keep craft-separation coverage.
- Migration: a unit/integration check that a coin-in recipe converts to one option
  (`buy-cost` coins + `buy-yield`), a coin-out recipe is deleted, and re-running is idempotent.
- Editor/action: `submitBuyOptionsEdit` parses grouped FormData into the correct rows and produces
  a Proposal; removing an option removes its rows.

## Out of scope

- **Vendor / location** of a purchase (who sells it / where). Can be added later as another role
  on the option.
- **Selling as a relation** — sells are represented solely by the **Value** field now.
- Re-deriving buy prices from recipes (the coin-trade heuristic is removed for good).
- Currency/tradeable allow-list — cost targets are any item.

## Files touched

- **Schema/migration:** `prisma/schema.prisma` (+ generated migration),
  `prisma/migrate-coin-trades-to-buy.ts` (new), seed importer (coin-trade → buy links;
  role-scoped delete includes buy-cost/buy-yield, excludes buy-unlock).
- **Lib:** `src/lib/entity-links.ts` (roles + `groupBuyOptions`), `src/lib/item-view.ts`
  (tabs + Details rows), `src/lib/trades.ts` (remove buy/sell), `src/lib/queries.ts`
  (`getBuyOptions`), relevant `.test.ts` files.
- **Editor:** `BuyOptionsEditor` (new component), `src/app/contribute/edit-tabs/page.tsx`,
  `src/app/contribute/actions.ts` (`submitBuyOptionsEdit`).
- **Rendering:** `BuyOptions` (new component), item detail page (`src/app/items/[slug]/page.tsx`),
  optional tech-node reverse link on the tech-node detail page.
