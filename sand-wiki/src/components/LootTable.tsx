import { ItemIconLink } from "@/components/ItemIconLink";
import type { LootEntryView } from "@/lib/loot";

/** One tier's loot, as an icon grid (icon + name tooltip, linked to the item or
 *  container when matched). Amounts are intentionally not shown. */
export function LootTable({ entries }: { entries: LootEntryView[] }) {
  if (entries.length === 0) return <p className="text-muted-foreground">—</p>;
  return (
    <div className="flex flex-wrap gap-3">
      {entries.map((e, i) => (
        <ItemIconLink key={`${e.href ?? e.name}-${i}`} href={e.href ?? undefined} name={e.name} icon={e.icon} rarity={e.rarity} />
      ))}
    </div>
  );
}
