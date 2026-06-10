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

  const dirSuffix = (col: number): string => {
    if (!sort || sort.col !== col) return "";
    return sort.dir === "asc" ? ", sorted ascending" : ", sorted descending";
  };

  return (
    <table className="table">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((c, col) => (
            <th key={c.label} aria-sort={ariaSort(col)} className={c.alignRight ? "text-right" : undefined}>
              <button
                type="button"
                aria-label={`${c.label}${dirSuffix(col)}, activate to sort`}
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
