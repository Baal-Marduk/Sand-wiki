import { prisma } from "./db";
import { buildItemQuery, type ItemFilter } from "./item-filter";
import { toRecipeCard } from "./recipes";

const recipeInclude = {
  recipe: { include: { inputs: { include: { item: true } }, outputs: { include: { item: true } } } },
} as const;

export async function listItems(filter: ItemFilter) {
  const { where, orderBy } = buildItemQuery(filter);
  return prisma.item.findMany({ where, orderBy });
}

/** Distinct non-null workbench tiers across items, ascending — for the items-list tier filter. */
export async function listWorkbenchTiers(): Promise<number[]> {
  const rows = await prisma.item.findMany({
    where: { workbenchTier: { not: null } },
    distinct: ["workbenchTier"],
    select: { workbenchTier: true },
    orderBy: { workbenchTier: "asc" },
  });
  return rows.map((r) => r.workbenchTier).filter((t): t is number => t !== null);
}

export async function getItemBySlug(slug: string) {
  const item = await prisma.item.findUnique({
    where: { slug },
    include: { producedBy: { include: recipeInclude }, usedIn: { include: recipeInclude } },
  });
  if (!item) return null;
  const craftedBy = item.producedBy.map((o) => toRecipeCard(o.recipe));
  const usedIn = item.usedIn.map((i) => toRecipeCard(i.recipe));
  return { ...item, craftedBy, usedIn };
}
