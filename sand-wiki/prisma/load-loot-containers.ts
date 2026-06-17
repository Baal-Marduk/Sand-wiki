import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lootLinkRows, type LootContainersFile } from "./loot-containers";

const prisma = new PrismaClient();

/**
 * Scrape-authoritative loader for datamined loot containers
 * (prisma/loot-containers.json). FULL OVERWRITE by design:
 *   - upserts each container as Entity(kind="environment", category="loot-containers"),
 *   - deletes + recreates that container's role="loot" EntityLinks,
 *   - prunes loot-containers entities absent from the artifact.
 * Touches ONLY loot-containers entities and their loot links. Idempotent.
 * Targets whatever DATABASE_URL points at — run against the dev branch first.
 */
async function main() {
  const file: LootContainersFile = JSON.parse(
    readFileSync(join(__dirname, "loot-containers.json"), "utf-8"),
  );
  const entries = Object.entries(file.containers);

  // Resolve every non-null loot slug to an item id up front; fail loud.
  const slugs = [...new Set(entries.flatMap(([, c]) => lootLinkRows(c).map((r) => r.slug).filter((s): s is string => !!s)))];
  const items = await prisma.entity.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const idBySlug = new Map(items.map((i) => [i.slug, i.id]));
  const missing = slugs.filter((s) => !idBySlug.has(s));
  if (missing.length) throw new Error(`Loot slugs not in DB (create them first): ${missing.join(", ")}`);

  let containers = 0, links = 0;
  for (const [slug, c] of entries) {
    const entity = await prisma.entity.upsert({
      where: { slug },
      create: { slug, kind: "environment", category: c.category, name: c.name, icon: c.icon ?? null, curated: true },
      update: { category: c.category, name: c.name, icon: c.icon ?? null, curated: true },
    });
    await prisma.entityLink.deleteMany({ where: { sourceId: entity.id, role: "loot" } });
    const rows = lootLinkRows(c);
    await prisma.entityLink.createMany({
      data: rows.map((r) => ({
        sourceId: entity.id,
        targetId: r.slug ? idBySlug.get(r.slug)! : null,
        role: "loot",
        name: r.name,
        tier: r.tier,
        value1: r.value1,
        value2: r.value2,
        value3: r.value3,
        sortOrder: r.sortOrder,
      })),
    });
    containers++; links += rows.length;
    console.log(`  ✓ ${slug} (${rows.length} drops)`);
  }

  // Prune loot-containers entities no longer in the artifact (full sync).
  const keep = entries.map(([slug]) => slug);
  const pruned = await prisma.entity.deleteMany({
    where: { kind: "environment", category: "loot-containers", slug: { notIn: keep } },
  });

  console.log(`Loaded ${containers} containers, ${links} loot links. Pruned ${pruned.count} stale container(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
