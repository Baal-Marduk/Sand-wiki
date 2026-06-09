# Wiki Design Pass 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second design pass on the Unofficial SAND Wiki — darker dark theme, dot+label category tags, sticky navbar, a broader layout rework (items grid, home, global width), and Buy/Sell presentation of Coin Crown recipes on item pages.

**Architecture:** Pure presentation layer plus one pure helper module. A new `src/lib/trades.ts` classifies an item's recipes into Buy/Sell trades (any recipe whose *other side* is Coin Crown) and computes per-unit prices; everything else is UI wiring in existing components. No data, scraper, or Prisma-schema changes.

**Tech Stack:** Next.js 16 (App Router, RSC), Prisma 6, DaisyUI 5 (custom `desertnight`/`desertday` themes), Tailwind v4, vitest, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-06-09-wiki-design-pass-2-design.md`

**Environment notes (from project memory):**
- Use the **PowerShell** tool for `npm`/`node`/`npx` — Bash has no Node on PATH. Fresh shells may need a PATH refresh from the registry.
- Game name is **"SAND: Raiders of Sophie"**. Prisma is pinned to **v6** (do not upgrade). `next lint` is gone; the `lint` script is plain `eslint`.
- Use DaisyUI semantic classes (`badge`, `badge-success`, `bg-base-100`, …), not raw Tailwind color utilities, so both themes work. axe must pass in **both** themes.

**Currency fact:** the currency item is **Coin Crown** (`slug: "coin-crown"`). A recipe with `coin-crown` as an input and the item as an output is a **Buy**; the item as input and `coin-crown` as output is a **Sell**. Multiple prices differ by quantity → per-unit price. Today: 1 buy (`c4-dynamite`, pay 10 → get 1) and 3 sells (`pistol-ammo`: 1→5, 5→25, 100→1000).

---

## File Structure

**Create:**
- `src/lib/trades.ts` — pure trade classification + price helpers.
- `src/lib/trades.test.ts` — unit tests for the above.
- `src/components/CategoryTag.tsx` — dot+label category badge.
- `src/components/TradeSection.tsx` — renders a Buy or Sell section of trade rows.

**Modify:**
- `src/app/globals.css` — darker `desertnight` base colors.
- `src/app/layout.tsx` — sticky translucent header, wider `<main>`.
- `src/components/MainNav.tsx` — widen nav container to match.
- `src/lib/taxonomy.ts` — `CATEGORY_COLORS` + `categoryColor()`.
- `src/lib/taxonomy.test.ts` — assert every category has a color.
- `src/components/ItemCard.tsx` — use `CategoryTag`; add ◈ buyable/sellable marker.
- `src/lib/queries.ts` — `getTradeFlags()`.
- `src/app/items/page.tsx` — fetch trade flags, pass to cards.
- `src/components/ItemFilters.tsx` — compact sticky filter bar.
- `src/app/items/[slug]/page.tsx` — Buy/Sell sections + header badges; crafts exclude trades.
- `src/app/page.tsx` — reworked hero + category dot chips.
- `tests/e2e/wiki.spec.ts` — cover Buy/Sell + grid markers; add trade item pages to a11y sweep.

All paths are relative to `sand-wiki/`. Run all commands from `sand-wiki/`.

---

## Task 1: Darker dark-theme palette

**Files:**
- Modify: `src/app/globals.css:9-11`

- [ ] **Step 1: Darken the `desertnight` base colors**

In `src/app/globals.css`, inside the `desertnight` theme block, change only these three lines:

```css
  --color-base-100: #100b06;
  --color-base-200: #181009;
  --color-base-300: #241910;
```

Leave `--color-base-content` and every other variable (including the entire `desertday` block) unchanged.

- [ ] **Step 2: Build to confirm CSS still compiles**

Run (PowerShell): `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: deepen desertnight background palette"
```

---

## Task 2: Sticky navbar + global width

**Files:**
- Modify: `src/app/layout.tsx:21-24`
- Modify: `src/components/MainNav.tsx:12`

- [ ] **Step 1: Make the header sticky and translucent**

In `src/app/layout.tsx`, replace the `<header>` and `<main>` lines:

```tsx
        <header className="sticky top-0 z-40 border-b border-base-300 bg-base-100/90 backdrop-blur supports-[backdrop-filter]:bg-base-100/80">
          <MainNav />
        </header>
        <main className="max-w-6xl mx-auto w-full p-4 flex-1">{children}</main>
```

(Only the two `className` values change; structure stays the same.)

- [ ] **Step 2: Widen the nav container to match the wider main**

In `src/components/MainNav.tsx`, change the `<nav>` className from `max-w-5xl` to `max-w-6xl`:

```tsx
    <nav aria-label="Primary" className="navbar max-w-6xl mx-auto px-4">
```

- [ ] **Step 3: Run the existing theme/nav e2e to confirm no regression**

Run (PowerShell): `npm run test:e2e -- -g "theme toggle|Items category menu|a11y"`
Expected: PASS (sticky header and width changes don't break theme toggle, nav menu, or axe).

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/components/MainNav.tsx
git commit -m "feat: sticky translucent navbar and wider content frame"
```

---

## Task 3: Category colors + CategoryTag component

**Files:**
- Modify: `src/lib/taxonomy.ts` (append after `categoryLabel`)
- Test: `src/lib/taxonomy.test.ts`
- Create: `src/components/CategoryTag.tsx`

- [ ] **Step 1: Write the failing color test**

Add to `src/lib/taxonomy.test.ts` — extend the imports and add a new `describe`:

```ts
// add to the existing import from "./taxonomy":
//   CATEGORY_COLORS, categoryColor,

describe("category colors", () => {
  it("defines a color for every item category", () => {
    for (const slug of ITEM_CATEGORY_SLUGS) {
      expect(CATEGORY_COLORS[slug], `missing color for ${slug}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("falls back to the misc color for unknown slugs", () => {
    expect(categoryColor("nope")).toBe(CATEGORY_COLORS.misc);
    expect(categoryColor("weapons")).toBe("#d4654f");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (PowerShell): `npm test -- taxonomy`
Expected: FAIL — `CATEGORY_COLORS`/`categoryColor` are not exported.

- [ ] **Step 3: Implement the colors**

Append to `src/lib/taxonomy.ts`:

```ts
/** Per-category accent color (hex). Decorative dot only — the text label carries meaning. */
export const CATEGORY_COLORS: Record<string, string> = {
  weapons: "#d4654f",
  guns: "#8b94a6",
  ammo: "#e0a341",
  resources: "#7fb069",
  tools: "#4fb3a6",
  attire: "#6aa9c9",
  medical: "#d56a8c",
  misc: "#9b8b73",
};

export function categoryColor(slug: string): string {
  return CATEGORY_COLORS[slug] ?? CATEGORY_COLORS.misc;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (PowerShell): `npm test -- taxonomy`
Expected: PASS.

- [ ] **Step 5: Create the CategoryTag component**

Create `src/components/CategoryTag.tsx`:

```tsx
import { categoryColor, categoryLabel } from "@/lib/taxonomy";

/** Neutral pill with a colored dot. The text label is the meaningful signal;
 *  the dot is decorative (aria-hidden) so there is no color-contrast concern. */
export function CategoryTag({ slug, size }: { slug: string; size?: "sm" }) {
  return (
    <span className={`badge badge-outline gap-1.5 ${size === "sm" ? "badge-sm" : ""}`}>
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: categoryColor(slug) }}
        aria-hidden="true"
      />
      {categoryLabel(slug)}
    </span>
  );
}
```

- [ ] **Step 6: Type-check**

Run (PowerShell): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/taxonomy.ts src/lib/taxonomy.test.ts src/components/CategoryTag.tsx
git commit -m "feat: per-category colors and CategoryTag dot+label badge"
```

---

## Task 4: Use CategoryTag in cards, item header, home chips

**Files:**
- Modify: `src/components/ItemCard.tsx:13-15`
- Modify: `src/app/items/[slug]/page.tsx:18-19`
- Modify: `src/app/page.tsx:28-34`

- [ ] **Step 1: Swap the plain badge in ItemCard for CategoryTag**

In `src/components/ItemCard.tsx`, replace the import of `categoryLabel` and the category badge.

Change the import line:

```tsx
import { CategoryTag } from "@/components/CategoryTag";
```

Replace the category badge span:

```tsx
            <CategoryTag slug={item.category} size="sm" />
```

(Keep the `Tier {workbenchTier}` badge as-is.)

- [ ] **Step 2: Use CategoryTag in the item-detail header**

In `src/app/items/[slug]/page.tsx`, replace the category badge:

```tsx
          <CategoryTag slug={item.category} />
```

And add the import at the top:

```tsx
import { CategoryTag } from "@/components/CategoryTag";
```

Remove the now-unused `categoryLabel` import if nothing else uses it on the page (it does not after this change — delete `categoryLabel` from the taxonomy import).

- [ ] **Step 3: Use dot chips on the home page**

In `src/app/page.tsx`, replace the category links block (the `ITEM_CATEGORIES.map(...)` inside the hero) so each link wraps a `CategoryTag`:

```tsx
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {ITEM_CATEGORIES.map((c) => (
                <Link key={c.slug} href={`/items?category=${c.slug}`} className="hover:opacity-80 transition-opacity">
                  <CategoryTag slug={c.slug} />
                </Link>
              ))}
            </div>
```

Add the import:

```tsx
import { CategoryTag } from "@/components/CategoryTag";
```

- [ ] **Step 4: Type-check and build**

Run (PowerShell): `npx tsc --noEmit; if ($?) { npm run build }`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/ItemCard.tsx src/app/items/[slug]/page.tsx src/app/page.tsx
git commit -m "feat: render category tags as dot+label across cards, header, home"
```

---

## Task 5: trades.ts — classify Buy/Sell + price helpers (TDD)

**Files:**
- Create: `src/lib/trades.ts`
- Test: `src/lib/trades.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/trades.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyTrades, formatCrowns, formatUnitPrice } from "./trades";
import type { RecipeCard } from "./recipes";

const buyC4: RecipeCard = {
  slug: "c4-dynamite", workbench: null, tier: null, craftTimeSeconds: 30,
  inputs: [{ slug: "coin-crown", name: "Coin Crown", amount: 10 }],
  outputs: [{ slug: "c4-dynamite", name: "C4 Dynamite", amount: 1 }],
};

const craftC4: RecipeCard = {
  slug: "c4-dynamite-2", workbench: "Armament", tier: 2, craftTimeSeconds: 3,
  inputs: [
    { slug: "resource-fabric", name: "Fabric", amount: 2 },
    { slug: "resource-gunpowder", name: "Gunpowder", amount: 2 },
  ],
  outputs: [{ slug: "c4-dynamite", name: "C4 Dynamite", amount: 1 }],
};

// pistol-ammo sells: 1->5, 5->25, 100->1000 (unit 5, 5, 10)
const sell = (qty: number, crowns: number, slug: string): RecipeCard => ({
  slug, workbench: null, tier: null, craftTimeSeconds: null,
  inputs: [{ slug: "pistol-ammo", name: "Pistol Ammo", amount: qty }],
  outputs: [{ slug: "coin-crown", name: "Coin Crown", amount: crowns }],
});

describe("classifyTrades", () => {
  it("treats a coin-crown-input recipe as a Buy and keeps real crafts separate", () => {
    const r = classifyTrades("c4-dynamite", [buyC4, craftC4], []);
    expect(r.buy).toEqual([
      { recipeSlug: "c4-dynamite", quantity: 1, totalCrowns: 10, unitPrice: 10, isBest: true },
    ]);
    expect(r.sell).toEqual([]);
    expect(r.crafts.map((c) => c.slug)).toEqual(["c4-dynamite-2"]);
  });

  it("treats coin-crown-output recipes as Sells, sorted by quantity, best = highest unit price", () => {
    const r = classifyTrades(
      "pistol-ammo",
      [],
      [sell(100, 1000, "coin-crown-3"), sell(1, 5, "coin-crown"), sell(5, 25, "coin-crown-2")],
    );
    expect(r.sell).toEqual([
      { recipeSlug: "coin-crown", quantity: 1, totalCrowns: 5, unitPrice: 5, isBest: false },
      { recipeSlug: "coin-crown-2", quantity: 5, totalCrowns: 25, unitPrice: 5, isBest: false },
      { recipeSlug: "coin-crown-3", quantity: 100, totalCrowns: 1000, unitPrice: 10, isBest: true },
    ]);
    expect(r.usedInCrafts).toEqual([]);
  });

  it("does not classify trades when the page item IS the currency", () => {
    const r = classifyTrades("coin-crown", [sell(1, 5, "coin-crown")], [buyC4]);
    expect(r.buy).toEqual([]);
    expect(r.sell).toEqual([]);
    expect(r.crafts).toHaveLength(1);
    expect(r.usedInCrafts).toHaveLength(1);
  });
});

describe("formatters", () => {
  it("formats crown totals with thousands separators", () => {
    expect(formatCrowns(1000)).toBe("1,000");
    expect(formatCrowns(5)).toBe("5");
  });
  it("formats unit price, trimming trailing zeros", () => {
    expect(formatUnitPrice(10)).toBe("10");
    expect(formatUnitPrice(2.5)).toBe("2.5");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (PowerShell): `npm test -- trades`
Expected: FAIL — `./trades` does not exist.

- [ ] **Step 3: Implement trades.ts**

Create `src/lib/trades.ts`:

```ts
import type { RecipeCard, RecipeCardRow } from "./recipes";

export const CURRENCY_SLUG = "coin-crown";

export interface TradeOption {
  recipeSlug: string;
  quantity: number; // units of the item bought or sold
  totalCrowns: number; // crowns paid (buy) or received (sell)
  unitPrice: number; // totalCrowns / quantity
  isBest: boolean;
}

export interface ItemTrades {
  buy: TradeOption[];
  sell: TradeOption[];
  crafts: RecipeCard[]; // non-trade recipes that produce the item
  usedInCrafts: RecipeCard[]; // non-trade recipes that consume the item
}

const amountOf = (rows: RecipeCardRow[], slug: string): number =>
  rows.find((r) => r.slug === slug)?.amount ?? 0;

const hasItem = (rows: RecipeCardRow[], slug: string): boolean =>
  rows.some((r) => r.slug === slug);

/** Sort by quantity asc and flag the single best unit price (first match wins on ties). */
function withBest(options: Omit<TradeOption, "isBest">[], pick: "min" | "max"): TradeOption[] {
  if (options.length === 0) return [];
  const sorted = [...options].sort((a, b) => a.quantity - b.quantity);
  const prices = sorted.map((o) => o.unitPrice);
  const best = pick === "min" ? Math.min(...prices) : Math.max(...prices);
  let flagged = false;
  return sorted.map((o) => {
    const isBest = !flagged && o.unitPrice === best;
    if (isBest) flagged = true;
    return { ...o, isBest };
  });
}

/**
 * Partition an item's recipes into Buy/Sell trades (the other side is Coin Crown)
 * and the leftover real crafts. When the page item itself is the currency, nothing
 * is reclassified as a trade.
 */
export function classifyTrades(
  itemSlug: string,
  craftedBy: RecipeCard[],
  usedIn: RecipeCard[],
): ItemTrades {
  const isCurrencyPage = itemSlug === CURRENCY_SLUG;

  const rawBuy: Omit<TradeOption, "isBest">[] = [];
  const crafts: RecipeCard[] = [];
  for (const r of craftedBy) {
    const isBuy =
      !isCurrencyPage && hasItem(r.inputs, CURRENCY_SLUG) && hasItem(r.outputs, itemSlug);
    if (isBuy) {
      const quantity = amountOf(r.outputs, itemSlug);
      const totalCrowns = amountOf(r.inputs, CURRENCY_SLUG);
      rawBuy.push({ recipeSlug: r.slug, quantity, totalCrowns, unitPrice: totalCrowns / quantity });
    } else {
      crafts.push(r);
    }
  }

  const rawSell: Omit<TradeOption, "isBest">[] = [];
  const usedInCrafts: RecipeCard[] = [];
  for (const r of usedIn) {
    const isSell =
      !isCurrencyPage && hasItem(r.outputs, CURRENCY_SLUG) && hasItem(r.inputs, itemSlug);
    if (isSell) {
      const quantity = amountOf(r.inputs, itemSlug);
      const totalCrowns = amountOf(r.outputs, CURRENCY_SLUG);
      rawSell.push({ recipeSlug: r.slug, quantity, totalCrowns, unitPrice: totalCrowns / quantity });
    } else {
      usedInCrafts.push(r);
    }
  }

  return {
    buy: withBest(rawBuy, "min"), // cheapest per unit is best to buy
    sell: withBest(rawSell, "max"), // most per unit is best to sell
    crafts,
    usedInCrafts,
  };
}

export function formatCrowns(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatUnitPrice(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString();
}
```

- [ ] **Step 4: Run to verify pass**

Run (PowerShell): `npm test -- trades`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/trades.ts src/lib/trades.test.ts
git commit -m "feat: trades classifier for Buy/Sell from coin-crown recipes"
```

---

## Task 6: Grid trade flags — getTradeFlags + ItemCard markers

**Files:**
- Modify: `src/lib/queries.ts`
- Modify: `src/components/ItemCard.tsx`
- Modify: `src/app/items/page.tsx`

- [ ] **Step 1: Add getTradeFlags to queries.ts**

Append to `src/lib/queries.ts` (and add the import at the top: `import { CURRENCY_SLUG } from "./trades";`):

```ts
/**
 * Item slugs that can be bought (produced by a recipe whose input includes Coin Crown)
 * or sold (consumed by a recipe whose output includes Coin Crown). One pair of queries
 * for the whole list — used to mark grid cards.
 */
export async function getTradeFlags(): Promise<{ buyable: Set<string>; sellable: Set<string> }> {
  const [buys, sells] = await Promise.all([
    prisma.recipe.findMany({
      where: { inputs: { some: { item: { slug: CURRENCY_SLUG } } } },
      select: { outputs: { select: { item: { select: { slug: true } } } } },
    }),
    prisma.recipe.findMany({
      where: { outputs: { some: { item: { slug: CURRENCY_SLUG } } } },
      select: { inputs: { select: { item: { select: { slug: true } } } } },
    }),
  ]);

  const buyable = new Set<string>();
  for (const r of buys) for (const o of r.outputs) if (o.item.slug !== CURRENCY_SLUG) buyable.add(o.item.slug);

  const sellable = new Set<string>();
  for (const r of sells) for (const i of r.inputs) if (i.item.slug !== CURRENCY_SLUG) sellable.add(i.item.slug);

  return { buyable, sellable };
}
```

- [ ] **Step 2: Extend ItemCardData and render markers**

Replace the body of `src/components/ItemCard.tsx`:

```tsx
import Link from "next/link";
import { CategoryTag } from "@/components/CategoryTag";

export interface ItemCardData {
  slug: string; name: string; category: string; workbenchTier: number | null;
  buyable?: boolean; sellable?: boolean;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="list-none">
      <Link href={`/items/${item.slug}`} className="card bg-base-200 hover:bg-base-300 transition-colors h-full">
        <div className="card-body p-4">
          <span className="font-medium">{item.name}</span>
          <div className="flex flex-wrap gap-2 items-center">
            <CategoryTag slug={item.category} size="sm" />
            {item.workbenchTier !== null && (
              <span className="badge badge-ghost badge-sm">Tier {item.workbenchTier}</span>
            )}
            {item.buyable && (
              <span className="badge badge-success badge-sm" aria-label="Buyable">◈ Buy</span>
            )}
            {item.sellable && (
              <span className="badge badge-warning badge-sm" aria-label="Sellable">◈ Sell</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
```

- [ ] **Step 3: Wire flags into the items page**

In `src/app/items/page.tsx`, import `getTradeFlags`, fetch it alongside the others, and map the flags onto each card.

Change the import line:

```tsx
import { listItems, listWorkbenchTiers, getTradeFlags } from "@/lib/queries";
```

Change the data fetch:

```tsx
  const [items, tiers, tradeFlags] = await Promise.all([
    listItems(filter),
    listWorkbenchTiers(),
    getTradeFlags(),
  ]);
```

Change the grid render to pass flags:

```tsx
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <ItemCard
              key={i.id}
              item={{
                slug: i.slug, name: i.name, category: i.category, workbenchTier: i.workbenchTier,
                buyable: tradeFlags.buyable.has(i.slug),
                sellable: tradeFlags.sellable.has(i.slug),
              }}
            />
          ))}
        </ul>
```

- [ ] **Step 4: Type-check and build**

Run (PowerShell): `npx tsc --noEmit; if ($?) { npm run build }`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts src/components/ItemCard.tsx src/app/items/page.tsx
git commit -m "feat: mark buyable/sellable items in the grid"
```

---

## Task 7: Item page — Buy/Sell sections + header badges

**Files:**
- Create: `src/components/TradeSection.tsx`
- Modify: `src/app/items/[slug]/page.tsx`

- [ ] **Step 1: Create the TradeSection component**

Create `src/components/TradeSection.tsx`:

```tsx
import Link from "next/link";
import { type TradeOption, formatCrowns, formatUnitPrice } from "@/lib/trades";

const VERB = { buy: "Buy", sell: "Sell" } as const;

export function TradeSection({ kind, options }: { kind: "buy" | "sell"; options: TradeOption[] }) {
  if (options.length === 0) return null;
  const verb = VERB[kind];
  return (
    <section>
      <h2 className="font-display text-xl font-semibold mb-2">{verb}</h2>
      <ul className="space-y-2">
        {options.map((o) => (
          <li
            key={o.recipeSlug}
            className="card bg-base-200 flex-row flex-wrap items-center gap-3 p-3 text-sm"
          >
            <span>
              {verb} <span className="font-medium">{o.quantity}×</span> for{" "}
              <span className="font-semibold">{formatCrowns(o.totalCrowns)} crowns</span>
              <span aria-hidden="true"> ◈</span>
            </span>
            <span className="text-base-content/70">{formatUnitPrice(o.unitPrice)} crowns each</span>
            {o.isBest && <span className="badge badge-success badge-sm ml-auto">Best</span>}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-base-content/60">
        Priced in <Link href="/items/coin-crown" className="link">Coin Crown</Link>.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Rebuild the item-detail page around trades**

In `src/app/items/[slug]/page.tsx`:

Add imports:

```tsx
import { classifyTrades } from "@/lib/trades";
import { TradeSection } from "@/components/TradeSection";
```

After `if (!item) notFound();`, compute the partition:

```tsx
  const { buy, sell, crafts, usedInCrafts } = classifyTrades(item.slug, item.craftedBy, item.usedIn);
```

In the header badge row, add the buyable/sellable badges after the existing category/resource/tier badges:

```tsx
          {buy.length > 0 && <span className="badge badge-success" aria-label="Buyable">◈ Buyable</span>}
          {sell.length > 0 && <span className="badge badge-warning" aria-label="Sellable">◈ Sellable</span>}
```

Insert the Buy and Sell sections immediately before the "Crafted by" section:

```tsx
      <TradeSection kind="buy" options={buy} />
      <TradeSection kind="sell" options={sell} />
```

Change the "Crafted by" section to use `crafts` instead of `item.craftedBy`:

```tsx
        {crafts.length === 0 ? (
          <p className="text-base-content/70">No known recipe produces this item.</p>
        ) : (
          <div className="space-y-3">
            {crafts.map((r) => <RecipeCardView key={r.slug} recipe={r} />)}
          </div>
        )}
```

Change the "Used in" section to use `usedInCrafts` instead of `item.usedIn`:

```tsx
        {usedInCrafts.length === 0 ? (
          <p className="text-base-content/70">Not used as an ingredient in any known recipe.</p>
        ) : (
          <div className="space-y-3">
            {usedInCrafts.map((r) => <RecipeCardView key={r.slug} recipe={r} />)}
          </div>
        )}
```

- [ ] **Step 3: Type-check and build**

Run (PowerShell): `npx tsc --noEmit; if ($?) { npm run build }`
Expected: no type errors; build succeeds.

- [ ] **Step 4: Manually sanity-check two pages**

Run (PowerShell): `npm run dev` (then stop with Ctrl+C after checking)
Visit `http://localhost:3000/items/c4-dynamite` — expect a **Buyable** header badge and a **Buy** section ("Buy 1× for 10 crowns").
Visit `http://localhost:3000/items/pistol-ammo` — expect a **Sellable** badge and a **Sell** section with three rows, the `100×` row flagged **Best**.

- [ ] **Step 5: Commit**

```bash
git add src/components/TradeSection.tsx src/app/items/[slug]/page.tsx
git commit -m "feat: Buy/Sell sections and buyable/sellable badges on item page"
```

---

## Task 8: Compact sticky filter bar

**Files:**
- Modify: `src/components/ItemFilters.tsx:11-12`

- [ ] **Step 1: Make the filter form sticky under the navbar**

In `src/components/ItemFilters.tsx`, change the `<form>` className so the bar pins below the sticky navbar and reads as a compact strip:

```tsx
    <form action="/items" method="get" className="card bg-base-200 mb-6 sticky top-[4.5rem] z-30">
```

(The navbar is ~4rem tall; `top-[4.5rem]` leaves a small gap. Keep the inner `card-body grid …` layout as-is.)

- [ ] **Step 2: Build to confirm**

Run (PowerShell): `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ItemFilters.tsx
git commit -m "feat: sticky compact items filter bar"
```

---

## Task 9: Home page rework

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Constrain home width and refresh hero copy**

In `src/app/page.tsx`, wrap the outer `<div className="space-y-10 py-6">` content width to `max-w-5xl` (the `<main>` is now `max-w-6xl`), and update the hero subtitle to mention trade prices.

Change the outer wrapper:

```tsx
  return (
    <div className="max-w-5xl mx-auto space-y-10 py-6">
```

Change the hero subtitle paragraph text:

```tsx
            <p className="py-3 text-base-content/70">
              Items, crafting recipes, and trade prices for{" "}
              <em>SAND: Raiders of Sophie</em>.
            </p>
```

(The category dot chips were already added in Task 4. Leave the search form and "Browse by section" grid as-is — they inherit the darker theme.)

- [ ] **Step 2: Build to confirm**

Run (PowerShell): `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: rework home hero width and copy"
```

---

## Task 10: e2e coverage + full gate

**Files:**
- Modify: `tests/e2e/wiki.spec.ts`

- [ ] **Step 1: Add trade item pages to the a11y sweep**

In `tests/e2e/wiki.spec.ts`, extend the `pages` array (top of file) to include the two trade pages:

```ts
const pages = [
  "/", "/items", "/items/sniper-rifle-silencer", "/items/c4-dynamite", "/items/pistol-ammo",
  "/tech", "/tools", "/about", "/environment", "/tramplers",
];
```

- [ ] **Step 2: Add Buy/Sell behavior tests**

Append to `tests/e2e/wiki.spec.ts`:

```ts
test("buyable item shows a Buy section and header badge", async ({ page }) => {
  await page.goto("/items/c4-dynamite");
  await expect(page.getByLabel("Buyable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buy" })).toBeVisible();
  await expect(page.getByText(/for 10 crowns/i)).toBeVisible();
});

test("sellable item lists all sell tiers with a best-price marker", async ({ page }) => {
  await page.goto("/items/pistol-ammo");
  await expect(page.getByLabel("Sellable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sell" })).toBeVisible();
  await expect(page.getByText(/for 1,000 crowns/i)).toBeVisible();
  await expect(page.getByText("Best")).toBeVisible();
});

test("items grid marks buyable and sellable items", async ({ page }) => {
  await page.goto("/items");
  await expect(page.locator('a[href="/items/c4-dynamite"]').getByLabel("Buyable")).toBeVisible();
  await expect(page.locator('a[href="/items/pistol-ammo"]').getByLabel("Sellable")).toBeVisible();
});
```

- [ ] **Step 3: Run the full verification gate**

Run each (PowerShell), all must pass:

```
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e
```

Expected: vitest green (taxonomy + trades + recipes), no type errors, no lint errors, build succeeds, all Playwright tests pass including axe in **both** themes.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/wiki.spec.ts
git commit -m "test: e2e for Buy/Sell sections, header badges, and grid markers"
```

---

## Self-Review notes

- **Spec coverage:** Theme darken (Task 1), sticky navbar + width (Task 2, 9), category colors + tag (Tasks 3–4), trades classifier (Task 5), grid markers (Task 6), Buy/Sell sections + header badge (Task 7), sticky filter bar (Task 8), home rework (Tasks 4 + 9), tests (Tasks 3, 5, 10). All spec sections map to a task.
- **Consistency:** `getTradeFlags` (DB) and `classifyTrades` (in-memory) both key on `coin-crown` opposite the item, so the grid markers and item-page sections always agree. `CURRENCY_SLUG` is defined once in `trades.ts` and imported by `queries.ts`.
- **Existing e2e unaffected:** the current "Crafted by/Used in" tests use `sniper-rifle-silencer` and `resource-metal-parts`, neither of which is a crown trade, so their Inputs/Outputs headings remain.
- **a11y:** the category dot and ◈ glyph are `aria-hidden`/labeled; trade text spells out "crowns"; semantic DaisyUI badge colors are used so both themes keep contrast.
