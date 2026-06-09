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

export async function listResources() {
  return prisma.item.findMany({ where: { isResource: true }, orderBy: { name: "asc" } });
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
