import { prisma } from "./db";
import { buildItemQuery, type ItemFilter } from "./item-filter";
import { toRecipeCard } from "./recipes";
import { CURRENCY_SLUG } from "./trades";

const recipeInclude = {
  recipe: { include: { inputs: { include: { item: true } }, outputs: { include: { item: true } } } },
} as const;

export async function listItems(filter: ItemFilter) {
  const { where, orderBy } = buildItemQuery(filter);
  return prisma.item.findMany({ where, orderBy });
}

/** Distinct rarities present among items matching the filter (ignoring any rarity
 *  constraint), so the rarity chip row reflects the current category/search context. */
export async function listRarities(filter: ItemFilter): Promise<string[]> {
  const rest = { ...filter };
  delete rest.rarity;
  const { where } = buildItemQuery(rest);
  const rows = await prisma.item.findMany({
    where: { ...where, rarity: { not: null } },
    distinct: ["rarity"],
    select: { rarity: true },
  });
  return rows.map((r) => r.rarity).filter((r): r is string => r !== null);
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

/**
 * Item slugs that can be bought (produced by a recipe whose input includes Coin Crown)
 * or sold (consumed by a recipe whose output includes Coin Crown). One pair of queries
 * for the whole list — used to mark grid cards.
 */
export async function getTradeFlags(): Promise<{ buyable: Set<string>; sellable: Set<string> }> {
  const [buys, sells] = await Promise.all([
    prisma.recipe.findMany({
      where: { inputs: { some: { item: { slug: CURRENCY_SLUG } } } },
      select: { outputs: { select: { item: { select: { slug: true } } } } },
    }),
    prisma.recipe.findMany({
      where: { outputs: { some: { item: { slug: CURRENCY_SLUG } } } },
      select: { inputs: { select: { item: { select: { slug: true } } } } },
    }),
  ]);

  const buyable = new Set<string>();
  for (const r of buys) for (const o of r.outputs) if (o.item.slug !== CURRENCY_SLUG) buyable.add(o.item.slug);

  const sellable = new Set<string>();
  for (const r of sells) for (const i of r.inputs) if (i.item.slug !== CURRENCY_SLUG) sellable.add(i.item.slug);

  return { buyable, sellable };
}

/** Environment entities (loot containers, etc.), optionally filtered by category. */
export async function listEnvEntities(category?: string) {
  return prisma.envEntity.findMany({
    where: category ? { category } : {},
    orderBy: { name: "asc" },
  });
}

export async function getEnvEntityBySlug(slug: string) {
  return prisma.envEntity.findUnique({ where: { slug } });
}

/** Count of env entities per category — for the Environment landing. */
export async function envCategoryCounts(): Promise<Record<string, number>> {
  const rows = await prisma.envEntity.groupBy({ by: ["category"], _count: true });
  return Object.fromEntries(rows.map((r) => [r.category, r._count]));
}

export interface CrateDrop { crateSlug: string; crateName: string; tier: string; columns: string[]; values: string[] }

interface LootShape { tiers?: { tier: string; columns: string[]; entries: { slug?: string; values: string[] }[] }[] }

/** Crates (with tier + amounts) whose loot tables contain the given item slug. */
export async function getCratesContaining(itemSlug: string): Promise<CrateDrop[]> {
  const crates = await prisma.envEntity.findMany({
    where: { category: "loot-containers" },
    select: { slug: true, name: true, loot: true },
  });
  const drops: CrateDrop[] = [];
  for (const c of crates) {
    const tiers = (c.loot as LootShape | null)?.tiers ?? [];
    for (const t of tiers) {
      for (const e of t.entries) {
        if (e.slug === itemSlug) {
          drops.push({ crateSlug: c.slug, crateName: c.name, tier: t.tier, columns: t.columns, values: e.values });
        }
      }
    }
  }
  return drops;
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
