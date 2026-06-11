import { ItemIconLink } from "@/components/ItemIconLink";

export interface LootEntryView { slug: string | null; name: string; icon: string | null }

/** One tier's loot, as an icon grid (icon + name tooltip, linked to the item when matched).
 *  Amounts are intentionally not shown. */
export function LootTable({ entries }: { entries: LootEntryView[] }) {
  if (entries.length === 0) return <p className="text-base-content/50">—</p>;
  return (
    <div className="flex flex-wrap gap-3">
      {entries.map((e, i) => (
        <ItemIconLink key={`${e.slug ?? e.name}-${i}`} slug={e.slug ?? undefined} name={e.name} icon={e.icon} />
      ))}
    </div>
  );
}
