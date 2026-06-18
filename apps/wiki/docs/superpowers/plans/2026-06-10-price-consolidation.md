# Price Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every money figure (buy, sell, intrinsic value) only in the item Details panel; remove the header badges, StatBox Value cell, Buy/Sell tabs, and grid-card trade badges.

**Architecture:** A small UI/data refactor of the sand-wiki Next.js app. The Details panel (`itemDetailRows`) already renders `Buyable`/`Sellable` rows and gains a `Value` row; everything else that displayed a price is deleted, along with the now-orphaned `TradeTable` component, `getTradeFlags` query, and `formatUnitPrice` helper. `classifyTrades` stays (it still computes the Details prices and separates trade-recipes from real crafts).

**Tech Stack:** Next.js 16, React 19, Prisma 6, Vitest, Tailwind/daisyUI. All commands run from `sand-wiki/`.

**Spec:** `docs/superpowers/specs/2026-06-10-price-consolidation-design.md`

**Branch:** `feat/wiki-price-consolidation` is already checked out.

**Git hygiene (every task):** stage files explicitly by path (`git add <paths>`); do NOT use `git commit -am` or `git add -A` — there are unrelated pre-existing modified/untracked files (`instructions.md`, `TODO.md`, `.claude/`, `sand-scraper/`) that must NOT be swept into commits.

---

## Task 1: Consolidate detail-page prices into Details; move Value; remove Buy/Sell tabs

This is the coupled core: the `TabId` union, `itemDetailRows`, the StatBox value cell, and the detail page all interlock, so they change together to keep the build green. TDD the `item-view.ts` part first.

**Files:**
- Modify: `src/lib/item-view.ts`
- Test: `src/lib/item-view.test.ts`
- Modify: `src/components/StatBox.tsx`
- Modify: `src/app/items/[slug]/page.tsx`
- Delete: `src/components/TradeTable.tsx`

- [ ] **Step 1: Update the failing tests in `src/lib/item-view.test.ts`**

Replace the `availableTabs` "fixed order" test body's expectation and add two `itemDetailRows` cases. The file currently has `buyOpt`/`sellOpt` consts (keep them — still used for the Buyable/Sellable test) and `facts` (no `value`). Make these edits:

(a) In the `describe("availableTabs", …)` block, replace the "returns tabs in fixed order" test with:

```typescript
  it("returns tabs in fixed order, only those with data", () => {
    const trades: ItemTrades = {
      crafts: [{ slug: "c", workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] }],
      usedInCrafts: [],
      buy: [buyOpt],
      sell: [sellOpt],
    };
    expect(availableTabs(trades)).toEqual([
      { id: "crafted-by", label: "Crafted by" },
    ]);
  });
```

(b) In the `describe("itemDetailRows", …)` block, add two cases:

```typescript
  it("adds a Value row from the wiki value, without a unit", () => {
    const r = itemDetailRows({ ...facts, value: 5 }, noTrades);
    expect(r).toContainEqual({ label: "Value", value: "5", coin: true });
  });

  it("omits the Value row when value is null/undefined", () => {
    expect(itemDetailRows(facts, noTrades).some((row) => row.label === "Value")).toBe(false);
  });
```

- [ ] **Step 2: Run the item-view tests to verify they fail**

Run: `npm test -- item-view`
Expected: FAIL — the availableTabs test still gets `buy`/`sell` entries, and `itemDetailRows` produces no `Value` row.

- [ ] **Step 3: Update `src/lib/item-view.ts`**

(a) Add `value` to `ItemFacts`:

```typescript
export interface ItemFacts {
  category: string;
  isResource: boolean;
  storageStack: number | null;
  workbenchTier: number | null;
  value?: number | null;
}
```

(b) In `itemDetailRows`, add the Value row immediately after the `isResource` row and before the `trades.buy` block:

```typescript
  if (facts.isResource) rows.push({ label: "Resource", value: "Yes" });
  if (facts.value != null) rows.push({ label: "Value", value: formatCrowns(facts.value), coin: true });
  if (trades.buy.length > 0) {
```

(c) Drop `"buy" | "sell"` from the `TabId` union:

```typescript
export type TabId = "crafted-by" | "used-in" | "ammo" | "used-by" | "loot";
```

(d) Remove the buy/sell pushes from `availableTabs` (leave crafted-by/used-in):

```typescript
export function availableTabs(trades: ItemTrades): TabDef[] {
  const tabs: TabDef[] = [];
  if (trades.crafts.length > 0) tabs.push({ id: "crafted-by", label: "Crafted by" });
  if (trades.usedInCrafts.length > 0) tabs.push({ id: "used-in", label: "Used in" });
  return tabs;
}
```

- [ ] **Step 4: Run the item-view tests to verify they pass**

Run: `npm test -- item-view`
Expected: PASS. (tsc is still broken project-wide until Step 6 — that's expected mid-task.)

- [ ] **Step 5: Remove the Value cell from `src/components/StatBox.tsx`**

(a) Delete the import on line 1: `import { CoinIcon } from "@/components/CoinIcon";`

(b) Delete the value cell (the two lines):

```typescript
  if (stats.value != null)
    cells.push({ label: "Value", node: <>{stats.value} <CoinIcon /></> });
```

Leave the `value?: number;` field in the `ItemStats` interface (it is still the DB stats-JSON shape; the detail page reads it).

- [ ] **Step 6: Update `src/app/items/[slug]/page.tsx`**

(a) Delete the import line: `import { TradeTable } from "@/components/TradeTable";`

(b) Change the destructure to drop the now-unused `buy`/`sell`:

```typescript
  const { crafts, usedInCrafts } = trades;
```

(c) Remove the `buy`/`sell` entries from `tabContent` so it is exactly:

```typescript
  const tabContent: Partial<Record<TabId, React.ReactNode>> = {
    "crafted-by": <CraftTable recipes={crafts} />,
    "used-in": <UsedInTable recipes={usedInCrafts} />,
  };
```

(d) Delete the two header badge lines:

```typescript
            {buy.length > 0 && <span className="badge badge-success" aria-label="Buyable">◈ Buyable</span>}
            {sell.length > 0 && <span className="badge badge-warning" aria-label="Sellable">◈ Sellable</span>}
```

(e) Pass `value` into `itemDetailRows` facts (the `stats` const is `item.stats as unknown as ItemStats | null`, already in scope):

```typescript
  const detailRows = itemDetailRows(
    {
      category: item.category,
      isResource: item.isResource,
      storageStack: item.storageStack,
      workbenchTier: item.workbenchTier,
      value: stats?.value ?? null,
    },
    trades,
  );
```

- [ ] **Step 7: Delete the Buy/Sell table component**

Run: `git rm src/components/TradeTable.tsx`

- [ ] **Step 8: Verify the whole detail-page change compiles, lints, and tests pass**

Run: `npm test -- item-view && npx tsc --noEmit && npm run lint`
Expected: all PASS. (`tsc` confirms the `TabId` change, removed `TradeTable` import, and dropped `buy`/`sell` locals are all consistent.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/item-view.ts src/lib/item-view.test.ts src/components/StatBox.tsx "src/app/items/[slug]/page.tsx" src/components/TradeTable.tsx
git commit -m "feat(wiki): consolidate detail-page prices into Details; drop Buy/Sell tabs + Value cell"
```

(`git add` of the deleted `TradeTable.tsx` path stages its deletion.)

---

## Task 2: Remove grid-card trade badges and the getTradeFlags query

Coupled: `ItemCardData` loses fields, `items/page.tsx` stops passing them and stops calling `getTradeFlags`, and `queries.ts` deletes `getTradeFlags` + its now-unused `CURRENCY_SLUG` import. All move together for `tsc`/lint to pass. No unit tests cover these (pages/queries) — verified by tsc + lint + build.

**Files:**
- Modify: `src/components/ItemCard.tsx`
- Modify: `src/app/items/page.tsx`
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: Strip badges from `src/components/ItemCard.tsx`**

Replace the entire file with:

```tsx
import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

export interface ItemCardData {
  slug: string; name: string; icon?: string | null; rarity?: string | null;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="list-none">
      <Link
        href={`/items/${item.slug}`}
        className="card card-side bg-base-200 hover:bg-base-300 transition-colors h-full items-center gap-3 p-3"
      >
        <ItemIcon name={item.name} icon={item.icon} size="card" decorative rarity={item.rarity} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{item.name}</div>
        </div>
      </Link>
    </li>
  );
}
```

- [ ] **Step 2: Update `src/app/items/page.tsx`**

(a) Drop `getTradeFlags` from the import on line 1:

```tsx
import { listItems, listRarities } from "@/lib/queries";
```

(b) Remove the `getTradeFlags()` call + `tradeFlags` from the `Promise.all`:

```tsx
  const [items, rarities] = await Promise.all([
    listItems(filter),
    listRarities({ query: q || undefined, category: category || undefined }),
  ]);
```

(c) Remove the `buyable`/`sellable` props from the `ItemCard` item object:

```tsx
                <ItemCard
                  key={i.id}
                  item={{
                    slug: i.slug, name: i.name, icon: i.icon, rarity: i.rarity,
                  }}
                />
```

- [ ] **Step 3: Delete `getTradeFlags` from `src/lib/queries.ts`**

(a) Delete the import on line 4: `import { CURRENCY_SLUG } from "./trades";` (it is used only inside `getTradeFlags` in this file — verified — so leaving it would trip eslint `no-unused-vars`).

(b) Delete the entire `getTradeFlags` function (its JSDoc block + body — the `export async function getTradeFlags(): Promise<{ buyable: Set<string>; sellable: Set<string> }> { … }` that builds the `buyable`/`sellable` sets from Coin-Crown recipes).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS (no unused `CURRENCY_SLUG`, no unused `getTradeFlags`, ItemCard/items page consistent).

- [ ] **Step 5: Commit**

```bash
git add src/components/ItemCard.tsx src/app/items/page.tsx src/lib/queries.ts
git commit -m "feat(wiki): remove grid-card Buy/Sell badges + getTradeFlags query"
```

---

## Task 3: Delete the orphaned formatUnitPrice helper

`formatUnitPrice` was only used by the now-deleted `TradeTable`. Remove it and its test.

**Files:**
- Modify: `src/lib/trades.ts`
- Test: `src/lib/trades.test.ts`

- [ ] **Step 1: Remove the test first**

In `src/lib/trades.test.ts`:

(a) Change the import on line 2 to drop `formatUnitPrice`:

```typescript
import { classifyTrades, formatCrowns } from "./trades";
```

(b) Delete the `formatUnitPrice` test (inside `describe("formatters", …)`):

```typescript
  it("formats unit price, trimming trailing zeros", () => {
    expect(formatUnitPrice(10)).toBe("10");
    expect(formatUnitPrice(2.5)).toBe("2.5");
  });
```

Leave the `formatCrowns` test in place.

- [ ] **Step 2: Run the trades tests (still green after dropping the test)**

Run: `npm test -- trades`
Expected: PASS — this is a deletion, not a red→green cycle. Removing the test + its import leaves the remaining `classifyTrades`/`formatCrowns` tests passing. (`formatUnitPrice` is still exported from `trades.ts` at this point; that's fine — it's removed next.)

- [ ] **Step 3: Delete `formatUnitPrice` from `src/lib/trades.ts`**

Delete the function at the bottom of the file:

```typescript
export function formatUnitPrice(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString();
}
```

Leave `formatCrowns`, `classifyTrades`, `withBest`, `TradeOption` (incl. `isBest`) unchanged.

- [ ] **Step 4: Verify nothing else referenced it**

Run: `npx tsc --noEmit && npm test -- trades`
Expected: PASS. (If tsc reports `formatUnitPrice` is still imported somewhere, that file was missed — search `grep -rn formatUnitPrice src` and remove the stray reference; there should be none after Task 1 deleted `TradeTable`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/trades.ts src/lib/trades.test.ts
git commit -m "refactor(wiki): drop orphaned formatUnitPrice helper"
```

---

## Task 4: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test + typecheck + lint suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all unit tests pass, no type errors, no lint errors.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: clean production build; `/items` and `/items/[slug]` still present.

- [ ] **Step 3: Runtime smoke check**

Ensure no stale dev server holds port 3000 first, then `npm run dev` and verify:
- An item with a value + sell recipes (e.g. `http://localhost:3000/items/pistol-ammo`, the 8x21mm Ammo): header shows only rarity + category (NO Buyable/Sellable badge); StatBox has NO "Value" cell; there is NO "Buy"/"Sell" tab; the Details panel shows `Value` and `Sellable … / unit` rows.
- The items grid (`http://localhost:3000/items`): cards show icon + name + rarity tint only, no `◈ Buy`/`◈ Sell` badges.
Stop the dev server when done.

- [ ] **Step 4: (No commit)** — verification only. Fix under the relevant task and re-run if anything fails.

---

## Self-Review notes (for the executor)

- **Spec coverage:** Details `Value` row + `ItemFacts.value` (Task 1 §3); StatBox value-cell removal (Task 1 §5); header badge + Buy/Sell tab removal + `TabId` change (Task 1 §3/§6); `TradeTable` deletion (Task 1 §7); grid badge removal (Task 2 §1-2); `getTradeFlags` + `CURRENCY_SLUG` import deletion (Task 2 §3); `formatUnitPrice` cleanup (Task 3). Tests updated in Tasks 1 & 3.
- **Type consistency:** `ItemFacts.value?: number | null` (Task 1) is fed `stats?.value ?? null` (Task 1 §6e). `TabId` loses `"buy"|"sell"` (Task 1 §3c) and `tabContent` drops those keys (Task 1 §6c) — consistent. `ItemCardData` loses `buyable`/`sellable` (Task 2 §1) and `items/page.tsx` stops passing them (Task 2 §2c) — consistent. `classifyTrades`/`formatCrowns` signatures unchanged throughout.
- **Green-at-commit:** Task 1 groups all `TabId`-coupled files so tsc passes at its commit; Task 2 groups all `ItemCardData`/`getTradeFlags`-coupled files; Task 3 is self-contained. `formatUnitPrice` stays a valid (unused) export between Task 1 and Task 3 — eslint does not flag unused exports, so the tree lints clean in the interim.
