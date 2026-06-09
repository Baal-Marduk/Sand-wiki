import type { Prisma } from "@prisma/client";

export interface ItemFilter {
  query?: string;
  category?: string;
  workbenchTier?: number;
  sort?: "name" | "workbench";
}

export interface ItemQuery {
  where: Prisma.ItemWhereInput;
  orderBy: Prisma.ItemOrderByWithRelationInput;
}

export function buildItemQuery(filter: ItemFilter): ItemQuery {
  const where: Prisma.ItemWhereInput = {};
  if (filter.query) where.name = { contains: filter.query, mode: "insensitive" };
  if (filter.category) where.category = filter.category;
  if (filter.workbenchTier !== undefined) where.workbenchTier = filter.workbenchTier;

  const orderBy: Prisma.ItemOrderByWithRelationInput =
    filter.sort === "workbench" ? { workbenchTier: "asc" } : { name: "asc" };
  return { where, orderBy };
}
