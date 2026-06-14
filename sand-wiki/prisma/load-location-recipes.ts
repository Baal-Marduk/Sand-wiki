import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

interface Line { item: string; amount: number }
interface LocRecipe { location: string; inputs: Line[]; outputs: Line[] }
interface LocData { locations: string[]; recipes: LocRecipe[] }

/** Generated slug for a location recipe: loc-<location>-<primary output>. */
function slugFor(r: LocRecipe): string {
  return `loc-${r.location}-${r.outputs[0].item}`;
}

async function main() {
  const data: LocData = JSON.parse(
    readFileSync(join(__dirname, "location-recipes.json"), "utf-8"),
  );

  // Resolve + protect each location (must already exist; never auto-create — a real
  // landmark needs a category/description authored elsewhere).
  const locIdBySlug = new Map<string, string>();
  for (const slug of data.locations) {
    const loc = await prisma.entity.findUnique({ where: { slug }, select: { id: true, kind: true } });
    if (!loc) throw new Error(`Location not found: ${slug} (create the landmark first)`);
    if (loc.kind !== "environment") throw new Error(`Location ${slug} has kind="${loc.kind}", expected "environment"`);
    await prisma.entity.update({ where: { slug }, data: { curated: true } });
    locIdBySlug.set(slug, loc.id);
  }

  // Resolve every referenced item id up front.
  const itemSlugs = [...new Set(data.recipes.flatMap((r) => [...r.inputs, ...r.outputs].map((l) => l.item)))];
  const items = await prisma.entity.findMany({ where: { kind: "item", slug: { in: itemSlugs } }, select: { id: true, slug: true } });
  const itemIdBySlug = new Map(items.map((i) => [i.slug, i.id]));
  for (const s of itemSlugs) {
    if (!itemIdBySlug.has(s)) throw new Error(`Recipe references unknown item slug: ${s}`);
  }
  const needItem = (s: string) => itemIdBySlug.get(s)!;

  // Upsert each recipe (curated + location-bound). Lines are recreated each run.
  for (const r of data.recipes) {
    const slug = slugFor(r);
    const locationId = locIdBySlug.get(r.location)!;
    const inputs = { create: r.inputs.map((l) => ({ itemId: needItem(l.item), amount: l.amount })) };
    const outputs = { create: r.outputs.map((l) => ({ itemId: needItem(l.item), amount: l.amount })) };

    const existing = await prisma.recipe.findUnique({ where: { slug }, select: { id: true } });
    if (existing) {
      await prisma.recipeInput.deleteMany({ where: { recipeId: existing.id } });
      await prisma.recipeOutput.deleteMany({ where: { recipeId: existing.id } });
      await prisma.recipe.update({
        where: { slug },
        data: { curated: true, locationId, workbench: null, tier: null, craftTimeSeconds: null, inputs, outputs },
      });
    } else {
      await prisma.recipe.create({ data: { slug, curated: true, locationId, inputs, outputs } });
    }
    console.log(`  ✓ ${slug}`);
  }

  console.log(`Loaded ${data.recipes.length} location recipes across ${data.locations.length} locations.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
