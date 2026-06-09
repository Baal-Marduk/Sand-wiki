import type { Prisma } from "@prisma/client";

export interface ItemFilter {
  query?: string;
  category?: string;
  workbenchLevel?: number;
  requiredResourceId?: string;
  sort?: "name" | "workbench";
}

export interface ItemQuery {
  where: Prisma.ItemWhereInput;
  orderBy: Prisma.ItemOrderByWithRelationInput;
}

export function buildItemQuery(filter: ItemFilter): ItemQuery {
  const where: Prisma.ItemWhereInput = {};

  if (filter.query) {
    where.name = { contains: filter.query, mode: "insensitive" };
  }
  if (filter.category) {
    where.category = filter.category;
  }
  if (filter.workbenchLevel !== undefined) {
    where.workbenchLevel = filter.workbenchLevel;
  }
  if (filter.requiredResourceId) {
    where.recipe = { some: { ingredientId: filter.requiredResourceId } };
  }

  const orderBy: Prisma.ItemOrderByWithRelationInput =
    filter.sort === "workbench" ? { workbenchLevel: "asc" } : { name: "asc" };

  return { where, orderBy };
}
