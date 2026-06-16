import type { Prisma } from "@prisma/client";
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

export interface ItemQuery {
  where: Prisma.EntityWhereInput;
  orderBy: Prisma.EntityOrderByWithRelationInput;
}

/** Build a `prisma.entity` query for the items catalog. The `where` is always
 *  scoped to `kind:"item"`. name/derivedName/category/rarity live on Entity;
 *  workbenchTier is a stat and is filtered through the `itemStats` relation. */
export function buildItemQuery(filter: ItemFilter): ItemQuery {
  const where: Prisma.EntityWhereInput = { kind: "item" };
  if (filter.query)
    where.OR = [
      { name: { contains: filter.query, mode: "insensitive" } },
      { derivedName: { contains: filter.query, mode: "insensitive" } },
    ];
  if (filter.category) where.category = filter.category;
  if (filter.workbenchTier !== undefined) where.itemStats = { workbenchTier: filter.workbenchTier };
  if (filter.rarity) where.rarity = filter.rarity;

  return { where, orderBy: { name: "asc" } };
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
