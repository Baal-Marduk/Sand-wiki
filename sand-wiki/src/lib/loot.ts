/** A loaded loot entry's link refs (from the env-page query include). */
export interface LootEntryRef {
  name: string;
  item: { slug: string; icon: string | null; rarity: string | null } | null;
  container: { slug: string; icon: string | null } | null;
}

/** Display-ready loot entry: name + icon + rarity (for sort/tint) + link target. */
export interface LootEntryView {
  name: string;
  icon: string | null;
  rarity: string | null;
  href: string | null;
}

/** Project a loot entry to its display view. An entry links to an item, else a
 *  container, else nothing; item wins if both are set. `name` is the label. */
export function lootEntryView(e: LootEntryRef): LootEntryView {
  if (e.item) return { name: e.name, icon: e.item.icon, rarity: e.item.rarity, href: `/items/${e.item.slug}` };
  if (e.container) return { name: e.name, icon: e.container.icon, rarity: null, href: `/environment/${e.container.slug}` };
  return { name: e.name, icon: null, rarity: null, href: null };
}
