import { rarityTier } from "./rarity";
import { caliberLabel } from "./ammo";

export interface ItemFilter {
  query?: string;
  category?: string;
  workbenchTier?: number;
  rarity?: string;
  sort?: "rarity" | "name";
  weaponClass?: string;
}

// ViewItem reads ammoType (the stored weapon↔ammo match key), which lives on the
// ItemStats extension. listItems flattens itemStats onto each row before calling
// applyItemView, so the field is read here as a plain top-level `ammoType`.
type ViewItem = { slug: string; name: string; rarity: string | null; ammoType: string | null };

/** App-level view transform applied after the DB query: optional weapon-class filter, then
 *  rarity-tier ascending sort (Common→Experimental) with the DB's name-asc order as a stable
 *  tiebreaker. sort:'name' passes the DB order through unchanged. */
export function applyItemView<T extends ViewItem>(
  items: T[],
  opts: Pick<ItemFilter, "sort" | "weaponClass">,
): T[] {
  let out = items;
  if (opts.weaponClass) {
    out = out.filter((i) => caliberLabel(i.ammoType) === opts.weaponClass);
  }
  if (opts.sort !== "name") {
    out = [...out].sort((a, b) => rarityTier(a.rarity) - rarityTier(b.rarity));
  }
  return out;
}
