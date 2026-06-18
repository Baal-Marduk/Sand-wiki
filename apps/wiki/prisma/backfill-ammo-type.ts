// One-time, seed-SAFE backfill: computes ItemStats.ammoType for every weapon/ammo
// item and writes ONLY that column. Touches nothing else, so it cannot revert any
// contributor field/rarity/loot edit. Idempotent — safe to re-run.
//
//   npx tsx prisma/backfill-ammo-type.ts
import { PrismaClient } from "@prisma/client";
import { ammoTypeFor } from "../src/lib/ammo";

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.entity.findMany({
    where: { kind: "item", category: { in: ["ammo", "weapons", "artillery"] } },
    select: { id: true, slug: true, name: true, category: true, itemStats: { select: { ammoName: true } } },
  });

  let updated = 0;
  for (const it of items) {
    const ammoType = ammoTypeFor(it.category ?? "", it.slug, it.name, it.itemStats?.ammoName ?? null);
    if (ammoType === null) continue;
    await prisma.itemStats.upsert({
      where: { entityId: it.id },
      update: { ammoType },
      create: { entityId: it.id, ammoType },
    });
    updated++;
  }
  console.log(`Backfilled ammoType on ${updated} of ${items.length} weapon/ammo item(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
