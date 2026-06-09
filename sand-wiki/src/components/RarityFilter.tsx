import Link from "next/link";
import { rarityColor, rarityTier } from "@/lib/rarity";

/** Horizontal rarity chip row shown above the items grid. Server component (plain Links).
 *  Only renders rarities present in the current result set; "All" clears the filter. */
export function RarityFilter({
  rarities, current, category, query,
}: { rarities: string[]; current?: string; category?: string; query?: string }) {
  if (rarities.length === 0) return null;
  const sorted = [...rarities].sort((a, b) => rarityTier(a) - rarityTier(b));

  const href = (rarity?: string) => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (query) p.set("q", query);
    if (rarity) p.set("rarity", rarity);
    const qs = p.toString();
    return `/items${qs ? `?${qs}` : ""}`;
  };

  const chip = (active: boolean) =>
    `flex items-center gap-1.5 rounded-field border px-3 py-1 text-sm whitespace-nowrap ${
      active ? "bg-base-300 text-base-content font-semibold border-base-300" : "border-base-300 hover:bg-base-200 text-base-content"
    }`;

  return (
    <nav aria-label="Rarity" className="flex flex-wrap gap-2 mb-3">
      <Link href={href()} aria-current={!current ? "page" : undefined} className={chip(!current)}>
        All
      </Link>
      {sorted.map((r) => (
        <Link key={r} href={href(r)} aria-current={current === r ? "page" : undefined} className={chip(current === r)}>
          <span className="size-2 rounded-full" style={{ backgroundColor: rarityColor(r) ?? "transparent" }} aria-hidden="true" />
          {r}
        </Link>
      ))}
    </nav>
  );
}
