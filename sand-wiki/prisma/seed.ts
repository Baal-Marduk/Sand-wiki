import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryForItem, isItemCategory } from "../src/lib/taxonomy";

const prisma = new PrismaClient();

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

  await prisma.recipeInput.deleteMany();
  await prisma.recipeOutput.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.item.deleteMany();

  for (const i of data.items) {
    const category = categoryForItem(i.type, i.displayName ?? i.name);
    if (!isItemCategory(category)) throw new Error(`Mapped category "${category}" is not a known category`);
    if (i.type && category === "misc" && !INTENDED_MISC.has(i.type)) {
      console.warn(`Unmapped type "${i.type}" -> misc (${i.slug})`);
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

  console.log(`Seeded ${data.items.length} items and ${data.recipes.length} recipes.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
