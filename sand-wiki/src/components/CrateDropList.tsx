import Link from "next/link";
import type { CrateDrop } from "@/lib/queries";

/** Reverse loot view on an item page: which crates (and tiers) drop this item. */
export function CrateDropList({ drops }: { drops: CrateDrop[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr><th>Crate</th><th>Tier</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {drops.map((d, i) => (
            <tr key={`${d.crateSlug}-${d.tier}-${i}`}>
              <td><Link href={`/environment/${d.crateSlug}`} className="link">{d.crateName}</Link></td>
              <td className="whitespace-nowrap">{d.tier}</td>
              <td className="whitespace-nowrap">{d.values.join(" / ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
