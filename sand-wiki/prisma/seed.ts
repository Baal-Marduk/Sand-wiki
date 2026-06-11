import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryForItem, isItemCategory, isEnvCategory, isTramplerCategory } from "../src/lib/taxonomy";
import { isRarity, DEFAULT_RARITY } from "../src/lib/rarity";
import { flattenStats, lootToTiers, costToRows, type RawStats, type RawLoot, type RawCostLine } from "./seed-transform";

interface EnvContent { category: string; name: string; description?: string; sourceUrl?: string; loot?: RawLoot }

interface TramplerContent {
  slug: string; name: string; category: string; description?: string; icon?: string; sourceUrl?: string;
  dimensions?: string; health?: number; weight?: number; weightCapacity?: number; weightCompensation?: number;
  energyConsumption?: number; energyCapacity?: number; ratedPower?: number; crewSlots?: number; itemSlots?: number;
  researchNode?: string; researchName?: string; researchTier?: number; cost?: RawCostLine[];
}

const prisma = new PrismaClient();

interface Enrichment { rarity?: string; stats?: RawStats }

interface ScrapItem {
  slug: string; id: string; name: string; displayName?: string | null;
  description?: string | null; type: string | null;
  isResource: boolean; storageStack: number | null; workbenchTier: number | null; fromCatalog: boolean;
}
interface ScrapLine { item: string; amount: number }
interface ScrapRecipe {
  slug: string; workbench: string | null; tier: number | null; craftTimeSeconds: number | null;
  inputs: ScrapLine[]; outputs: ScrapLine[];
}
interface ScrapData { items: ScrapItem[]; recipes: ScrapRecipe[] }

const INTENDED_MISC = new Set(["KEY", "MONEY", "LARGE_VALUABLE", "SMALL_VALUABLE"]);

/** null/undefined → undefined: omit the field from the upsert payload instead of writing
 *  NULL, so a manual (Directus) edit survives a re-seed when the source has no value.
 *  Known limitation: a value can never transition back to NULL via the seed — once a
 *  source supplied a value and later drops it, the old value persists. */
const opt = <T>(v: T | null | undefined): T | undefined => v ?? undefined;

async function main() {
  const file = process.env.SEED_FILE ?? join(__dirname, "data.json");
  const data: ScrapData = JSON.parse(readFileSync(file, "utf-8"));

  const iconRel: Record<string, string> = JSON.parse(
    readFileSync(join(__dirname, "icons.json"), "utf-8"),
  );
  const iconFor = (id: string): string | undefined => {
    const rel = iconRel[id];
    return rel ? "/icons/" + rel.split("/").pop() : undefined;
  };

  const enrichment: Record<string, Enrichment> = JSON.parse(
    readFileSync(join(__dirname, "wiki-enrichment.json"), "utf-8"),
  );

  // --- Items: upsert by slug (stable ids), prune slugs gone from the scrape ---
  for (const i of data.items) {
    const category = categoryForItem(i.type, i.displayName ?? i.name, i.slug);
    if (!isItemCategory(category)) throw new Error(`Mapped category "${category}" is not a known category`);
    if (i.type && category === "misc" && !INTENDED_MISC.has(i.type)) {
      console.warn(`Unmapped type "${i.type}" -> misc (${i.slug})`);
    }
    const e = enrichment[i.slug];
    let rarity = DEFAULT_RARITY;
    if (e?.rarity) {
      if (isRarity(e.rarity)) rarity = e.rarity;
      else console.warn(`Unknown rarity "${e.rarity}" for ${i.slug} — defaulting to ${DEFAULT_RARITY}`);
    }
    const flat = flattenStats(e?.stats);
    const scraped = {
      name: i.displayName ?? i.name,
      derivedName: i.name,
      description: opt(i.description),
      category,
      storageStack: opt(i.storageStack),
      workbenchTier: opt(i.workbenchTier),
      icon: iconFor(i.id),
      rarity,
      statType: opt(flat.statType),
      statValue: opt(flat.statValue),
      damage: opt(flat.damage),
      playerDamage: opt(flat.playerDamage),
      tramplerDamage: opt(flat.tramplerDamage),
      splashDamage: opt(flat.splashDamage),
      magazine: opt(flat.magazine),
      ammoName: opt(flat.ammoName),
    };
    await prisma.item.upsert({ where: { slug: i.slug }, create: { slug: i.slug, ...scraped }, update: scraped });
  }
  const prunedItems = await prisma.item.deleteMany({ where: { slug: { notIn: data.items.map((i) => i.slug) } } });
  if (prunedItems.count > 0) console.log(`Pruned ${prunedItems.count} item(s) no longer in the scrape`);

  const idBySlug = new Map(
    (await prisma.item.findMany({ select: { slug: true, id: true } })).map((it) => [it.slug, it.id]),
  );
  const need = (slug: string) => {
    const id = idBySlug.get(slug);
    if (!id) throw new Error(`Recipe references unknown item slug: ${slug}`);
    return id;
  };

  // --- ammoSlug → ammoItem self-relation (second pass: every item now exists) ---
  for (const i of data.items) {
    const ammoSlug = enrichment[i.slug]?.stats?.ammoSlug;
    if (!ammoSlug) continue;
    const ammoItemId = idBySlug.get(ammoSlug) ?? null;
    if (!ammoItemId) console.warn(`ammoSlug "${ammoSlug}" on ${i.slug} does not resolve to an item`);
    await prisma.item.update({ where: { slug: i.slug }, data: { ammoItemId } });
  }

  // --- Recipes: line rows are scraper-owned → recreate; recipe rows keep stable ids ---
  await prisma.recipeInput.deleteMany();
  await prisma.recipeOutput.deleteMany();
  for (const r of data.recipes) {
    const scraped = { workbench: opt(r.workbench), tier: opt(r.tier), craftTimeSeconds: opt(r.craftTimeSeconds) };
    const lines = {
      inputs: { create: r.inputs.map((l) => ({ itemId: need(l.item), amount: l.amount })) },
      outputs: { create: r.outputs.map((l) => ({ itemId: need(l.item), amount: l.amount })) },
    };
    await prisma.recipe.upsert({
      where: { slug: r.slug },
      create: { slug: r.slug, ...scraped, ...lines },
      update: { ...scraped, ...lines },
    });
  }
  const prunedRecipes = await prisma.recipe.deleteMany({ where: { slug: { notIn: data.recipes.map((r) => r.slug) } } });
  if (prunedRecipes.count > 0) console.log(`Pruned ${prunedRecipes.count} recipe(s) no longer in the scrape`);

  // --- Environment entities + loot tiers/entries (tiers/entries are scraper-owned → recreate) ---
  const envContent: Record<string, EnvContent> = JSON.parse(
    readFileSync(join(__dirname, "env-content.json"), "utf-8"),
  );
  let envCount = 0;
  const envSlugs: string[] = [];
  for (const [slug, e] of Object.entries(envContent)) {
    if (!isEnvCategory(e.category)) throw new Error(`Unknown env category "${e.category}" for ${slug}`);
    envSlugs.push(slug);
    const scraped = { category: e.category, name: e.name, description: opt(e.description), sourceUrl: opt(e.sourceUrl) };
    const entity = await prisma.envEntity.upsert({ where: { slug }, create: { slug, ...scraped }, update: scraped });
    await prisma.lootTier.deleteMany({ where: { envEntityId: entity.id } });
    for (const t of lootToTiers(e.loot)) {
      await prisma.lootTier.create({
        data: {
          envEntityId: entity.id,
          tier: t.tier,
          col1Label: t.col1Label,
          col2Label: t.col2Label,
          col3Label: t.col3Label,
          sortOrder: t.sortOrder,
          entries: {
            create: t.entries.map((en) => {
              const itemId = en.itemSlug ? idBySlug.get(en.itemSlug) ?? null : null;
              if (en.itemSlug && !itemId) console.warn(`Loot slug "${en.itemSlug}" in ${slug}/${t.tier} does not resolve to an item`);
              return { itemId, name: en.name, value1: en.value1, value2: en.value2, value3: en.value3, sortOrder: en.sortOrder };
            }),
          },
        },
      });
    }
    envCount++;
  }
  const prunedEnv = await prisma.envEntity.deleteMany({ where: { slug: { notIn: envSlugs } } });
  if (prunedEnv.count > 0) console.log(`Pruned ${prunedEnv.count} env entit(ies) no longer in the scrape`);

  // --- Trampler parts + cost rows (cost rows are scraper-owned → recreate) ---
  const tramplers: Record<string, TramplerContent> = JSON.parse(
    readFileSync(join(__dirname, "tramplers.json"), "utf-8"),
  );
  let tramplerCount = 0;
  const tramplerSlugs: string[] = [];
  for (const [slug, t] of Object.entries(tramplers)) {
    if (!isTramplerCategory(t.category)) throw new Error(`Unknown trampler category "${t.category}" for ${slug}`);
    tramplerSlugs.push(slug);
    const scraped = {
      name: t.name, category: t.category,
      description: opt(t.description), icon: opt(t.icon), sourceUrl: opt(t.sourceUrl),
      dimensions: opt(t.dimensions),
      health: opt(t.health), weight: opt(t.weight),
      weightCapacity: opt(t.weightCapacity), weightCompensation: opt(t.weightCompensation),
      energyConsumption: opt(t.energyConsumption), energyCapacity: opt(t.energyCapacity),
      ratedPower: opt(t.ratedPower), crewSlots: opt(t.crewSlots), itemSlots: opt(t.itemSlots),
      researchNode: opt(t.researchNode), researchName: opt(t.researchName), researchTier: opt(t.researchTier),
    };
    const part = await prisma.tramplerPart.upsert({ where: { slug }, create: { slug, ...scraped }, update: scraped });
    await prisma.tramplerPartCost.deleteMany({ where: { partId: part.id } });
    const rows = costToRows(t.cost);
    if (rows.length > 0) {
      await prisma.tramplerPartCost.createMany({
        data: rows.map((c) => {
          const itemId = c.itemSlug ? idBySlug.get(c.itemSlug) ?? null : null;
          if (c.itemSlug && !itemId) console.warn(`Cost slug "${c.itemSlug}" on ${slug} does not resolve to an item`);
          return { partId: part.id, itemId, name: c.name, amount: c.amount, sortOrder: c.sortOrder };
        }),
      });
    }
    tramplerCount++;
  }
  const prunedTramplers = await prisma.tramplerPart.deleteMany({ where: { slug: { notIn: tramplerSlugs } } });
  if (prunedTramplers.count > 0) console.log(`Pruned ${prunedTramplers.count} trampler part(s) no longer in the scrape`);

  const [itemCount, recipeCount] = await Promise.all([prisma.item.count(), prisma.recipe.count()]);
  if (itemCount !== data.items.length) throw new Error(`Item count mismatch after seed: DB has ${itemCount}, snapshot has ${data.items.length} (duplicate slugs?)`);
  if (recipeCount !== data.recipes.length) throw new Error(`Recipe count mismatch after seed: DB has ${recipeCount}, snapshot has ${data.recipes.length} (duplicate slugs?)`);
  console.log(`Seeded ${data.items.length} items, ${data.recipes.length} recipes, ${envCount} environment entities, ${tramplerCount} trampler parts.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
