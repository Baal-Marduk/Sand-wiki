import Link from "next/link";
import type { CrateDrop } from "@/lib/queries";

/** Reverse loot view on an item page: which crates drop this item (grouped, with tiers). */
export function CrateDropList({ drops }: { drops: CrateDrop[] }) {
  const byCrate = new Map<string, { name: string; tiers: string[] }>();
  for (const d of drops) {
    const e = byCrate.get(d.crateSlug) ?? { name: d.crateName, tiers: [] };
    if (!e.tiers.includes(d.tier)) e.tiers.push(d.tier);
    byCrate.set(d.crateSlug, e);
  }
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>Crate</th><th>Tiers</th></tr></thead>
        <tbody>
          {[...byCrate.entries()].map(([slug, c]) => (
            <tr key={slug}>
              <td><Link href={`/environment/${slug}`} className="link">{c.name}</Link></td>
              <td className="whitespace-nowrap">{c.tiers.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
