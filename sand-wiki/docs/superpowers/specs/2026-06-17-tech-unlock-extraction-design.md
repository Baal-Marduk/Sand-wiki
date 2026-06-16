# Tech-Unlock → Buy-Option Extraction — Design

**Date:** 2026-06-17
**Status:** Approved, pending implementation plan
**Builds on:** `feat/buy-options` (the buy-options model: `EntityLink.buyGroup` + roles
`buy-cost`/`buy-yield`/`buy-unlock`, the proposal/apply pipeline, the editor, and the
"Buy" tab). This work ships on the same branch.

## Goal

Pre-populate, for every item the tech tree unlocks, a buy option that already carries the
**tech-node unlock link** (`item → node`, role `buy-unlock`) and a `buy-yield` of 1 — with
**no price**. Prices are added later by hand in the editor. This saves manually picking the
unlocking tech node for ~115 items.

Source: the `tech-unlocks` EntityLinks already in the DB (the seed materializes them from
`prisma/tech-tree-extracted.json`, names already resolved). We do **not** re-parse the JSON,
and we do **not** extract the nodes' `unlockCost` (research cost ≠ purchase price — explicitly
out of scope per the product decision).

## Data facts (from the extract)

- 95 tech nodes; every node has `unlocks`. 121 total unlock entries → **115 distinct items**.
- Unlocks-per-node: 74 nodes unlock 1 item, 20 unlock 2, 1 unlocks 7.
- 6 items are unlocked by 2 different nodes → those items get 2 options (one per node).

## Non-goals

- No price extraction (`buy-cost` is never written by this feature).
- Not run by the seed (keeps `buy-unlock` seed-immune; protects hand-set prices across reseeds).
- No change to how tech nodes or `tech-unlocks` links are produced.

## Part 1 — Extraction

### Pure planner (`prisma/tech-unlock-extract.ts`)

```ts
export interface UnlockPair { itemId: string; itemName: string; nodeId: string; nodeName: string }
export interface ExistingUnlock { itemId: string; nodeId: string }
export interface PlannedOption { itemId: string; itemName: string; nodeId: string; nodeName: string }

/** Decide which (item, node) buy-unlock options to create. Skips pairs that already have a
 *  buy-unlock between that item and node (idempotent + composes with the coin-trade
 *  migration — an item may already have a priced coin option and still get a new
 *  unlock-only option here). De-dupes repeated input pairs. */
export function planTechUnlockOptions(
  pairs: UnlockPair[],
  existing: ExistingUnlock[],
): PlannedOption[]
```

Key key: `${itemId}|${nodeId}`. Output preserves input order; an item unlocked by N nodes
yields N planned options.

### DB routine (same file)

```ts
export interface TechUnlockResult { itemsTouched: number; optionsCreated: number; pairsSkipped: number }

export async function extractTechUnlocksToBuyOptions(prisma: PrismaClient): Promise<TechUnlockResult>
```

In one `prisma.$transaction`:
1. Load `tech-unlocks` EntityLinks: `where: { role: "tech-unlocks" }`, selecting the source
   (the tech node: id + name) and target (id, name, kind). The link direction is
   **source = tech-node, target = unlocked entity** (confirmed in `prisma/seed.ts`, which
   creates `{ sourceId: <node>, role: "tech-unlocks", targetId: <unlocked> }`). Keep only rows
   whose `target.kind === "item"` and `targetId` is non-null.
2. Build `UnlockPair[]` = `{ itemId: target.id, itemName: target.name, nodeId: source.id, nodeName: source.name }`.
3. Load existing `buy-unlock` links: `where: { role: "buy-unlock" }`, select `sourceId` (item)
   + `targetId` (node) → `ExistingUnlock[]` = `{ itemId: sourceId, nodeId: targetId }`.
4. `const planned = planTechUnlockOptions(pairs, existing)`.
5. For each item, find its current max `buyGroup` once (`groupby`/aggregate of EntityLink
   `where sourceId=item, buyGroup not null`), then append one option per planned pair at
   `buyGroup = maxSoFar + 1` (incrementing per created option for that item). Each option =
   two rows on the item (sourceId = item.id):
   - `{ role: "buy-unlock", targetId: nodeId, name: nodeName, amount: null, sortOrder: 0, buyGroup }`
   - `{ role: "buy-yield", targetId: item.id, name: itemName, amount: 1, sortOrder: 1, buyGroup }`
   Batch via `createMany`.
6. Return counts.

Does **not** set `lootCurated` (that flag protects seed-managed loot/cost/buy-cost rows;
`buy-unlock` is not seed-managed, so no flag needed — and we must not falsely mark items
curated). Idempotent: re-running creates nothing new (all pairs already exist).

### Script + npm entry

- `prisma/extract-tech-unlocks-to-buy.ts`: instantiates `PrismaClient`, calls the routine,
  logs the `TechUnlockResult`, disconnects (mirror `migrate-coin-trades-to-buy.ts`).
- `package.json` script: `"db:extract-tech-unlocks": "tsx prisma/extract-tech-unlocks-to-buy.ts"`.
- Run once against the dev DB; later once against live after deploy (a targeted, non-destructive
  insert — safe under the never-reseed rule; it only adds rows, never deletes).

## Part 2 — Editor validation + public render filter

### Relax the option validator (`src/lib/buy-options.ts`)

`parseBuyOptionsForm` currently rejects an option with no costs ("Each buy option needs at
least one cost component."). Change the rule to: an option is valid when it has **≥1 cost OR a
non-empty `unlockSlug`**; reject only when it has **neither** (new message, e.g. "Each buy
option needs at least one cost or a tech-tree unlock."). Positive-integer checks on cost
amounts and on yield are unchanged. This lets the priceless scaffolds round-trip through the
editor — the user can price some options and leave others unlock-only and still save.

`applyBuyOptionsProposal` already tolerates an option with zero costs (it writes the
`buy-yield` self-row + the optional `buy-unlock`), so no apply change is needed. Confirm during
implementation.

### Public render filter (`src/lib/buy-options.ts` + item page)

```ts
/** Options shown publicly: only those with at least one priced cost component. */
export function pricedOptions(views: BuyOptionView[]): BuyOptionView[] {
  return views.filter((o) => o.costs.length > 0);
}
```

In `src/app/items/[slug]/page.tsx`:
- `const priced = pricedOptions(buyOptions);`
- Buy-tab gate: `availableTabs(trades, priced.length > 0)`.
- Render: `<BuyOptions options={priced} itemName={item.name} />`.

The **editor** path (`getBuyOptionsForEdit` → `optionsToDrafts`) is unchanged and continues to
load **all** options (including priceless ones) so the pre-filled unlock is available to price.

## Part 3 — Tests

- `prisma/tech-unlock-extract.test.ts`:
  - `planTechUnlockOptions` skips a pair already in `existing`; creates an option for a new
    pair; an item with two distinct unlocking nodes yields two planned options; duplicate input
    pairs de-dupe to one.
- `src/lib/buy-options.test.ts`:
  - `parseBuyOptionsForm`: an option with an `unlockSlug` and no costs is now VALID; an option
    with neither cost nor unlock is INVALID (new message); existing positive-amount/yield cases
    still pass.
  - `pricedOptions`: filters out cost-less options, keeps priced ones.

## Error handling / edge cases

- Items unlocked by ≥2 nodes → multiple options (natural). 6 such items.
- An item that already has a priced (coin-trade) option still gets a separate unlock-only
  option (dedupe is per `(item, node)`, not "item already has any option").
- Unlock targets that aren't items (a node unlocking a trampler part, etc.) are skipped
  (`target.kind === "item"` filter).
- Routine only inserts rows; it never deletes or updates, so it cannot clobber a contributor's
  prices.

## Files

- **New:** `prisma/tech-unlock-extract.ts` (planner + DB routine),
  `prisma/tech-unlock-extract.test.ts`, `prisma/extract-tech-unlocks-to-buy.ts` (script).
- **Modify:** `package.json` (npm script), `src/lib/buy-options.ts` (relaxed validator +
  `pricedOptions`), `src/lib/buy-options.test.ts`, `src/app/items/[slug]/page.tsx` (render
  filter).

## Out of scope

- Extracting node `unlockCost` as prices.
- A tech-node-side "unlocks purchase of" view (already deferred in the buy-options work).
- Auto-pricing or any heuristic price guess.
