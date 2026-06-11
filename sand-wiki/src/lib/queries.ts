import { prisma } from "./db";
import { buildItemQuery, applyItemView, type ItemFilter } from "./item-filter";
import { ammoCaliber, itemClasses, weaponCaliber } from "./ammo";
import { toRecipeCard } from "./recipes";

const recipeInclude = {
  recipe: { include: { inputs: { include: { item: true } }, outputs: { include: { item: true } } } },
} as const;

export async function listItems(filter: ItemFilter) {
  const { where, orderBy } = buildItemQuery(filter);
  const items = await prisma.item.findMany({ where, orderBy });
  return applyItemView(items, { sort: filter.sort, weaponClass: filter.weaponClass });
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

/** Distinct non-null workbench tiers among items matching the filter (ignoring any tier
 *  constraint), ascending — for the items-list tier filter. */
export async function listWorkbenchTiers(filter: ItemFilter): Promise<number[]> {
  const rest = { ...filter };
  delete rest.workbenchTier;
  const { where } = buildItemQuery(rest);
  const rows = await prisma.item.findMany({
    where: { ...where, workbenchTier: { not: null } },
    distinct: ["workbenchTier"],
    select: { workbenchTier: true },
    orderBy: { workbenchTier: "asc" },
  });
  return rows.map((r) => r.workbenchTier).filter((t): t is number => t !== null);
}

/** Distinct caliber-class labels (Pistol, Rifle, …) among items matching the filter,
 *  in canonical order — for the items-list class filter. Class is derived (not a stored
 *  column), so this fetches the matching rows and reduces them via itemClasses rather than
 *  using a DB `distinct`. No field needs excluding: weaponClass is app-level and never part
 *  of buildItemQuery's where clause. */
export async function listItemClasses(filter: ItemFilter): Promise<string[]> {
  const { where } = buildItemQuery(filter);
  const rows = await prisma.item.findMany({
    where,
    select: { slug: true, name: true, ammoName: true },
  });
  return itemClasses(rows);
}

/** Environment entities (loot containers, etc.), optionally filtered by category. */
export async function listEnvEntities(category?: string) {
  return prisma.envEntity.findMany({
    where: category ? { category } : {},
    orderBy: { name: "asc" },
  });
}

export async function getEnvEntityBySlug(slug: string) {
  return prisma.envEntity.findUnique({
    where: { slug },
    include: {
      lootTiers: {
        orderBy: { sortOrder: "asc" },
        include: {
          entries: {
            orderBy: { sortOrder: "asc" },
            include: { item: { select: { slug: true, icon: true } } },
          },
        },
      },
    },
  });
}

/** Count of env entities per category — for the Environment landing. */
export async function envCategoryCounts(): Promise<Record<string, number>> {
  const rows = await prisma.envEntity.groupBy({ by: ["category"], _count: true });
  return Object.fromEntries(rows.map((r) => [r.category, r._count]));
}

/** Trampler parts, optionally filtered by functional category. */
export async function listTramplerParts(category?: string) {
  return prisma.tramplerPart.findMany({
    where: category ? { category } : {},
    orderBy: [{ researchTier: "asc" }, { name: "asc" }],
  });
}

export async function getTramplerPartBySlug(slug: string) {
  return prisma.tramplerPart.findUnique({
    where: { slug },
    include: {
      costEntries: {
        orderBy: { sortOrder: "asc" },
        include: { item: { select: { slug: true, icon: true } } },
      },
    },
  });
}

/** Count of trampler parts per category — for the Tramplers landing. */
export async function tramplerCategoryCounts(): Promise<Record<string, number>> {
  const rows = await prisma.tramplerPart.groupBy({ by: ["category"], _count: true });
  return Object.fromEntries(rows.map((r) => [r.category, r._count]));
}

export interface CrateDrop { crateSlug: string; crateName: string; tier: string }

/** Crates (with tier) whose loot tables contain the given item slug. */
export async function getCratesContaining(itemSlug: string): Promise<CrateDrop[]> {
  const rows = await prisma.lootEntry.findMany({
    where: { item: { slug: itemSlug }, lootTier: { envEntity: { category: "loot-containers" } } },
    include: { lootTier: { include: { envEntity: { select: { slug: true, name: true } } } } },
    orderBy: [{ lootTier: { envEntity: { name: "asc" } } }, { lootTier: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  return rows.map((r) => {
    const t = r.lootTier;
    return { crateSlug: t.envEntity.slug, crateName: t.envEntity.name, tier: t.tier };
  });
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

/** {slug,name,icon,rarity} rows for ItemLinkList. */
type LinkItem = { slug: string; name: string; icon: string | null; rarity: string | null };

/** Ammo items whose caliber family matches `caliber` (all interchangeable variants). */
export async function getAmmoByCaliber(caliber: string): Promise<LinkItem[]> {
  const rows = await prisma.item.findMany({
    where: { category: "ammo" },
    select: { slug: true, name: true, icon: true, rarity: true },
    orderBy: { name: "asc" },
  });
  return rows.filter((r) => ammoCaliber(r.name) === caliber);
}

/** Weapons/artillery that fire the given caliber family. */
export async function getWeaponsByCaliber(caliber: string): Promise<LinkItem[]> {
  const rows = await prisma.item.findMany({
    where: { category: { in: ["weapons", "artillery"] } },
    select: { slug: true, name: true, icon: true, rarity: true, ammoName: true },
    orderBy: { name: "asc" },
  });
  return rows
    .filter((r) => weaponCaliber(r.slug, r.ammoName) === caliber)
    .map(({ slug, name, icon, rarity }) => ({ slug, name, icon, rarity }));
}
