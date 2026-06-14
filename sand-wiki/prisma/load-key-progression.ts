import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

const KEY_ROLES = ["requires-key", "rewards-key"] as const;
type KeyRole = (typeof KEY_ROLES)[number];

interface KeyLink { source: string; role: KeyRole; target: string }
interface KeyData { links: KeyLink[] }

/**
 * Idempotent loader for the island key-progression chain (prisma/key-progression.json).
 *
 * SAFE BY DESIGN — this NEVER runs the full seed and only ever writes:
 *   - EntityLink rows with role `requires-key` / `rewards-key` (roles the seed does not
 *     know about, so a re-seed never deletes or recreates them), and
 *   - `curated = true` on the source locations (guards them from prune; does NOT touch
 *     any item field such as rarity/description).
 * It does not upsert items and cannot revert contributor edits. Re-runnable.
 */
async function main() {
  const data: KeyData = JSON.parse(
    readFileSync(join(__dirname, "key-progression.json"), "utf-8"),
  );

  for (const l of data.links) {
    if (!KEY_ROLES.includes(l.role)) {
      throw new Error(`Invalid role "${l.role}" — expected ${KEY_ROLES.join(" | ")}`);
    }
  }

  // Resolve sources (must be environment) and targets (must be item) up front; fail loud.
  const sourceSlugs = [...new Set(data.links.map((l) => l.source))];
  const targetSlugs = [...new Set(data.links.map((l) => l.target))];

  const sources = await prisma.entity.findMany({
    where: { slug: { in: sourceSlugs } },
    select: { id: true, slug: true, kind: true },
  });
  const srcBySlug = new Map(sources.map((s) => [s.slug, s]));
  for (const s of sourceSlugs) {
    const e = srcBySlug.get(s);
    if (!e) throw new Error(`Source location not found: ${s} (create the landmark first)`);
    if (e.kind !== "environment") throw new Error(`Source ${s} has kind="${e.kind}", expected "environment"`);
  }

  const targets = await prisma.entity.findMany({
    where: { slug: { in: targetSlugs } },
    select: { id: true, slug: true, name: true, kind: true },
  });
  const tgtBySlug = new Map(targets.map((t) => [t.slug, t]));
  for (const t of targetSlugs) {
    const e = tgtBySlug.get(t);
    if (!e) throw new Error(`Target key item not found: ${t}`);
    if (e.kind !== "item") throw new Error(`Target ${t} has kind="${e.kind}", expected "item"`);
  }

  // Protect the source locations from prune (curated guards rows only, never field values).
  for (const s of sourceSlugs) {
    await prisma.entity.update({ where: { slug: s }, data: { curated: true } });
  }

  // Group by source+role and recreate that role's links idempotently.
  const groups = new Map<string, KeyLink[]>();
  for (const l of data.links) {
    const k = `${l.source}|${l.role}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(l);
  }

  let total = 0;
  for (const [k, links] of groups) {
    const sourceId = srcBySlug.get(links[0].source)!.id;
    const role = links[0].role;
    await prisma.entityLink.deleteMany({ where: { sourceId, role } });
    await prisma.entityLink.createMany({
      data: links.map((l, i) => {
        const t = tgtBySlug.get(l.target)!;
        return { sourceId, targetId: t.id, role, name: t.name, sortOrder: i };
      }),
    });
    total += links.length;
    console.log(`  ✓ ${k} (${links.length})`);
  }

  console.log(`Loaded ${total} key-progression links across ${sourceSlugs.length} locations.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
