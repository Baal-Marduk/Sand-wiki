import type { Entity } from "@sandlabs/data";
import type { SekItem } from "./sek";
import { mapRarity } from "./rarity";

// SEK item `type` flag -> wiki category (drives the item's list/section). Calibrated against
// the wiki's categories (weapons/ammo/resources/medical/tools/misc/attire/artillery). Types
// without a confident mapping (and null) fall back to "misc". Only used for NEW items —
// matched items keep their baseline category.
const TYPE_CATEGORY: Record<string, string> = {
  WEAPON: "weapons",
  AMMO: "ammo",
  TURRET_AMMO: "ammo",
  RESOURCE_T1: "resources",
  RESOURCE_T2: "resources",
  RESOURCE_T3: "resources",
  FOOD: "medical", // the wiki files food/consumables under "medical" (e.g. food-can)
};

/** Wiki category for a SEK item type; "misc" when unknown/null. */
export function mapCategory(type: string | null): string {
  if (!type) return "misc";
  return TYPE_CATEGORY[type.toUpperCase()] ?? "misc";
}

/** Force specific entity icons (slug -> icon path). Fixes stale/wrong icon paths in the
 *  source data (SEK or baseline) by pointing at a sprite that actually exists on disk.
 *  Applied after the merge so it always wins. */
export function applyIconOverrides(entities: Entity[], iconMap: Record<string, string>): Entity[] {
  return entities.map((e) => (iconMap[e.slug] ? { ...e, icon: iconMap[e.slug] } : e));
}

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

/** A brand-new item Entity for a SEK item with no baseline match. category derives from the
 *  SEK type (mapCategory; "misc" when unknown); stats null (merge/refresh fills them when
 *  available). id mirrors the slug (DB ids are gone; slug is the key). */
export function newItemEntity(slug: string, it: SekItem): Entity {
  return {
    id: slug, slug, kind: "item", name: it.name,
    description: it.desc, category: mapCategory(it.type), rarity: mapRarity(it.rarity),
    icon: it.icon, imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
    itemStats: null, tramplerStats: null, techNodeStats: null,
  };
}
