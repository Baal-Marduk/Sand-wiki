# Item Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the item detail page into a two-column layout — header with an item icon, tabbed relationship tables (Crafted by / Used in / Buy / Sell), and a right-hand Details panel — replacing the stacked recipe cards.

**Architecture:** New presentational components (`ItemIcon`, `ItemDetailsPanel`, `ItemTabs`, `CraftTable`, `UsedInTable`, `TradeTable`) plus a pure `item-view.ts` helper for the Details rows and available-tab list. Tabs are CSS-only DaisyUI radio tabs, so the page stays a server component. Reuses the existing `classifyTrades` partition and `RecipeCard` shape; no DB changes.

**Tech Stack:** Next.js 16 (RSC), Prisma 6, DaisyUI 5 (`tabs tabs-border` + `tab-content`), vitest, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-06-09-item-page-redesign-design.md`

**Environment notes (from project memory):**
- Use the **PowerShell** tool for `npm`/`node`/`npx` — Bash has no Node on PATH. Prefix each command with `Set-Location "d:\Documents\SandLabs\sand-wiki";`.
- Deps installed, Prisma client generated, `sand-wiki/.env` present with `DATABASE_URL`. **Do not run `npm install`.**
- `next build` works without a DB (dynamic routes); `next dev`/e2e need the DB (configured).
- Branch: `build/wiki-item-page-redesign`. Commit there; do not switch branches.
- Use DaisyUI semantic classes; axe must pass in both `desertnight` and `desertday` themes.

**Existing data shapes (do not redefine):**
- `src/lib/recipes.ts`: `RecipeCardRow { slug: string; name: string; amount: number }`, `RecipeCard { slug; workbench: string|null; tier: number|null; craftTimeSeconds: number|null; inputs: RecipeCardRow[]; outputs: RecipeCardRow[] }`.
- `src/lib/trades.ts`: `ItemTrades { buy: TradeOption[]; sell: TradeOption[]; crafts: RecipeCard[]; usedInCrafts: RecipeCard[] }`, `TradeOption { recipeSlug; quantity; totalCrowns; unitPrice; isBest }`, plus `formatCrowns`, `formatUnitPrice`. `classifyTrades(slug, craftedBy, usedIn)` returns `ItemTrades`.
- `src/lib/taxonomy.ts`: `categoryLabel(slug)`, `CategoryTag` component exists at `src/components/CategoryTag.tsx`.

---

## File Structure

**Create:** `src/components/ItemIcon.tsx`, `src/lib/item-view.ts`, `src/lib/item-view.test.ts`, `src/components/ItemDetailsPanel.tsx`, `src/components/ItemTabs.tsx`, `src/components/recipe-cells.tsx`, `src/components/CraftTable.tsx`, `src/components/UsedInTable.tsx`, `src/components/TradeTable.tsx`.

**Modify:** `src/app/items/[slug]/page.tsx`, `tests/e2e/wiki.spec.ts`.

**Remove:** `src/components/RecipeCardView.tsx`, `src/components/TradeSection.tsx` (both only used by the item page; replaced by the tables).

All paths relative to `sand-wiki/`. Run commands from `sand-wiki/`.

---

## Task 1: `ItemIcon` placeholder

**Files:** Create `src/components/ItemIcon.tsx`

- [ ] **Step 1: Create the component**

```tsx
/** Placeholder for the (not-yet-available) item image. Swap the inner glyph for an
 *  <img> when item images land — this is the single change point. */
export function ItemIcon({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const px = { sm: "size-5", md: "size-12", lg: "size-28" }[size];
  return (
    <span
      className={`${px} inline-flex items-center justify-center rounded-box bg-base-300 text-base-content/40 shrink-0`}
      role="img"
      aria-label={name}
      title={name}
    >
      <span aria-hidden="true">▦</span>
    </span>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit; if ($?) { npm run lint }`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ItemIcon.tsx
git commit -m "feat: ItemIcon image placeholder component"
```

---

## Task 2: `item-view.ts` helpers (TDD)

**Files:** Create `src/lib/item-view.ts`, `src/lib/item-view.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/item-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { itemDetailRows, availableTabs, type ItemFacts } from "./item-view";
import type { ItemTrades } from "@/lib/trades";

const noTrades: ItemTrades = { buy: [], sell: [], crafts: [], usedInCrafts: [] };
const facts: ItemFacts = { category: "weapons", isResource: false, storageStack: 5, workbenchTier: 2 };

const buyOpt = { recipeSlug: "x", quantity: 1, totalCrowns: 10, unitPrice: 10, isBest: true };
const sellOpt = { recipeSlug: "y", quantity: 100, totalCrowns: 1000, unitPrice: 10, isBest: true };

describe("itemDetailRows", () => {
  it("includes category, stack and tier; omits resource when false", () => {
    expect(itemDetailRows(facts, noTrades)).toEqual([
      { label: "Category", value: "Weapons" },
      { label: "Stack size", value: "×5" },
      { label: "Workbench tier", value: "2" },
    ]);
  });

  it("omits stack and tier when null and shows Resource when true", () => {
    const r = itemDetailRows({ category: "resources", isResource: true, storageStack: null, workbenchTier: null }, noTrades);
    expect(r).toEqual([
      { label: "Category", value: "Resources" },
      { label: "Resource", value: "Yes" },
    ]);
  });

  it("adds Buyable/Sellable summaries from trades", () => {
    const r = itemDetailRows(facts, { ...noTrades, buy: [buyOpt], sell: [sellOpt] });
    expect(r).toContainEqual({ label: "Buyable", value: "10 ◈ / unit" });
    expect(r).toContainEqual({ label: "Sellable", value: "10 ◈ / unit" });
  });
});

describe("availableTabs", () => {
  it("returns nothing when there is no data", () => {
    expect(availableTabs(noTrades)).toEqual([]);
  });

  it("returns tabs in fixed order, only those with data", () => {
    const trades: ItemTrades = {
      crafts: [{ slug: "c", workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] }],
      usedInCrafts: [],
      buy: [buyOpt],
      sell: [sellOpt],
    };
    expect(availableTabs(trades)).toEqual([
      { id: "crafted-by", label: "Crafted by" },
      { id: "buy", label: "Buy" },
      { id: "sell", label: "Sell" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- item-view`
Expected: FAIL — `./item-view` does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/item-view.ts`:

```ts
import type { ItemTrades } from "@/lib/trades";
import { formatCrowns } from "@/lib/trades";
import { categoryLabel } from "@/lib/taxonomy";

export interface DetailRow { label: string; value: string }

export interface ItemFacts {
  category: string;
  isResource: boolean;
  storageStack: number | null;
  workbenchTier: number | null;
}

/** Detail-panel rows — only those we have a value for. */
export function itemDetailRows(facts: ItemFacts, trades: ItemTrades): DetailRow[] {
  const rows: DetailRow[] = [{ label: "Category", value: categoryLabel(facts.category) }];
  if (facts.storageStack !== null) rows.push({ label: "Stack size", value: `×${facts.storageStack}` });
  if (facts.workbenchTier !== null) rows.push({ label: "Workbench tier", value: String(facts.workbenchTier) });
  if (facts.isResource) rows.push({ label: "Resource", value: "Yes" });
  if (trades.buy.length > 0) {
    const cheapest = Math.min(...trades.buy.map((b) => b.unitPrice));
    rows.push({ label: "Buyable", value: `${formatCrowns(cheapest)} ◈ / unit` });
  }
  if (trades.sell.length > 0) {
    const best = Math.max(...trades.sell.map((s) => s.unitPrice));
    rows.push({ label: "Sellable", value: `${formatCrowns(best)} ◈ / unit` });
  }
  return rows;
}

export type TabId = "crafted-by" | "used-in" | "buy" | "sell";
export interface TabDef { id: TabId; label: string }

/** Available relationship tabs in fixed order, only those with data. */
export function availableTabs(trades: ItemTrades): TabDef[] {
  const tabs: TabDef[] = [];
  if (trades.crafts.length > 0) tabs.push({ id: "crafted-by", label: "Crafted by" });
  if (trades.usedInCrafts.length > 0) tabs.push({ id: "used-in", label: "Used in" });
  if (trades.buy.length > 0) tabs.push({ id: "buy", label: "Buy" });
  if (trades.sell.length > 0) tabs.push({ id: "sell", label: "Sell" });
  return tabs;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- item-view`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/item-view.ts src/lib/item-view.test.ts
git commit -m "feat: item-view helpers for detail rows and available tabs"
```

---

## Task 3: `ItemDetailsPanel`

**Files:** Create `src/components/ItemDetailsPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { DetailRow } from "@/lib/item-view";

export function ItemDetailsPanel({ rows }: { rows: DetailRow[] }) {
  return (
    <aside className="card bg-base-200">
      <div className="card-body p-0">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-base-content/60 px-4 pt-3 pb-1">
          Details
        </h2>
        <table className="table table-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="text-base-content/70">{r.label}</td>
                <td className="text-right font-medium">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit; if ($?) { npm run lint }`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ItemDetailsPanel.tsx
git commit -m "feat: ItemDetailsPanel key/value sidebar"
```

---

## Task 4: `ItemTabs` (CSS radio tabs)

**Files:** Create `src/components/ItemTabs.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Fragment } from "react";

export interface Tab { id: string; label: string; content: React.ReactNode }

/** CSS-only radio tabs (DaisyUI). Server-component friendly, no JS, keyboard-navigable.
 *  The first tab is checked by default. Returns null when there are no tabs. */
export function ItemTabs({ tabs, name = "item-tabs" }: { tabs: Tab[]; name?: string }) {
  if (tabs.length === 0) return null;
  return (
    <div role="tablist" className="tabs tabs-border">
      {tabs.map((t, i) => (
        <Fragment key={t.id}>
          <input
            type="radio"
            name={name}
            role="tab"
            className="tab"
            aria-label={t.label}
            defaultChecked={i === 0}
          />
          <div role="tabpanel" className="tab-content pt-3">
            {t.content}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit; if ($?) { npm run lint }`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ItemTabs.tsx
git commit -m "feat: ItemTabs CSS-only radio tab container"
```

---

## Task 5: Relationship tables

**Files:** Create `src/components/recipe-cells.tsx`, `src/components/CraftTable.tsx`, `src/components/UsedInTable.tsx`, `src/components/TradeTable.tsx`

- [ ] **Step 1: Create shared recipe cell renderers**

Create `src/components/recipe-cells.tsx`:

```tsx
import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";
import type { RecipeCard, RecipeCardRow } from "@/lib/recipes";

export function IngredientList({ rows }: { rows: RecipeCardRow[] }) {
  if (rows.length === 0) return <span className="text-base-content/50">—</span>;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {rows.map((r) => (
        <span key={r.slug} className="inline-flex items-center gap-1">
          <ItemIcon name={r.name} size="sm" />
          <Link href={`/items/${r.slug}`} className="link">{r.name}</Link>
          <span className="text-xs text-base-content/60">×{r.amount}</span>
        </span>
      ))}
    </div>
  );
}

export function WorkbenchBadge({ recipe }: { recipe: RecipeCard }) {
  if (!recipe.workbench) return <span className="text-base-content/50">—</span>;
  return (
    <span className="badge badge-outline whitespace-nowrap">
      {recipe.workbench}{recipe.tier !== null ? ` · T${recipe.tier}` : ""}
    </span>
  );
}
```

- [ ] **Step 2: Create `CraftTable`**

Create `src/components/CraftTable.tsx`:

```tsx
import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";

export function CraftTable({ recipes }: { recipes: RecipeCard[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr><th>Ingredients</th><th>Time</th><th>Workbench</th></tr>
        </thead>
        <tbody>
          {recipes.map((r) => (
            <tr key={r.slug}>
              <td><IngredientList rows={r.inputs} /></td>
              <td className="whitespace-nowrap">{r.craftTimeSeconds !== null ? `${r.craftTimeSeconds} sec` : "—"}</td>
              <td><WorkbenchBadge recipe={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create `UsedInTable`**

Create `src/components/UsedInTable.tsx`:

```tsx
import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";

export function UsedInTable({ recipes }: { recipes: RecipeCard[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr><th>Produces</th><th>Ingredients</th><th>Workbench</th></tr>
        </thead>
        <tbody>
          {recipes.map((r) => (
            <tr key={r.slug}>
              <td><IngredientList rows={r.outputs} /></td>
              <td><IngredientList rows={r.inputs} /></td>
              <td><WorkbenchBadge recipe={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create `TradeTable`**

Create `src/components/TradeTable.tsx`:

```tsx
import { type TradeOption, formatCrowns, formatUnitPrice } from "@/lib/trades";

export function TradeTable({ options }: { options: TradeOption[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr><th>Quantity</th><th>Price</th><th>Per unit</th></tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr key={o.recipeSlug}>
              <td className="whitespace-nowrap">×{o.quantity}</td>
              <td className="whitespace-nowrap">{formatCrowns(o.totalCrowns)} ◈</td>
              <td className="whitespace-nowrap">
                {formatUnitPrice(o.unitPrice)} ◈
                {o.isBest && <span className="badge badge-success badge-sm ml-2">Best</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit; if ($?) { npm run lint }`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/recipe-cells.tsx src/components/CraftTable.tsx src/components/UsedInTable.tsx src/components/TradeTable.tsx
git commit -m "feat: Craft/UsedIn/Trade relationship tables"
```

---

## Task 6: Rebuild the item page

**Files:**
- Modify: `src/app/items/[slug]/page.tsx`
- Remove: `src/components/RecipeCardView.tsx`, `src/components/TradeSection.tsx`

- [ ] **Step 1: Replace the item page**

Replace `src/app/items/[slug]/page.tsx` entirely with:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemBySlug } from "@/lib/queries";
import { classifyTrades } from "@/lib/trades";
import { availableTabs, itemDetailRows, type TabId } from "@/lib/item-view";
import { CategoryTag } from "@/components/CategoryTag";
import { ItemIcon } from "@/components/ItemIcon";
import { ItemTabs, type Tab } from "@/components/ItemTabs";
import { ItemDetailsPanel } from "@/components/ItemDetailsPanel";
import { CraftTable } from "@/components/CraftTable";
import { UsedInTable } from "@/components/UsedInTable";
import { TradeTable } from "@/components/TradeTable";

type Params = Promise<{ slug: string }>;

export default async function ItemDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  const trades = classifyTrades(item.slug, item.craftedBy, item.usedIn);
  const { buy, sell, crafts, usedInCrafts } = trades;

  const tabContent: Record<TabId, React.ReactNode> = {
    "crafted-by": <CraftTable recipes={crafts} />,
    "used-in": <UsedInTable recipes={usedInCrafts} />,
    buy: <TradeTable options={buy} />,
    sell: <TradeTable options={sell} />,
  };
  const tabs: Tab[] = availableTabs(trades).map((t) => ({
    id: t.id,
    label: t.label,
    content: tabContent[t.id],
  }));

  const detailRows = itemDetailRows(
    {
      category: item.category,
      isResource: item.isResource,
      storageStack: item.storageStack,
      workbenchTier: item.workbenchTier,
    },
    trades,
  );

  return (
    <article className="py-6 space-y-6 max-w-5xl">
      <header className="flex flex-wrap items-start gap-4">
        <ItemIcon name={item.name} size="lg" />
        <div className="flex-1 min-w-[16rem] space-y-2">
          <h1 className="font-display text-3xl font-bold">{item.name}</h1>
          <div className="flex flex-wrap gap-2">
            <CategoryTag slug={item.category} />
            {buy.length > 0 && <span className="badge badge-success" aria-label="Buyable">◈ Buyable</span>}
            {sell.length > 0 && <span className="badge badge-warning" aria-label="Sellable">◈ Sellable</span>}
          </div>
          {item.description && <p className="text-base-content/80 max-w-prose">{item.description}</p>}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px] items-start">
        <div className="min-w-0">
          {tabs.length === 0 ? (
            <p className="text-base-content/70">No crafting, usage, or trade data for this item.</p>
          ) : (
            <ItemTabs tabs={tabs} />
          )}
        </div>
        <ItemDetailsPanel rows={detailRows} />
      </div>

      <p><Link href="/items" className="btn btn-ghost btn-sm">← Back to items</Link></p>
    </article>
  );
}
```

- [ ] **Step 2: Confirm the removed components are unused, then delete them**

Run (PowerShell): `Get-ChildItem -Recurse src -Include *.tsx,*.ts | Select-String -Pattern "RecipeCardView|TradeSection"`
Expected: the ONLY matches are inside `RecipeCardView.tsx` and `TradeSection.tsx` themselves (their own `export function` lines) — no `import` lines anywhere, since the rewritten page (Step 1) no longer imports them. If any other file still imports them, stop and report.

Delete the two now-dead files:
```
Remove-Item src/components/RecipeCardView.tsx, src/components/TradeSection.tsx
```

- [ ] **Step 3: Type-check, lint, build**

Run: `npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npm run build }`
Expected: no type errors, no lint errors, build succeeds (`/items/[slug]` dynamic).

- [ ] **Step 4: Commit**

```bash
git add src/app/items/[slug]/page.tsx src/components/RecipeCardView.tsx src/components/TradeSection.tsx
git commit -m "feat: rebuild item page with tabbed tables and details panel"
```

---

## Task 7: Update e2e + full gate

**Files:** Modify `tests/e2e/wiki.spec.ts`

The item-page structure changed: "Crafted by"/"Used in"/"Buy"/"Sell" are now **tabs** (`role="tab"` with those accessible names), recipe data is in **tables** (column headers "Ingredients"/"Produces"/"Workbench"; trade columns "Quantity"/"Price"/"Per unit"), and prices render as `N ◈` instead of "for N crowns". Update the affected tests.

- [ ] **Step 1: Replace the two existing item-detail recipe tests**

In `tests/e2e/wiki.spec.ts`, replace the `test("item detail shows multiple 'Crafted by' recipes and 'Used in'", ...)` and `test("resource detail lists the recipes it is used in", ...)` blocks with:

```ts
test("item detail shows Crafted by and Used in tabs with tables", async ({ page }) => {
  await page.goto("/items/sniper-rifle-silencer");
  await expect(page.getByRole("heading", { name: "Sniper Rifle Silencer" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Crafted by" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Used in" })).toBeVisible();
  // Default tab (Crafted by) renders an Ingredients column.
  await expect(page.getByRole("columnheader", { name: "Ingredients" })).toBeVisible();
  // Switching to Used in shows the Produces column.
  await page.getByRole("tab", { name: "Used in" }).click();
  await expect(page.getByRole("columnheader", { name: "Produces" })).toBeVisible();
});

test("resource detail exposes a Used in tab", async ({ page }) => {
  await page.goto("/items/resource-metal-parts");
  await expect(page.getByRole("heading", { name: "Resource Metal Parts" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Used in" })).toBeVisible();
});
```

- [ ] **Step 2: Replace the two existing Buy/Sell tests**

Replace the `test("buyable item shows a Buy section and header badge", ...)` and `test("sellable item lists all sell tiers with a best-price marker", ...)` blocks with:

```ts
test("buyable item shows a Buy tab, header badge, and Details summary", async ({ page }) => {
  await page.goto("/items/c4-dynamite");
  await expect(page.getByLabel("Buyable")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Buy" })).toBeVisible();
  // Details panel summarises the category.
  await expect(page.getByText("Category")).toBeVisible();
});

test("sellable item lists all sell tiers with a best-price marker", async ({ page }) => {
  await page.goto("/items/pistol-ammo");
  await expect(page.getByLabel("Sellable")).toBeVisible();
  await page.getByRole("tab", { name: "Sell" }).click();
  await expect(page.getByText("1,000 ◈")).toBeVisible();
  await expect(page.getByText("Best")).toBeVisible();
});
```

(The other tests — a11y sweep, theme toggle, search/autocomplete, grid markers, placeholders — are unchanged and still valid.)

- [ ] **Step 3: Run the full verification gate**

Run each (PowerShell), all must pass:

```
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e
```

Expected: vitest green (incl. `item-view`), no type errors, no lint errors, build succeeds, all Playwright tests pass including axe in **both** themes and the updated item-page tests.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/wiki.spec.ts
git commit -m "test: update item-page e2e for tabbed-table layout"
```

---

## Self-Review notes

- **Spec coverage:** ItemIcon (Task 1), item-view helpers (Task 2), ItemDetailsPanel (Task 3), ItemTabs (Task 4), Craft/UsedIn/Trade tables (Task 5), page rebuild + widen + remove dead components (Task 6), e2e + gate (Task 7). All spec sections map to a task.
- **Type consistency:** `DetailRow`/`ItemFacts`/`TabId`/`TabDef` defined in `item-view.ts` (Task 2) and consumed unchanged by the page (Task 6) and `ItemDetailsPanel` (Task 3). `Tab` defined in `ItemTabs.tsx` (Task 4) and used by the page. `IngredientList`/`WorkbenchBadge` defined in `recipe-cells.tsx` (Task 5) and used by Craft/UsedIn tables. `RecipeCard`/`TradeOption`/`formatCrowns`/`formatUnitPrice` imported from existing modules.
- **a11y:** tabs use DaisyUI radio inputs with `role="tab"`/`role="tabpanel"` and `aria-label`; `ItemIcon` is `role="img"` with `aria-label`; the ◈ glyph in tables is plain text inside a labeled column. axe asserted in both themes.
- **Dead code:** `RecipeCardView` and `TradeSection` are removed in Task 6 after confirming no remaining imports.
- **DB:** Tasks 1–6 verify via tsc/lint/build/vitest (no DB). Only Task 7's `test:e2e` needs the DB (configured).
```
