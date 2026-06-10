import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryForItem, isItemCategory, isEnvCategory, isTramplerCategory } from "../src/lib/taxonomy";
import { isRarity, DEFAULT_RARITY } from "../src/lib/rarity";

interface EnvContent { category: string; name: string; description?: string; sourceUrl?: string; loot?: unknown }

interface TramplerContent {
  slug: string; name: string; category: string; description?: string; icon?: string; sourceUrl?: string;
  dimensions?: string; health?: number; weight?: number; weightCapacity?: number; weightCompensation?: number;
  energyConsumption?: number; energyCapacity?: number; ratedPower?: number; crewSlots?: number; itemSlots?: number;
  researchNode?: string; researchName?: string; researchTier?: number; cost?: unknown;
}

const prisma = new PrismaClient();

interface Enrichment { rarity?: string; stats?: Record<string, unknown> }

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

  await prisma.recipeInput.deleteMany();
  await prisma.recipeOutput.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.item.deleteMany();
  await prisma.envEntity.deleteMany();
  await prisma.tramplerPart.deleteMany();

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
    await prisma.item.create({
      data: {
        slug: i.slug,
        name: i.displayName ?? i.name,
        derivedName: i.name,
        description: i.description ?? undefined,
        category, isResource: i.isResource,
        storageStack: i.storageStack ?? undefined, workbenchTier: i.workbenchTier ?? undefined,
        icon: iconFor(i.id),
        rarity,
        stats: (e?.stats ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  const idBySlug = new Map((await prisma.item.findMany()).map((it) => [it.slug, it.id]));
  const need = (slug: string) => {
    const id = idBySlug.get(slug);
    if (!id) throw new Error(`Recipe references unknown item slug: ${slug}`);
    return id;
  };

  for (const r of data.recipes) {
    await prisma.recipe.create({
      data: {
        slug: r.slug, workbench: r.workbench ?? undefined, tier: r.tier ?? undefined,
        craftTimeSeconds: r.craftTimeSeconds ?? undefined,
        inputs: { create: r.inputs.map((l) => ({ itemId: need(l.item), amount: l.amount })) },
        outputs: { create: r.outputs.map((l) => ({ itemId: need(l.item), amount: l.amount })) },
      },
    });
  }

  const envContent: Record<string, EnvContent> = JSON.parse(
    readFileSync(join(__dirname, "env-content.json"), "utf-8"),
  );
  let envCount = 0;
  for (const [slug, e] of Object.entries(envContent)) {
    if (!isEnvCategory(e.category)) {
      console.warn(`Unknown env category "${e.category}" for ${slug} — skipped`);
      continue;
    }
    await prisma.envEntity.create({
      data: {
        slug, category: e.category, name: e.name,
        description: e.description ?? undefined, sourceUrl: e.sourceUrl ?? undefined,
        loot: (e.loot ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    envCount++;
  }

  const tramplers: Record<string, TramplerContent> = JSON.parse(
    readFileSync(join(__dirname, "tramplers.json"), "utf-8"),
  );
  let tramplerCount = 0;
  for (const [slug, t] of Object.entries(tramplers)) {
    if (!isTramplerCategory(t.category)) {
      console.warn(`Unknown trampler category "${t.category}" for ${slug} — skipped`);
      continue;
    }
    await prisma.tramplerPart.create({
      data: {
        slug, name: t.name, category: t.category,
        description: t.description ?? undefined, icon: t.icon ?? undefined, sourceUrl: t.sourceUrl ?? undefined,
        dimensions: t.dimensions ?? undefined,
        health: t.health ?? undefined, weight: t.weight ?? undefined,
        weightCapacity: t.weightCapacity ?? undefined, weightCompensation: t.weightCompensation ?? undefined,
        energyConsumption: t.energyConsumption ?? undefined, energyCapacity: t.energyCapacity ?? undefined,
        ratedPower: t.ratedPower ?? undefined, crewSlots: t.crewSlots ?? undefined, itemSlots: t.itemSlots ?? undefined,
        researchNode: t.researchNode ?? undefined, researchName: t.researchName ?? undefined,
        researchTier: t.researchTier ?? undefined,
        cost: (t.cost ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    tramplerCount++;
  }

  console.log(`Seeded ${data.items.length} items, ${data.recipes.length} recipes, ${envCount} environment entities, ${tramplerCount} trampler parts.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
