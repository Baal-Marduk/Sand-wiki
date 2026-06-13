import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryForItem, isItemCategory, isEnvCategory, isTramplerCategory } from "../src/lib/taxonomy";
import { isRarity, DEFAULT_RARITY } from "../src/lib/rarity";
import { flattenStats, lootToTiers, costToRows, mergeItems, type RawStats, type RawLoot, type RawCostLine } from "./seed-transform";

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
  const gear: ScrapItem[] = JSON.parse(
    readFileSync(join(__dirname, "gear.json"), "utf-8"),
  );
  const items = mergeItems(data.items, gear);

  const iconRel: Record<string, string> = JSON.parse(
    readFileSync(join(__dirname, "icons.json"), "utf-8"),
  );
  const iconFor = (id: string): string | undefined => {
    const rel = iconRel[id];
    return rel ? "/icons/" + rel.split("/").pop() : undefined;
  };

  const tramplerIconRel: Record<string, string> = JSON.parse(
    readFileSync(join(__dirname, "trampler-icons.json"), "utf-8"),
  );
  const tramplerIconFor = (slug: string): string | undefined => {
    const rel = tramplerIconRel[slug];
    return rel ? "/tramplers/" + rel.split("/").pop() : undefined;
  };

  const enrichment: Record<string, Enrichment> = JSON.parse(
    readFileSync(join(__dirname, "wiki-enrichment.json"), "utf-8"),
  );

  // --- Items: upsert by slug (stable ids), prune slugs gone from the scrape ---
  for (const i of items) {
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
    // Entity identity fields (live on the Entity row).
    const identity = {
      name: i.displayName ?? i.name,
      derivedName: i.name,
      description: opt(i.description),
      category,
      icon: iconFor(i.id),
      rarity,
    };
    // Stat-extension fields (live on ItemStats, written via nested upsert).
    const stats = {
      storageStack: opt(i.storageStack),
      workbenchTier: opt(i.workbenchTier),
      statType: opt(flat.statType),
      statValue: opt(flat.statValue),
      damage: opt(flat.damage),
      playerDamage: opt(flat.playerDamage),
      tramplerDamage: opt(flat.tramplerDamage),
      splashDamage: opt(flat.splashDamage),
      magazine: opt(flat.magazine),
      ammoName: opt(flat.ammoName),
    };
    await prisma.entity.upsert({
      where: { slug: i.slug },
      create: { slug: i.slug, kind: "item", ...identity, itemStats: { create: stats } },
      update: { ...identity, itemStats: { upsert: { create: stats, update: stats } } },
    });
  }
  const prunedItems = await prisma.entity.deleteMany({ where: { kind: "item", slug: { notIn: items.map((i) => i.slug) } } });
  if (prunedItems.count > 0) console.log(`Pruned ${prunedItems.count} item(s) no longer in the scrape`);

  // slug → Entity id, scoped to items (loot/cost/recipe targets are items).
  const idBySlug = new Map(
    (await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, id: true } })).map((it) => [it.slug, it.id]),
  );
  // name → Entity id (lowercased), for cost lines that reference an item by name
  // only (e.g. the "Crowns" currency, which carries no slug in the source data).
  const idByName = new Map(
    (await prisma.entity.findMany({ where: { kind: "item" }, select: { name: true, id: true } })).map((it) => [
      it.name.toLowerCase(),
      it.id,
    ]),
  );
  const need = (slug: string) => {
    const id = idBySlug.get(slug);
    if (!id) throw new Error(`Recipe references unknown item slug: ${slug}`);
    return id;
  };

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
    const entity = await prisma.entity.upsert({
      where: { slug },
      create: { slug, kind: "environment", ...scraped },
      update: scraped,
    });
    if (entity.lootCurated) {
      console.log(`Skipping loot recreate for ${slug} (lootCurated = true)`);
    } else {
      // Loot rows are scraper-owned → delete + recreate as EntityLink role 'loot'.
      // Global sortOrder = tier rank * 1000 + entry order, so tiers stay grouped & ordered.
      await prisma.entityLink.deleteMany({ where: { sourceId: entity.id, role: "loot" } });
      for (const t of lootToTiers(e.loot)) {
        for (const en of t.entries) {
          const targetId = en.itemSlug ? idBySlug.get(en.itemSlug) ?? null : null;
          if (en.itemSlug && !targetId) console.warn(`Loot slug "${en.itemSlug}" in ${slug}/${t.tier} does not resolve to an item`);
          await prisma.entityLink.create({
            data: {
              sourceId: entity.id,
              role: "loot",
              targetId,
              name: en.name,
              tier: t.tier,
              value1: en.value1,
              value2: en.value2,
              value3: en.value3,
              sortOrder: t.sortOrder * 1000 + en.sortOrder,
            },
          });
        }
      }
    }
    envCount++;
  }
  const prunedEnv = await prisma.entity.deleteMany({ where: { kind: "environment", slug: { notIn: envSlugs } } });
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
    const identity = {
      name: t.name, category: t.category,
      description: opt(t.description), icon: tramplerIconFor(slug) ?? opt(t.icon), sourceUrl: opt(t.sourceUrl),
    };
    const stats = {
      dimensions: opt(t.dimensions),
      health: opt(t.health), weight: opt(t.weight),
      weightCapacity: opt(t.weightCapacity), weightCompensation: opt(t.weightCompensation),
      energyConsumption: opt(t.energyConsumption), energyCapacity: opt(t.energyCapacity),
      ratedPower: opt(t.ratedPower), crewSlots: opt(t.crewSlots), itemSlots: opt(t.itemSlots),
      researchNode: opt(t.researchNode), researchName: opt(t.researchName), researchTier: opt(t.researchTier),
    };
    const part = await prisma.entity.upsert({
      where: { slug },
      create: { slug, kind: "trampler-part", ...identity, tramplerStats: { create: stats } },
      update: { ...identity, tramplerStats: { upsert: { create: stats, update: stats } } },
    });
    // Cost rows are scraper-owned → delete + recreate as EntityLink role 'cost'.
    await prisma.entityLink.deleteMany({ where: { sourceId: part.id, role: "cost" } });
    const rows = costToRows(t.cost);
    if (rows.length > 0) {
      await prisma.entityLink.createMany({
        data: rows.map((c) => {
          // Resolve by slug; fall back to name (currency lines like "Crowns" carry no slug).
          const targetId = c.itemSlug
            ? idBySlug.get(c.itemSlug) ?? null
            : idByName.get(c.name.toLowerCase()) ?? null;
          if (c.itemSlug && !targetId) console.warn(`Cost slug "${c.itemSlug}" on ${slug} does not resolve to an item`);
          return { sourceId: part.id, role: "cost", targetId, name: c.name, amount: c.amount, sortOrder: c.sortOrder };
        }),
      });
    }
    tramplerCount++;
  }
  const prunedTramplers = await prisma.entity.deleteMany({ where: { kind: "trampler-part", slug: { notIn: tramplerSlugs } } });
  if (prunedTramplers.count > 0) console.log(`Pruned ${prunedTramplers.count} trampler part(s) no longer in the scrape`);

  const [itemCount, recipeCount] = await Promise.all([prisma.entity.count({ where: { kind: "item" } }), prisma.recipe.count()]);
  if (itemCount !== items.length) throw new Error(`Item count mismatch after seed: DB has ${itemCount}, snapshot has ${items.length} (duplicate slugs?)`);
  if (recipeCount !== data.recipes.length) throw new Error(`Recipe count mismatch after seed: DB has ${recipeCount}, snapshot has ${data.recipes.length} (duplicate slugs?)`);
  console.log(`Seeded ${items.length} items, ${data.recipes.length} recipes, ${envCount} environment entities, ${tramplerCount} trampler parts.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
