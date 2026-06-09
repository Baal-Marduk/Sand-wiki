import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isItemCategory } from "../src/lib/taxonomy";

const prisma = new PrismaClient();

interface SeedRecipe { ingredient: string; quantity: number }
interface SeedItem {
  slug: string; name: string; category: string; isResource?: boolean;
  description?: string; workbenchLevel?: number; craftTimeSeconds?: number;
  unlockConditions?: string; unlockedBy?: string; imageAlt?: string; recipe?: SeedRecipe[];
}
interface SeedCost { resource: string; quantity: number }
interface SeedTechNode {
  slug: string; name: string; description?: string; costs?: SeedCost[]; prerequisites?: string[];
}
interface SeedData { items: SeedItem[]; techNodes: SeedTechNode[] }

async function main() {
  const file = process.env.SEED_FILE ?? join(__dirname, "sample-data.json");
  const data: SeedData = JSON.parse(readFileSync(file, "utf-8"));

  // Clear in FK-safe order (idempotent re-runs).
  await prisma.recipeIngredient.deleteMany();
  await prisma.techCost.deleteMany();
  await prisma.techPrerequisite.deleteMany();
  await prisma.item.deleteMany();
  await prisma.techNode.deleteMany();

  // 1. Tech nodes (without prerequisites yet).
  for (const t of data.techNodes) {
    await prisma.techNode.create({
      data: { slug: t.slug, name: t.name, description: t.description },
    });
  }
  // 2. Items (without recipe/unlockedBy links yet).
  for (const i of data.items) {
    if (!isItemCategory(i.category)) {
      throw new Error(`Unknown item category "${i.category}" for ${i.slug}`);
    }
    await prisma.item.create({
      data: {
        slug: i.slug, name: i.name, category: i.category, isResource: i.isResource ?? false,
        description: i.description, workbenchLevel: i.workbenchLevel,
        craftTimeSeconds: i.craftTimeSeconds, unlockConditions: i.unlockConditions, imageAlt: i.imageAlt,
      },
    });
  }

  const itemBySlug = new Map((await prisma.item.findMany()).map((i) => [i.slug, i]));
  const techBySlug = new Map((await prisma.techNode.findMany()).map((t) => [t.slug, t]));
  const need = <T,>(v: T | undefined, what: string): T => {
    if (v === undefined) throw new Error(`Seed reference not found: ${what}`);
    return v;
  };

  // 3. Item recipes + unlockedBy.
  for (const i of data.items) {
    const item = need(itemBySlug.get(i.slug), `item ${i.slug}`);
    if (i.unlockedBy) {
      const tech = need(techBySlug.get(i.unlockedBy), `tech ${i.unlockedBy}`);
      await prisma.item.update({ where: { id: item.id }, data: { unlockedById: tech.id } });
    }
    for (const r of i.recipe ?? []) {
      const ingredient = need(itemBySlug.get(r.ingredient), `ingredient ${r.ingredient}`);
      await prisma.recipeIngredient.create({
        data: { itemId: item.id, ingredientId: ingredient.id, quantity: r.quantity },
      });
    }
  }

  // 4. Tech costs + prerequisites.
  for (const t of data.techNodes) {
    const node = need(techBySlug.get(t.slug), `tech ${t.slug}`);
    for (const c of t.costs ?? []) {
      const resource = need(itemBySlug.get(c.resource), `resource ${c.resource}`);
      await prisma.techCost.create({
        data: { techNodeId: node.id, resourceId: resource.id, quantity: c.quantity },
      });
    }
    for (const p of t.prerequisites ?? []) {
      const prereq = need(techBySlug.get(p), `prerequisite ${p}`);
      await prisma.techPrerequisite.create({
        data: { nodeId: node.id, prerequisiteId: prereq.id },
      });
    }
  }

  console.log(`Seeded ${data.items.length} items and ${data.techNodes.length} tech nodes.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
