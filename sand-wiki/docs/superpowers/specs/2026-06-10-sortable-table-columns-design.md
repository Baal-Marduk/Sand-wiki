# Sortable table columns — design

TODO #7: add alphanumeric ordering on table columns.

## Goal

Let users click a column header to sort the rows of the wiki's data tables, with a
visible direction indicator. Three tables are in scope, all on item detail pages:

- **CraftTable** — Ingredients / Time / Workbench
- **UsedInTable** — Produces / Ingredients / Workbench
- **CrateDropList** — Crate / Tiers

Out of scope: `ItemDetailsPanel` (headerless key/value table) and `LootTable` (icon
grid, not a real table).

## Approach

Server-rendered cells + a generic client sorter. The three table components stay
server components so their cells (`IngredientList`, `WorkbenchBadge`, `Link`) keep
rendering server-side — no need to make those client-safe. Each table hands a generic
`<SortableTable>` client component two serializable things per row: the pre-rendered
cells (`ReactNode[]`, valid across the RSC boundary) and a parallel array of sort keys.
The client component owns only sort state and row reordering; it never re-renders cell
contents.

Behavior: client-side toggle, click cycle **asc → desc → default** (default = original
order). Clicking a different column starts at asc.

## Components

### `src/lib/table-sort.ts` (pure, unit-tested)

```
type SortKey = string | number | null;
type Dir = "asc" | "desc" | "default";

sortRows<T extends { keys: SortKey[] }>(rows: T[], colIndex: number, dir: Dir): T[]
```

- Returns a reordered **copy** (does not mutate input).
- Natural alphanumeric collation via
  `new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })`, so
  "Item 2" sorts before "Item 10".
- Numbers compared numerically; mixed string/number keys fall back to string compare.
- `null`/`undefined` keys always sort last, regardless of direction.
- Stable: ties and `dir: "default"` preserve the original input order (sort carries the
  original index and breaks ties by it).

### `src/components/SortableTable.tsx` (`"use client"`)

Props:

```
columns: { label: string; alignRight?: boolean }[]
rows: { keys: SortKey[]; cells: ReactNode[] }[]
```

- State: `{ col: number; dir: "asc" | "desc" } | null` (null = original order).
- Header click cycle: asc → desc → null (default). A different column resets to asc.
- Each `<th>` is a real `<button>` with:
  - `aria-sort`: `"ascending"` | `"descending"` | `"none"`.
  - A trailing ▲ / ▼ / (none) indicator.
- Keeps `className="table"` so DaisyUI styling is unchanged. `alignRight` adds the
  existing right-align cell class where used.
- Renders `<tbody>` from `sortRows(rows, col, dir)`.

### Table wrappers (CraftTable / UsedInTable / CrateDropList)

Become thin server components that build `columns` + `rows` and delegate to
`SortableTable`. Cells are produced with the existing cell components.

Sort keys:

| Table | Column | Key |
|-------|--------|-----|
| CraftTable | Ingredients | input item names, joined (lowercased) |
| CraftTable | Time | `craftTimeSeconds` (number, null last) |
| CraftTable | Workbench | `"{workbench}·T{tier}"`, null when no workbench |
| UsedInTable | Produces | output item names, joined |
| UsedInTable | Ingredients | input item names, joined |
| UsedInTable | Workbench | same as CraftTable |
| CrateDropList | Crate | crate name |
| CrateDropList | Tiers | joined tier string |

All columns are sortable.

## Testing

- **Vitest** on `table-sort.ts` — the real logic: natural-alpha ordering, numeric
  ordering, nulls-last, asc/desc, and default-restore (original order). This is the
  primary coverage.
- **Playwright** — one focused assertion on a rendered table: a header click reorders
  rows and flips `aria-sort`. The existing `npm run test:e2e` axe gate continues to
  cover a11y; real `<button>` headers + `aria-sort` keep it passing.

## Trade-offs / notes

- Cells-as-`ReactNode` means the client can only reorder, not recompute cell content —
  acceptable, since sorting only reorders rows.
- Tables with ≤1 row still render clickable headers (harmless no-op). Kept simple rather
  than conditionally disabling the affordance.
