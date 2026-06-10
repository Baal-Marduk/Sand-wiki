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
