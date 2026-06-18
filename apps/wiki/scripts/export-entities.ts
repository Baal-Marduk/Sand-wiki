// One-time bridge: read today's dev Neon DB and write denormalized JSON into
// packages/data/generated. Run from apps/wiki (needs DATABASE_URL + the Prisma client).
// Superseded by the unified pipeline (spec #2).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OUT = resolve(__dirname, "../../../packages/data/generated");

async function main() {
  const entityRows = await prisma.entity.findMany({
    include: { itemStats: true, tramplerStats: true, techNodeStats: true },
    orderBy: { slug: "asc" },
  });

  const entities = entityRows.map((e) => ({
    id: e.id, slug: e.slug, kind: e.kind, name: e.name, description: e.description,
    category: e.category, rarity: e.rarity, icon: e.icon, imageAlt: e.imageAlt,
    derivedName: e.derivedName, sourceUrl: e.sourceUrl, disabled: e.disabled,
    itemStats: e.itemStats
      ? stripId(e.itemStats)
      : null,
    tramplerStats: e.tramplerStats ? stripId(e.tramplerStats) : null,
    techNodeStats: e.techNodeStats
      ? { faction: e.techNodeStats.faction, tier: e.techNodeStats.tier, sortOrder: e.techNodeStats.sortOrder }
      : null,
  }));

  const recipeRows = await prisma.recipe.findMany({
    include: { inputs: { include: { entity: { select: { slug: true } } } },
               outputs: { include: { entity: { select: { slug: true } } } },
               location: { select: { slug: true } } },
    orderBy: { slug: "asc" },
  });
  const recipes = recipeRows.map((r) => ({
    slug: r.slug, workbench: r.workbench, tier: r.tier, craftTimeSeconds: r.craftTimeSeconds,
    locationSlug: r.location?.slug ?? null,
    inputs: r.inputs.map((i) => ({ itemSlug: i.entity.slug, amount: i.amount })),
    outputs: r.outputs.map((o) => ({ itemSlug: o.entity.slug, amount: o.amount })),
  }));

  const linkRows = await prisma.entityLink.findMany({
    include: { source: { select: { slug: true } }, target: { select: { slug: true } } },
    orderBy: [{ sourceId: "asc" }, { role: "asc" }, { sortOrder: "asc" }],
  });
  const links = linkRows.map((l) => ({
    sourceSlug: l.source.slug, targetSlug: l.target?.slug ?? null, role: l.role,
    name: l.name, amount: l.amount, tier: l.tier, value1: l.value1, value2: l.value2,
    value3: l.value3, sortOrder: l.sortOrder, buyGroup: l.buyGroup,
  }));

  write("entities.json", entities);
  write("recipes.json", recipes);
  write("links.json", links);
  console.log(`exported ${entities.length} entities, ${recipes.length} recipes, ${links.length} links`);
}

// Drop the relational `entityId` PK from a stats row; keep all stat fields.
function stripId<T extends { entityId: string }>(row: T): Omit<T, "entityId"> {
  const { entityId: _drop, ...rest } = row;
  return rest;
}

function write(file: string, data: unknown) {
  writeFileSync(resolve(OUT, file), JSON.stringify(data, null, 2) + "\n");
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
