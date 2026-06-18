import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLockMap, lockedHits, omitLocked } from "../src/lib/seed-curation";
import type { StatPatch, WeaponStatsArtifact } from "./weapon-stats";

const prisma = new PrismaClient();

/**
 * Seed-safe loader for datamined combat stats (prisma/weapon-stats.json).
 * Datamine-authoritative over the wiki scrape, BUT respects contributor edits via the
 * same applied-edit lock map as seed.ts (src/lib/seed-curation.ts). Updates ONLY the
 * ItemStats of matched items — no entity creation, no pruning, no reseed. Idempotent.
 * Targets whatever DATABASE_URL points at — run against the dev branch first.
 */
async function main() {
  const file: WeaponStatsArtifact = JSON.parse(
    readFileSync(join(__dirname, "weapon-stats.json"), "utf-8"),
  );
  const lockMap = buildLockMap(
    await prisma.proposal.findMany({
      where: { status: "applied", kind: "edit" },
      select: { targetSlug: true, changes: true },
    }),
  );
  const entries = Object.entries(file.items);
  const idBySlug = new Map(
    (await prisma.entity.findMany({
      where: { kind: "item", slug: { in: entries.map(([s]) => s) } },
      select: { slug: true, id: true },
    })).map((e) => [e.slug, e.id]),
  );

  let updated = 0, fields = 0, preserved = 0;
  const missing: string[] = [];
  for (const [slug, patch] of entries) {
    const entityId = idBySlug.get(slug);
    if (!entityId) { missing.push(slug); continue; }
    const locked = lockMap.get(slug);
    const update = omitLocked(patch as Record<string, unknown>, locked) as StatPatch;
    preserved += lockedHits(patch as Record<string, unknown>, locked);
    if (Object.keys(update).length === 0) continue;
    await prisma.itemStats.upsert({
      where: { entityId },
      create: { entityId, ...update },
      update,
    });
    updated++; fields += Object.keys(update).length;
  }

  console.log(`Updated ItemStats for ${updated} item(s); ${fields} field(s) written, ${preserved} preserved (locked).`);
  if (missing.length) console.log(`Skipped ${missing.length} slug(s) not in DB: ${missing.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
