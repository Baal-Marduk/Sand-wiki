"use client";

import { useState, type ReactNode } from "react";
import { sortRows, type SortKey, type SortDir } from "@/lib/table-sort";

export interface SortColumn {
  label: string;
  alignRight?: boolean;
  /** default true; set false for action columns that never reorder */
  sortable?: boolean;
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

  const thBase =
    "border-b border-border-strong bg-card-elevated px-3 py-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground";
  return (
    <table className="w-full border-collapse text-[13px]">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((c, col) => {
            if (c.sortable === false) {
              return (
                <th key={c.label} className={`${thBase} ${c.alignRight ? "text-right" : "text-left"}`}>
                  <span className="inline-flex items-center gap-1">{c.label}</span>
                </th>
              );
            }
            return (
              <th
                key={c.label}
                aria-sort={ariaSort(col)}
                className={`${thBase} ${c.alignRight ? "text-right" : "text-left"}`}
              >
                <button
                  type="button"
                  aria-label={`${c.label}${dirSuffix(col)}, activate to sort`}
                  className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
                  onClick={() => onHeaderClick(col)}
                >
                  {c.label}
                  <span aria-hidden="true" className="text-xs opacity-70">
                    {sort && sort.col === col ? ARROW[sort.dir] : ""}
                  </span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {ordered.map((r, i) => (
          <tr key={i} className="border-b border-border transition-colors hover:bg-card-elevated">
            {r.cells.map((cell, col) => (
              <td
                key={col}
                className={`px-3 py-2.5 align-middle text-foreground ${columns[col]?.alignRight ? "text-right" : ""}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
