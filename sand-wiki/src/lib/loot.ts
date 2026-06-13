import { entityHref, type LinkRow } from "./entity-links";

/** Display-ready loot entry: name + icon + rarity (for sort/tint) + link target. */
export interface LootEntryView {
  name: string;
  icon: string | null;
  rarity: string | null;
  href: string | null;
}

/** Project a flattened EntityLink row to its display view. Links to the resolved
 *  target entity's page (item → /items, environment → /environment, trampler-part
 *  → /tramplers) when a target slug is set; name-only rows have no link/icon. */
export function lootEntryView(e: LinkRow): LootEntryView {
  const href = e.targetSlug ? entityHref(e.targetKind, e.targetSlug) : null;
  return { name: e.name, icon: e.icon, rarity: e.rarity, href };
}
