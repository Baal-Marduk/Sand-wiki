import Link from "next/link";

/** Shape of the JSON stats blob stored on Item.stats (from the wiki enrichment). */
export interface ItemStats {
  type?: string;
  damage?: number;
  magazine?: number;
  value?: number;
  ammoSlug?: string;
  ammoName?: string;
}

/** Prominent grid of wiki-sourced gameplay stats, shown under the detail header.
 *  Renders nothing when there are no displayable stats. */
export function StatBox({ stats }: { stats: ItemStats | null | undefined }) {
  if (!stats) return null;

  const cells: { label: string; node: React.ReactNode }[] = [];
  if (stats.damage != null) cells.push({ label: "Damage", node: stats.damage });
  if (stats.magazine != null) cells.push({ label: "Magazine", node: stats.magazine });
  if (stats.type) cells.push({ label: "Type", node: stats.type });
  if (stats.ammoSlug && stats.ammoName)
    cells.push({
      label: "Ammo",
      node: <Link href={`/items/${stats.ammoSlug}`} className="link">{stats.ammoName}</Link>,
    });
  if (stats.value != null) cells.push({ label: "Value", node: `${stats.value} ◈` });

  if (cells.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-base-300 rounded-box overflow-hidden">
      {cells.map((c) => (
        <div key={c.label} className="bg-base-200 px-3 py-2">
          <dt className="text-[0.65rem] uppercase tracking-wide text-base-content/60">{c.label}</dt>
          <dd className="font-medium">{c.node}</dd>
        </div>
      ))}
    </dl>
  );
}
