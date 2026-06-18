import type { StatCell } from "@/lib/item-view";

/** Prominent bordered grid of label/value stat cells (rustlabs density).
 *  Renders nothing when empty. Values use the mono, tabular-nums data face. */
export function StatGrid({ cells }: { cells: StatCell[] }) {
  if (cells.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col gap-0.5 bg-card px-4 py-3.5">
          <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            {c.label}
          </dt>
          <dd className="font-mono text-[22px] font-semibold leading-none text-foreground tabular-nums">
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
