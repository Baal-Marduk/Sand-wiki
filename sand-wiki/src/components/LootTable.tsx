import { ItemIconLink } from "@/components/ItemIconLink";

export interface LootEntry { slug?: string; name: string; values: string[] }

/** One tier's loot, as an icon grid (icon + name tooltip, linked to the item when matched).
 *  Amounts are intentionally not shown. */
export function LootTable({ entries, icons }: { entries: LootEntry[]; icons: Record<string, string | null> }) {
  if (entries.length === 0) return <p className="text-base-content/50">—</p>;
  return (
    <div className="flex flex-wrap gap-3">
      {entries.map((e, i) => (
        <ItemIconLink key={`${e.slug ?? e.name}-${i}`} slug={e.slug} name={e.name} icon={e.slug ? icons[e.slug] : null} />
      ))}
    </div>
  );
}
