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
