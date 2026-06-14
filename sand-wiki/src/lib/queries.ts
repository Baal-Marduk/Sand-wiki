import { prisma } from "./db";
import { buildItemQuery, applyItemView, type ItemFilter } from "./item-filter";
import { ammoCaliber, itemClasses, weaponCaliber } from "./ammo";
import { toRecipeCard, type RecipeWithItems, type RecipeLine } from "./recipes";
import { entityHref } from "./entity-links";
import { toTechTree, FACTION_ROOT_PART } from "./tech-tree/transform";
import type { TechTree } from "./tech-tree/types";

/** {slug,name,icon,rarity} select for entities referenced from a recipe line. */
const linkItemSelect = { select: { slug: true, name: true, icon: true, rarity: true } } as const;

const recipeInclude = {
  recipe: {
    include: {
      inputs: { include: { entity: linkItemSelect } },
      outputs: { include: { entity: linkItemSelect } },
      location: { select: { slug: true, name: true } },
    },
  },
} as const;

/** A recipe row as loaded with `entity`-relation includes (Prisma renamed the
 *  relation field from `item` to `entity`). */
type LoadedRecipe = {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  location: { slug: string; name: string } | null;
  inputs: { amount: number; entity: { slug: string; name: string; icon: string | null; rarity: string | null } }[];
  outputs: { amount: number; entity: { slug: string; name: string; icon: string | null; rarity: string | null } }[];
};

/** Adapt a recipe loaded with `entity` includes to the `RecipeWithItems` shape
 *  (`item`) that toRecipeCard consumes. */
function toRecipeWithItems(r: LoadedRecipe): RecipeWithItems {
  const line = (l: { amount: number; entity: RecipeLine["item"] }): RecipeLine => ({ amount: l.amount, item: l.entity });
  return {
    slug: r.slug,
    workbench: r.workbench,
    tier: r.tier,
    craftTimeSeconds: r.craftTimeSeconds,
    location: r.location,
    inputs: r.inputs.map(line),
    outputs: r.outputs.map(line),
  };
}

export async function listItems(filter: ItemFilter) {
  const { where, orderBy } = buildItemQuery(filter);
  const items = await prisma.entity.findMany({ where, orderBy, include: { itemStats: true } });
  // Flatten the itemStats extension onto each row so applyItemView (and item
  // cards) can read ammoName/stat fields as plain top-level fields.
  const flat = items.map((i) => ({ ...i, ammoName: i.itemStats?.ammoName ?? null }));
  return applyItemView(flat, { sort: filter.sort, weaponClass: filter.weaponClass });
}

/** Distinct rarities present among items matching the filter (ignoring any rarity
 *  constraint), so the rarity chip row reflects the current category/search context. */
export async function listRarities(filter: ItemFilter): Promise<string[]> {
  const rest = { ...filter };
  delete rest.rarity;
  const { where } = buildItemQuery(rest);
  const rows = await prisma.entity.findMany({
    where: { ...where, rarity: { not: null } },
    distinct: ["rarity"],
    select: { rarity: true },
  });
  return rows.map((r) => r.rarity).filter((r): r is string => r !== null);
}

/** Distinct non-null workbench tiers among items matching the filter (ignoring any tier
 *  constraint), ascending — for the items-list tier filter. workbenchTier lives on the
 *  ItemStats extension, so this queries itemStats scoped to the matching entities. */
export async function listWorkbenchTiers(filter: ItemFilter): Promise<number[]> {
  const rest = { ...filter };
  delete rest.workbenchTier;
  const { where } = buildItemQuery(rest);
  const rows = await prisma.itemStats.findMany({
    where: { entity: where, workbenchTier: { not: null } },
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
  const rows = await prisma.entity.findMany({
    where,
    select: { slug: true, name: true, itemStats: { select: { ammoName: true } } },
  });
  return itemClasses(rows.map((r) => ({ slug: r.slug, name: r.name, ammoName: r.itemStats?.ammoName ?? null })));
}

/** Count of items per category — for the home browse grid. Mirrors
 *  envCategoryCounts / tramplerCategoryCounts; reads the stored `category` column. */
export async function itemCategoryCounts(): Promise<Record<string, number>> {
  const rows = await prisma.entity.groupBy({ by: ["category"], where: { kind: "item" }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.category, r._count]));
}

/** Environment entities (loot containers, etc.), optionally filtered by category. */
export async function listEnvEntities(category?: string) {
  return prisma.entity.findMany({
    where: { kind: "environment", ...(category ? { category } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function getEnvEntityBySlug(slug: string) {
  const entity = await prisma.entity.findUnique({
    where: { slug },
    include: {
      outgoingLinks: {
        where: { role: "loot" },
        orderBy: { sortOrder: "asc" },
        include: { target: { select: { slug: true, kind: true, icon: true, rarity: true } } },
      },
      craftedAtRecipes: {
        orderBy: { slug: "asc" },
        include: {
          inputs: { include: { entity: linkItemSelect } },
          outputs: { include: { entity: linkItemSelect } },
        },
      },
    },
  });
  if (entity === null || entity.kind !== "environment") return null;
  // We're already on the location page, so each card's location backlink is null.
  const craftedBy = entity.craftedAtRecipes.map((r) =>
    toRecipeCard(toRecipeWithItems({ ...r, location: null })),
  );
  return { ...entity, craftedBy };
}

/** Count of env entities per category — for the Environment landing. */
export async function envCategoryCounts(): Promise<Record<string, number>> {
  const rows = await prisma.entity.groupBy({ by: ["category"], where: { kind: "environment" }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.category, r._count]));
}

/** Trampler parts, optionally filtered by functional category. List cards read
 *  dimensions/research from the tramplerStats extension, so it is included. */
export async function listTramplerParts(category?: string) {
  return prisma.entity.findMany({
    where: { kind: "trampler-part", ...(category ? { category } : {}) },
    include: { tramplerStats: true },
    // researchTier now lives on the tramplerStats extension; order through the relation
    // to preserve the original tier-then-name list ordering.
    orderBy: [{ tramplerStats: { researchTier: "asc" } }, { name: "asc" }],
  });
}

export async function getTramplerPartBySlug(slug: string) {
  const part = await prisma.entity.findUnique({
    where: { slug },
    include: {
      tramplerStats: true,
      outgoingLinks: {
        where: { role: "cost" },
        orderBy: { sortOrder: "asc" },
        include: { target: { select: { slug: true, kind: true, icon: true, rarity: true } } },
      },
    },
  });
  if (!part || part.kind !== "trampler-part") return null;
  return part;
}

/** Count of trampler parts per category — for the Tramplers landing. */
export async function tramplerCategoryCounts(): Promise<Record<string, number>> {
  const rows = await prisma.entity.groupBy({ by: ["category"], where: { kind: "trampler-part" }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.category, r._count]));
}

/** An item's incoming loot links, resolved to their source slug + name (ordered by
 *  sortOrder). Prefills the item-side ("Found in") loot editor. Null if not an item. */
export async function getIncomingLootLinks(itemSlug: string) {
  const item = await prisma.entity.findUnique({
    where: { slug: itemSlug },
    select: {
      kind: true,
      incomingLinks: {
        where: { role: "loot" },
        orderBy: { sortOrder: "asc" },
        select: {
          tier: true,
          value1: true,
          sortOrder: true,
          source: { select: { slug: true, name: true } },
        },
      },
    },
  });
  if (!item || item.kind !== "item") return null;
  return item.incomingLinks;
}

/** Env entities usable as loot sources (containers + landmarks), for the source dropdown
 *  in the item-side loot editor. */
export async function listLootSources(): Promise<{ slug: string; name: string }[]> {
  return prisma.entity.findMany({
    where: { kind: "environment", category: { in: ["loot-containers", "landmarks"] } },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

export interface CrateDrop { crateSlug: string; crateName: string; tier: string }

/** Crates and landmarks (with tier) whose loot tables contain the given item slug. */
export async function getCratesContaining(itemSlug: string): Promise<CrateDrop[]> {
  const rows = await prisma.entityLink.findMany({
    where: {
      role: "loot",
      target: { slug: itemSlug },
      source: { kind: "environment", category: { in: ["loot-containers", "landmarks"] } },
    },
    include: { source: { select: { slug: true, name: true } } },
    orderBy: [{ source: { name: "asc" } }, { sortOrder: "asc" }],
  });
  return rows.map((r) => ({ crateSlug: r.source.slug, crateName: r.source.name, tier: r.tier ?? "" }));
}

export async function getItemBySlug(slug: string) {
  const item = await prisma.entity.findUnique({
    where: { slug },
    include: {
      itemStats: true,
      producedBy: { include: recipeInclude },
      usedIn: { include: recipeInclude },
    },
  });
  if (!item || item.kind !== "item") return null;
  const craftedBy = item.producedBy.map((o) => toRecipeCard(toRecipeWithItems(o.recipe)));
  const usedIn = item.usedIn.map((i) => toRecipeCard(toRecipeWithItems(i.recipe)));
  // Stat fields stay nested under `item.itemStats`; the detail page reads them there.
  return { ...item, craftedBy, usedIn };
}

/** {slug,name,icon,rarity} rows for ItemLinkList. */
type LinkItem = { slug: string; name: string; icon: string | null; rarity: string | null };

/** Ammo items whose caliber family matches `caliber` (all interchangeable variants). */
export async function getAmmoByCaliber(caliber: string): Promise<LinkItem[]> {
  const rows = await prisma.entity.findMany({
    where: { kind: "item", category: "ammo" },
    select: { slug: true, name: true, icon: true, rarity: true },
    orderBy: { name: "asc" },
  });
  return rows.filter((r) => ammoCaliber(r.name) === caliber);
}

/** Weapons/artillery that fire the given caliber family. */
export async function getWeaponsByCaliber(caliber: string): Promise<LinkItem[]> {
  const rows = await prisma.entity.findMany({
    where: { kind: "item", category: { in: ["weapons", "artillery"] } },
    select: { slug: true, name: true, icon: true, rarity: true, itemStats: { select: { ammoName: true } } },
    orderBy: { name: "asc" },
  });
  return rows
    .filter((r) => weaponCaliber(r.slug, r.itemStats?.ammoName ?? null) === caliber)
    .map(({ slug, name, icon, rarity }) => ({ slug, name, icon, rarity }));
}

/** Resolve the entities referenced by `[[slug]]` links in a description, keyed by
 *  slug, to { name, href, rarity }. slug is globally unique on Entity now, so this is
 *  a single query (no cross-table priority logic). rarity drives the link's color
 *  tint (non-null only for items in practice). Empty input → empty map (no queries). */
export async function getLinkTargetsBySlugs(
  slugs: string[],
): Promise<Map<string, { name: string; href: string; rarity: string | null }>> {
  const result = new Map<string, { name: string; href: string; rarity: string | null }>();
  if (slugs.length === 0) return result;
  const rows = await prisma.entity.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true, kind: true, rarity: true },
  });
  for (const e of rows) {
    const href = entityHref(e.kind, e.slug);
    if (href) result.set(e.slug, { name: e.name, href, rarity: e.rarity });
  }
  return result;
}

/** Outgoing EntityLink rows for one role on one entity (by slug), target resolved
 *  to slug/name, sorted. Used by the tab editor and its submit/apply paths. */
export async function getOutgoingLinks(slug: string, role: string) {
  const entity = await prisma.entity.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      kind: true,
      outgoingLinks: {
        where: { role },
        orderBy: { sortOrder: "asc" },
        select: {
          name: true,
          amount: true,
          tier: true,
          value1: true,
          sortOrder: true,
          target: { select: { slug: true } },
        },
      },
    },
  });
  return entity;
}

/** Full tech tree: all tech-node entities with costs, unlocks and same-faction prereqs,
 *  plus each faction's free starting part. */
export async function getTechTree(): Promise<TechTree> {
  const rows = await prisma.entity.findMany({
    where: { kind: "tech-node" },
    select: {
      slug: true,
      name: true,
      techNodeStats: { select: { faction: true, tier: true, sortOrder: true } },
      outgoingLinks: {
        where: { role: { in: ["tech-prereq", "tech-unlock-cost", "tech-unlocks"] } },
        orderBy: { sortOrder: "asc" },
        select: {
          role: true, name: true, amount: true, sortOrder: true,
          target: {
            select: { slug: true, name: true, icon: true, kind: true, techNodeStats: { select: { faction: true } } },
          },
        },
      },
    },
  });

  const rootSlugs = Object.values(FACTION_ROOT_PART);
  const rootRows = await prisma.entity.findMany({
    where: { slug: { in: rootSlugs } },
    select: { slug: true, name: true, icon: true, kind: true },
  });
  const rootParts = Object.fromEntries(
    rootRows.map((r) => [r.slug, { name: r.name, icon: r.icon, kind: r.kind }]),
  );

  return toTechTree(rows, rootParts);
}

/** The tech-node slug that unlocks the given entity (by slug), or null. Entities are
 *  typically unlocked by one node; the lowest-sortOrder incoming `tech-unlocks` wins. */
export async function getUnlockingNode(entitySlug: string): Promise<{ slug: string } | null> {
  const link = await prisma.entityLink.findFirst({
    where: { role: "tech-unlocks", target: { slug: entitySlug } },
    orderBy: { sortOrder: "asc" },
    select: { source: { select: { slug: true } } },
  });
  return link?.source ? { slug: link.source.slug } : null;
}

/** The most recent contributor whose proposal was applied to this entity, or null
 *  if it has never been edited. Scoped by targetType+targetSlug so recipe-targeted
 *  proposals (and any slug collision with them) are excluded. Covers edit,
 *  links_edit, and loot_sources_edit kinds — all of which carry the entity's slug. */
export async function getLastEditor(
  targetType: "item" | "envEntity" | "tramplerPart",
  slug: string,
): Promise<{ steamId: string; personaName: string | null } | null> {
  const p = await prisma.proposal.findFirst({
    where: { targetType, targetSlug: slug, status: "applied" },
    orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
    select: { proposer: { select: { steamId: true, personaName: true } } },
  });
  return p?.proposer ?? null;
}
