import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ammoRowIdentity, type NewAmmo } from "./new-ammo";

const prisma = new PrismaClient();

async function main() {
  const entries: NewAmmo[] = JSON.parse(
    readFileSync(join(__dirname, "new-ammo.json"), "utf-8"),
  );

  // Duplicate-slug guard: two entries sharing a slug would clobber each other.
  const slugs = entries.map((e) => e.slug);
  const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
  if (dup) throw new Error(`Duplicate slug in new-ammo.json: ${dup}`);

  let created = 0;
  let skipped = 0;
  for (const e of entries) {
    // The PNG must already be in place — its path is what we store in Entity.icon.
    const png = join(__dirname, "..", "public", "icons", e.iconFile);
    if (!existsSync(png)) {
      throw new Error(`Missing icon PNG: public/icons/${e.iconFile} (copy it in first)`);
    }

    const identity = ammoRowIdentity(e); // also asserts the caliber invariant

    // Create-if-absent: never overwrite an existing row, so re-running cannot revert
    // contributor edits made on the live DB after the initial load.
    const existing = await prisma.entity.findUnique({ where: { slug: e.slug }, select: { id: true } });
    if (existing) {
      console.log(`  • ${e.slug} already exists — skipped`);
      skipped++;
      continue;
    }
    await prisma.entity.create({ data: { slug: e.slug, kind: "item", ...identity } });
    console.log(`  ✓ ${e.slug}`);
    created++;
  }

  console.log(`Done: ${created} created, ${skipped} skipped (of ${entries.length}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
