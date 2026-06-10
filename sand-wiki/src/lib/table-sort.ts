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
      const cmp =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : collator.compare(String(a), String(b));
      if (cmp === 0) return x.i - y.i; // stable
      return dir === "asc" ? cmp : -cmp;
    });
  }
  return indexed.map((x) => x.row);
}
