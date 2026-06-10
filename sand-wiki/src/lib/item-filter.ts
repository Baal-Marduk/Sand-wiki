import type { Prisma } from "@prisma/client";
import { rarityTier } from "./rarity";
import { itemClass } from "./ammo";

export interface ItemFilter {
  query?: string;
  category?: string;
  workbenchTier?: number;
  rarity?: string;
  sort?: "rarity" | "name";
  weaponClass?: string;
}

export interface ItemQuery {
  where: Prisma.ItemWhereInput;
  orderBy: Prisma.ItemOrderByWithRelationInput;
}

export function buildItemQuery(filter: ItemFilter): ItemQuery {
  const where: Prisma.ItemWhereInput = {};
  if (filter.query)
    where.OR = [
      { name: { contains: filter.query, mode: "insensitive" } },
      { derivedName: { contains: filter.query, mode: "insensitive" } },
    ];
  if (filter.category) where.category = filter.category;
  if (filter.workbenchTier !== undefined) where.workbenchTier = filter.workbenchTier;
  if (filter.rarity) where.rarity = filter.rarity;

  return { where, orderBy: { name: "asc" } };
}

type ViewItem = { slug: string; name: string; rarity: string | null; stats: unknown };

/** App-level view transform applied after the DB query: optional weapon-class filter, then
 *  rarity-tier ascending sort (Common→Experimental) with the DB's name-asc order as a stable
 *  tiebreaker. sort:'name' passes the DB order through unchanged. */
export function applyItemView<T extends ViewItem>(
  items: T[],
  opts: Pick<ItemFilter, "sort" | "weaponClass">,
): T[] {
  let out = items;
  if (opts.weaponClass) {
    out = out.filter((i) => itemClass(i.slug, i.name, i.stats) === opts.weaponClass);
  }
  if (opts.sort !== "name") {
    out = [...out].sort((a, b) => rarityTier(a.rarity) - rarityTier(b.rarity));
  }
  return out;
}
