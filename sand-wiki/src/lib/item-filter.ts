import type { Prisma } from "@prisma/client";

export interface ItemFilter {
  query?: string;
  category?: string;
  workbenchTier?: number;
  rarity?: string;
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
