import type { Entity } from "@sandlabs/data";
import type { SekItem } from "./sek";
import { mapRarity } from "./rarity";

/** Datamine-owned fields to refresh over a matched baseline item. Only includes a field
 *  when the datamine actually provides a value, so the merge keeps the baseline otherwise. */
export type ItemPatch = Partial<Pick<Entity, "rarity" | "icon" | "description">>;

export function sekItemPatch(it: SekItem): ItemPatch {
  const p: ItemPatch = {};
  const rarity = mapRarity(it.rarity);
  if (rarity !== null) p.rarity = rarity;
  if (it.icon) p.icon = it.icon;
  if (it.desc) p.description = it.desc;
  return p;
}

/** A brand-new item Entity for a SEK item with no baseline match. category defaults to
 *  "misc" (refined by overrides or a later type->category mapping); stats null (merge/refresh
 *  fills them when available). id mirrors the slug (DB ids are gone; slug is the key). */
export function newItemEntity(slug: string, it: SekItem): Entity {
  return {
    id: slug, slug, kind: "item", name: it.name,
    description: it.desc, category: "misc", rarity: mapRarity(it.rarity),
    icon: it.icon, imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
    itemStats: null, tramplerStats: null, techNodeStats: null,
  };
}
