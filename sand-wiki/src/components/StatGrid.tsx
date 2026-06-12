import type { StatCell } from "@/lib/item-view";

/** Prominent grid of label/value stat cells. Renders nothing when empty. */
export function StatGrid({ cells }: { cells: StatCell[] }) {
  if (cells.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-base-300 rounded-box overflow-hidden">
      {cells.map((c) => (
        <div key={c.label} className="bg-base-200 px-3 py-2">
          <dt className="text-[0.65rem] uppercase tracking-wide text-base-content/60">{c.label}</dt>
          <dd className="font-medium">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}
