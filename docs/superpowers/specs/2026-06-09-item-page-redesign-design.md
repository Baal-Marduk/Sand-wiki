# Item Page Redesign

**Date:** 2026-06-09
**App:** `sand-wiki/` (Next.js 16 + Prisma 6 + DaisyUI 5)
**Status:** Approved (brainstorm), pending implementation plan

## Goal

Rework the item detail page into a structured, reference-quality layout (inspired by
RustLabs/RustClash): a header with an item icon, a two-column body with a tabbed table area
for relationships, and a right-hand **Details** key/value panel. Relationship data (crafting,
usage, trades) moves from stacked "recipe cards" to compact **tables**.

Chosen layout: **Design A — Sidebar + Tabs** (selected during brainstorm).

## Constraints / what we have

- No game stats (damage/RPM/aim-cone), no identifier, no despawn time — we don't store them.
  The Details panel uses only stored facts.
- Item images are not in the dataset yet → use a placeholder **`ItemIcon`** everywhere an image
  will go, swappable for real `<img>` later in one component.
- No ad panel.
- Data already available per item (via `getItemBySlug` + `classifyTrades`): `name`,
  `description`, `category`, `isResource`, `storageStack`, `workbenchTier`, and the
  `{ buy, sell, crafts, usedInCrafts }` partition from `src/lib/trades.ts`.

## Layout

```
┌───────────────────────────────────────────────────────────┐
│  [icon]  C4 Dynamite                                        │   header
│          ●Weapons  ◈Buyable                                 │
│          A volatile explosive used for raiding.             │
├──────────────────────────────────────┬────────────────────┤
│  ┌ tabs ────────────────────────────┐│  DETAILS            │
│  │ Crafted by · Used in · Buy · Sell ││  Category   Weapons │
│  ├───────────────────────────────────┤│  Stack size   ×5    │
│  │  (table for the active tab)       ││  Workbench T  2     │
│  └───────────────────────────────────┘│  Buyable    10 ◈    │
│            main column                 │     sidebar         │
└──────────────────────────────────────┴────────────────────┘
```

- Header is full-width: `ItemIcon` (left), then title, `CategoryTag`, `◈ Buyable`/`◈ Sellable`
  badges, and the description.
- Body is a two-column grid (`lg:grid-cols-[1fr_260px]`, stacks on mobile): tabbed tables in the
  main column, `ItemDetailsPanel` in the sidebar.
- Container width stays `max-w-3xl`? → widen item detail to `max-w-5xl` to fit the two columns
  comfortably (the list pages already use `max-w-6xl`; item detail moves from `max-w-3xl` to
  `max-w-5xl`).

## Components / files

### Create

**`src/components/ItemIcon.tsx`** — placeholder for the future item image:
```tsx
export function ItemIcon({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const px = { sm: "size-5", md: "size-12", lg: "size-28" }[size];
  return (
    <span
      className={`${px} inline-flex items-center justify-center rounded-box bg-base-300 text-base-content/40 shrink-0`}
      role="img"
      aria-label={name}
      title={name}
    >
      {/* placeholder glyph until item images land */}
      <span aria-hidden="true">▦</span>
    </span>
  );
}
```
Swapping to real images later = render an `<img>` here; no other file changes.

**`src/lib/item-view.ts`** — pure helper building the Details rows + the available-tab list
(unit-tested):
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

/** Only includes rows we actually have a value for. */
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

/** Available tabs in fixed order, only those with data. */
export function availableTabs(trades: ItemTrades): TabDef[] {
  const tabs: TabDef[] = [];
  if (trades.crafts.length > 0) tabs.push({ id: "crafted-by", label: "Crafted by" });
  if (trades.usedInCrafts.length > 0) tabs.push({ id: "used-in", label: "Used in" });
  if (trades.buy.length > 0) tabs.push({ id: "buy", label: "Buy" });
  if (trades.sell.length > 0) tabs.push({ id: "sell", label: "Sell" });
  return tabs;
}
```

**`src/components/ItemDetailsPanel.tsx`** — renders `DetailRow[]` as a key/value table in a
`card bg-base-200` with a "Details" heading.

**`src/components/ItemTabs.tsx`** — generic CSS-only radio-tab container (server component, no
JS), using DaisyUI's `tabs` with `<input type="radio" role="tab">`:
```tsx
export interface Tab { id: string; label: string; content: React.ReactNode }

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
          <div role="tabpanel" className="tab-content pt-3">{t.content}</div>
        </Fragment>
      ))}
    </div>
  );
}
```
CSS-only tabs keep the page a server component, work without JS, and are keyboard-navigable
(radio group). The first available tab is checked by default.

**`src/components/CraftTable.tsx`** — `RecipeCard[]` → table, columns **Ingredients · Time ·
Workbench**. Ingredient cells: `ItemIcon size="sm"` + linked name + `×amount`.

**`src/components/UsedInTable.tsx`** — `RecipeCard[]` → table, columns **Produces · Ingredients ·
Workbench**. "Produces" = the recipe's output item(s) (icon + linked name + `×amount`).

**`src/components/TradeTable.tsx`** — `(kind: "buy"|"sell", options: TradeOption[])` → table,
columns **Quantity · Price · Per unit**, with the `Best` badge on `isBest`. Reuses
`formatCrowns`/`formatUnitPrice`.

**`src/lib/item-view.test.ts`** — unit tests for `itemDetailRows` and `availableTabs`.

### Modify

**`src/app/items/[slug]/page.tsx`** — rebuild around the new layout:
- Header with `ItemIcon size="lg"`, title, `CategoryTag`, `◈ Buyable`/`◈ Sellable` badges,
  description.
- Two-column grid: `<ItemTabs tabs={...} />` (built from `availableTabs` + the table components)
  in the main column; `<ItemDetailsPanel rows={itemDetailRows(...)} />` in the sidebar.
- Empty state: if no tabs at all, show a muted "No crafting, usage, or trade data for this item."
- Widen the article container to `max-w-5xl`.

### Remove

**`src/components/RecipeCardView.tsx`** — replaced by the table components; it is only used by the
item page. Delete it after the page no longer imports it. (Confirm with a search before deleting.)

## Data flow

`getItemBySlug(slug)` → `{ item, craftedBy, usedIn }`; `classifyTrades(slug, craftedBy, usedIn)`
→ `{ buy, sell, crafts, usedInCrafts }`. The page passes `crafts`→CraftTable, `usedInCrafts`→
UsedInTable, `buy`/`sell`→TradeTable, and `(facts, trades)`→`itemDetailRows`/`availableTabs`.
No new queries; no DB schema change.

## Testing

- **Unit (vitest):** `itemDetailRows` (omits absent rows; includes buy/sell summaries) and
  `availableTabs` (order + only-with-data) in `item-view.test.ts`.
- **e2e (Playwright + axe):** update the existing item-page tests (the page structure changes
  from headings "Crafted by"/"Used in"/"Buy"/"Sell" + "Inputs"/"Outputs" to tabs + tables):
  - `c4-dynamite`: a `Crafted by` tab and a `Buy` tab exist; the Details panel shows Category and
    a Buyable row; default tab table renders an ingredient row.
  - `pistol-ammo`: a `Sell` tab; selecting it shows three rows with a `Best` marker.
  - `sniper-rifle-silencer`: `Crafted by` + `Used in` tabs render tables.
  - **axe passes in both themes**; tabs are reachable by keyboard.
- **Full gate:** `vitest`, `tsc --noEmit`, `eslint`, `next build`, `test:e2e`.

## Out of scope

- Real item images (placeholder now; `ItemIcon` is the single swap point).
- Game stats / identifier / despawn (not stored).
- Changes to the items list, home, or navbar.

## Risks / notes

- **CSS radio tabs**: verify DaisyUI 5 `tabs`/`tab-content` with radio inputs renders the
  `aria-label` as the visible tab text and that axe is happy (role="tab"/"tabpanel"). If a
  styling issue appears, the fallback is `tabs-box`/`tabs-lift` variants — keep it CSS-only.
- The existing item-page e2e assertions WILL break by design — update them in the same change.
- Tab `name` must be unique enough per page; a fixed `"item-tabs"` is fine (one tab group per page).
