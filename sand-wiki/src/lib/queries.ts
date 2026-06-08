import { prisma } from "./db";
import { buildItemQuery, type ItemFilter } from "./item-filter";
import type { TechGraph } from "./tech-tree";

export async function listItems(filter: ItemFilter) {
  const { where, orderBy } = buildItemQuery(filter);
  return prisma.item.findMany({ where, orderBy });
}

export async function listItemTypes() {
  const rows = await prisma.item.findMany({
    distinct: ["type"], select: { type: true }, orderBy: { type: "asc" },
  });
  return rows.map((r) => r.type);
}

export async function listResources() {
  return prisma.item.findMany({ where: { isResource: true }, orderBy: { name: "asc" } });
}

export async function getItemBySlug(slug: string) {
  return prisma.item.findUnique({
    where: { slug },
    include: {
      recipe: { include: { ingredient: true } },
      usedIn: { include: { item: true } },
      unlockedBy: true,
    },
  });
}

export async function loadTechGraph(): Promise<TechGraph> {
  const nodes = await prisma.techNode.findMany({
    include: { costs: true, prerequisites: true },
  });
  return new Map(
    nodes.map((n) => [
      n.id,
      {
        id: n.id,
        costs: n.costs.map((c) => ({ resourceId: c.resourceId, quantity: c.quantity })),
        prerequisiteIds: n.prerequisites.map((p) => p.prerequisiteId),
      },
    ]),
  );
}

export async function listTechNodes() {
  return prisma.techNode.findMany({ orderBy: { name: "asc" } });
}

export async function resourceNamesById(): Promise<Map<string, string>> {
  const resources = await prisma.item.findMany({ where: { isResource: true } });
  return new Map(resources.map((r) => [r.id, r.name]));
}
