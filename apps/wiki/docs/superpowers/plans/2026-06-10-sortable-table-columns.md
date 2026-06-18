# Sortable Table Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click a column header on the wiki's three data tables (CraftTable, UsedInTable, CrateDropList) to sort rows alphanumerically, cycling asc → desc → default, with an ARIA-correct direction indicator.

**Architecture:** A pure sort helper (`table-sort.ts`) holds the comparison logic and is unit-tested. A generic `"use client"` `SortableTable` component owns sort state and row reordering. The three existing table components stay server components — they pre-render each cell to `ReactNode` and compute serializable sort keys, then delegate rendering to `SortableTable`. Cells cross the RSC boundary as `ReactNode[]`; the client only reorders, never recomputes, them.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Vitest (unit), Playwright + axe (e2e), DaisyUI `table` class.

---

## File Structure

- **Create** `src/lib/table-sort.ts` — pure `sortRows` + types. One responsibility: ordering.
- **Create** `src/lib/table-sort.test.ts` — Vitest coverage for the helper.
- **Create** `src/components/SortableTable.tsx` — generic client table that manages sort state and renders thead/tbody.
- **Modify** `src/components/CraftTable.tsx` — build columns+rows, delegate to `SortableTable`.
- **Modify** `src/components/UsedInTable.tsx` — same.
- **Modify** `src/components/CrateDropList.tsx` — same.
- **Modify** `tests/e2e/wiki.spec.ts` — add a sort-interaction test.

The page (`src/app/items/[slug]/page.tsx`) is **unchanged**: it already passes the table components' server-rendered output as `ReactNode` into the client `ItemTabs`, so the same pattern carries `SortableTable` through.

---

## Task 1: Sort helper + unit tests

**Files:**
- Create: `src/lib/table-sort.ts`
- Test: `src/lib/table-sort.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/table-sort.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sortRows, type SortableRow } from "./table-sort";

const mk = (...keys: (string | number | null)[]): SortableRow => ({ keys });

describe("sortRows", () => {
  it("sorts strings with natural (numeric-aware) collation, ascending", () => {
    const rows = [mk("Item 10"), mk("Item 2"), mk("Item 1")];
    expect(sortRows(rows, 0, "asc").map((r) => r.keys[0])).toEqual(["Item 1", "Item 2", "Item 10"]);
  });

  it("sorts numbers numerically and descending reverses them", () => {
    const rows = [mk(10), mk(2), mk(30)];
    expect(sortRows(rows, 0, "desc").map((r) => r.keys[0])).toEqual([30, 10, 2]);
  });

  it("keeps null keys last in BOTH directions", () => {
    const rows = [mk(null), mk(2), mk(10)];
    expect(sortRows(rows, 0, "asc").map((r) => r.keys[0])).toEqual([2, 10, null]);
    expect(sortRows(rows, 0, "desc").map((r) => r.keys[0])).toEqual([10, 2, null]);
  });

  it("default direction restores original row order", () => {
    const rows = [mk("b"), mk("a"), mk("c")];
    expect(sortRows(rows, 0, "default").map((r) => r.keys[0])).toEqual(["b", "a", "c"]);
  });

  it("is stable: equal keys preserve original order", () => {
    const rows = [{ keys: ["x"], id: 1 }, { keys: ["x"], id: 2 }, { keys: ["x"], id: 3 }];
    expect(sortRows(rows, 0, "asc").map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("returns a new array and does not mutate the input", () => {
    const rows = [mk(2), mk(1)];
    const out = sortRows(rows, 0, "asc");
    expect(out).not.toBe(rows);
    expect(rows.map((r) => r.keys[0])).toEqual([2, 1]);
  });

  it("sorts a non-zero column index", () => {
    const rows = [mk("a", 3), mk("b", 1), mk("c", 2)];
    expect(sortRows(rows, 1, "asc").map((r) => r.keys[1])).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/table-sort.test.ts`
Expected: FAIL — `Cannot find module './table-sort'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/table-sort.ts`:

```ts
/** Row sorting for the wiki's data tables. A row carries one sort key per column
 *  (string, number, or null). Pure and framework-free so it can be unit-tested. */

export type SortKey = string | number | null;
export type SortDir = "asc" | "desc" | "default";

export interface SortableRow {
  keys: SortKey[];
}

// Natural ordering: "Item 2" before "Item 10", case-insensitive.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Reorders a copy of `rows` by the key at `colIndex`. Null keys always sort last
 *  (in both directions); ties and `dir: "default"` preserve original input order. */
export function sortRows<T extends SortableRow>(rows: T[], colIndex: number, dir: SortDir): T[] {
  const indexed = rows.map((row, i) => ({ row, i }));
  if (dir !== "default") {
    indexed.sort((x, y) => {
      const a = x.row.keys[colIndex];
      const b = y.row.keys[colIndex];
      const aNull = a === null || a === undefined;
      const bNull = b === null || b === undefined;
      if (aNull || bNull) {
        if (aNull && bNull) return x.i - y.i;
        return aNull ? 1 : -1; // nulls last, regardless of dir
      }
      let cmp =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : collator.compare(String(a), String(b));
      if (cmp === 0) return x.i - y.i; // stable
      return dir === "asc" ? cmp : -cmp;
    });
  }
  return indexed.map((x) => x.row);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/table-sort.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/table-sort.ts src/lib/table-sort.test.ts
git commit -m "feat(wiki): add natural-order table sort helper"
```

---

## Task 2: Generic `SortableTable` client component

**Files:**
- Create: `src/components/SortableTable.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/SortableTable.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { sortRows, type SortKey, type SortDir } from "@/lib/table-sort";

export interface SortColumn {
  label: string;
  alignRight?: boolean;
}

export interface SortableTableRow {
  /** One sort key per column, index-aligned with `columns`. */
  keys: SortKey[];
  /** Pre-rendered cells, index-aligned with `columns`. */
  cells: ReactNode[];
}

interface SortState {
  col: number;
  dir: Exclude<SortDir, "default">;
}

const ARROW: Record<Exclude<SortDir, "default">, string> = { asc: "▲", desc: "▼" };

/** A `<table>` whose column headers toggle row order. Click cycle on a header:
 *  asc → desc → default (original order). A different column resets to asc. The
 *  component only reorders rows; cell contents are rendered upstream (server-side). */
export function SortableTable({
  columns,
  rows,
  caption,
}: {
  columns: SortColumn[];
  rows: SortableTableRow[];
  caption?: string;
}) {
  const [sort, setSort] = useState<SortState | null>(null);

  const ordered = sort ? sortRows(rows, sort.col, sort.dir) : rows;

  const onHeaderClick = (col: number) => {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return null; // desc → default
    });
  };

  const ariaSort = (col: number): "ascending" | "descending" | "none" =>
    sort && sort.col === col ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <table className="table">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((c, col) => (
            <th key={c.label} aria-sort={ariaSort(col)} className={c.alignRight ? "text-right" : undefined}>
              <button
                type="button"
                className="inline-flex items-center gap-1 cursor-pointer hover:text-base-content"
                onClick={() => onHeaderClick(col)}
              >
                {c.label}
                <span aria-hidden="true" className="text-xs opacity-70">
                  {sort && sort.col === col ? ARROW[sort.dir] : ""}
                </span>
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ordered.map((r, i) => (
          <tr key={i}>
            {r.cells.map((cell, col) => (
              <td key={col} className={columns[col]?.alignRight ? "text-right" : undefined}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run lint`
Expected: no errors for `src/components/SortableTable.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/SortableTable.tsx
git commit -m "feat(wiki): add generic SortableTable client component"
```

---

## Task 3: Make CraftTable sortable

**Files:**
- Modify: `src/components/CraftTable.tsx`

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `src/components/CraftTable.tsx` with:

```tsx
import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow } from "@/components/SortableTable";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function CraftTable({ recipes }: { recipes: RecipeCard[] }) {
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.inputs), r.craftTimeSeconds, workbenchKey(r)],
    cells: [
      <IngredientList key="i" rows={r.inputs} />,
      r.craftTimeSeconds !== null ? `${r.craftTimeSeconds} sec` : "—",
      <WorkbenchBadge key="w" recipe={r} />,
    ],
  }));
  return (
    <SortableTable
      caption="Recipes that craft this item"
      columns={[{ label: "Ingredients" }, { label: "Time" }, { label: "Workbench" }]}
      rows={rows}
    />
  );
}
```

- [ ] **Step 2: Verify it typechecks and builds**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CraftTable.tsx
git commit -m "feat(wiki): sortable columns on CraftTable"
```

---

## Task 4: Make UsedInTable sortable

**Files:**
- Modify: `src/components/UsedInTable.tsx`

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `src/components/UsedInTable.tsx` with:

```tsx
import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow } from "@/components/SortableTable";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function UsedInTable({ recipes }: { recipes: RecipeCard[] }) {
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.outputs), names(r.inputs), workbenchKey(r)],
    cells: [
      <IngredientList key="o" rows={r.outputs} />,
      <IngredientList key="i" rows={r.inputs} />,
      <WorkbenchBadge key="w" recipe={r} />,
    ],
  }));
  return (
    <SortableTable
      caption="Recipes that use this item"
      columns={[{ label: "Produces" }, { label: "Ingredients" }, { label: "Workbench" }]}
      rows={rows}
    />
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/UsedInTable.tsx
git commit -m "feat(wiki): sortable columns on UsedInTable"
```

---

## Task 5: Make CrateDropList sortable

**Files:**
- Modify: `src/components/CrateDropList.tsx`

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `src/components/CrateDropList.tsx` with:

```tsx
import Link from "next/link";
import type { CrateDrop } from "@/lib/queries";
import { SortableTable, type SortableTableRow } from "@/components/SortableTable";

/** Reverse loot view on an item page: which crates drop this item (grouped, with tiers). */
export function CrateDropList({ drops }: { drops: CrateDrop[] }) {
  const byCrate = new Map<string, { name: string; tiers: string[] }>();
  for (const d of drops) {
    const e = byCrate.get(d.crateSlug) ?? { name: d.crateName, tiers: [] };
    if (!e.tiers.includes(d.tier)) e.tiers.push(d.tier);
    byCrate.set(d.crateSlug, e);
  }

  const rows: SortableTableRow[] = [...byCrate.entries()].map(([slug, c]) => ({
    keys: [c.name.toLowerCase(), c.tiers.join(", ")],
    cells: [
      <Link key="c" href={`/environment/${slug}`} className="link">{c.name}</Link>,
      <span key="t" className="whitespace-nowrap">{c.tiers.join(", ")}</span>,
    ],
  }));

  return (
    <div className="overflow-x-auto">
      <SortableTable
        caption="Crates that drop this item"
        columns={[{ label: "Crate" }, { label: "Tiers" }]}
        rows={rows}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CrateDropList.tsx
git commit -m "feat(wiki): sortable columns on CrateDropList"
```

---

## Task 6: End-to-end sort-interaction test

**Files:**
- Modify: `tests/e2e/wiki.spec.ts`

Fixture: `/items/resource-metal-parts` (Mechanical Parts) is used in 11 recipes, so its
"Used in" tab renders an 11-row `UsedInTable` — a deterministic multi-row table.

- [ ] **Step 1: Add the test**

Append to `tests/e2e/wiki.spec.ts` (after the existing tests, before EOF):

```ts
test("clicking a table header sorts rows and toggles aria-sort", async ({ page }) => {
  await page.goto("/items/resource-metal-parts");
  // Mechanical Parts is used in many recipes — open that table.
  await page.getByRole("tab", { name: "Used in" }).click();

  const table = page.locator('table:has(caption:text("Recipes that use this item"))');
  const firstColCells = table.locator("tbody tr td:first-child");
  await expect(firstColCells.first()).toBeVisible();

  const header = table.getByRole("button", { name: "Produces" });
  const headerCell = table.locator("th", { has: header });

  await expect(headerCell).toHaveAttribute("aria-sort", "none");
  const before = await firstColCells.allInnerTexts();

  // Ascending
  await header.click();
  await expect(headerCell).toHaveAttribute("aria-sort", "ascending");
  const asc = await firstColCells.allInnerTexts();
  expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));

  // Descending
  await header.click();
  await expect(headerCell).toHaveAttribute("aria-sort", "descending");

  // Back to default (original order)
  await header.click();
  await expect(headerCell).toHaveAttribute("aria-sort", "none");
  expect(await firstColCells.allInnerTexts()).toEqual(before);
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e`
Expected: all tests PASS, including the new sort test and the existing axe a11y checks (real `<button>` headers + `aria-sort` keep axe green).

> Note: `test:e2e` runs `next build && next start` via `playwright.config.ts` and needs `DATABASE_URL` reachable (the dev Neon DB the project already uses). If the build can't reach the DB in this environment, run `npm run build` first to confirm it compiles, and report that the e2e run is DB-gated.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/wiki.spec.ts
git commit -m "test(wiki): e2e for sortable table header interaction"
```

---

## Task 7: Full verification + mark TODO done

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test`
Expected: all suites PASS (existing 90 + the 7 new table-sort tests).

- [ ] **Step 2: Lint the whole project**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Mark TODO #7 done**

In `TODO.md`, change:

```
- add alphanumeric ordering on tables columns
```

to:

```
- [x] add alphanumeric ordering on tables columns (click headers: asc → desc → default)
```

- [ ] **Step 4: Commit**

```bash
git add TODO.md
git commit -m "docs(wiki): mark TODO #7 (sortable table columns) done"
```

---

## Self-review notes

- **Spec coverage:** all three tables (Tasks 3–5), client-side asc→desc→default toggle + arrow + aria-sort (Task 2), natural alphanumeric collation & nulls-last (Task 1), Vitest logic coverage (Task 1), Playwright interaction + axe gate (Task 6). Sort-key table from the spec is implemented verbatim in Tasks 3–5.
- **Type consistency:** `sortRows` / `SortKey` / `SortDir` / `SortableRow` (Task 1) are reused by `SortableTable` (Task 2); `SortableTableRow` and `SortColumn` (Task 2) are the prop types imported by Tasks 3–5. `workbenchKey`/`names` helpers are defined identically where used (intentionally local, not shared — both files already import the same cell components; a shared util is not warranted for two one-liners).
- **No placeholders:** every code step shows complete file contents or exact append text.
