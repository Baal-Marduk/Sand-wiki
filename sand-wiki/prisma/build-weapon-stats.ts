/** Reshape the datamine snapshot into prisma/weapon-stats.json (slug-keyed).
 *  Joins datamine item ids → wiki slugs via prisma/data.json, drops unmatched ids
 *  (e.g. dev/test items). Run: npm run weapons:build. Commit the output. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ammoPatch, armorPatch, turretPatch, weaponPatch,
  type StatPatch, type TurretStatsFile, type WeaponStatsArtifact, type WeaponStatsFile,
} from "./weapon-stats";

const SOURCE = "datamine/data/weapon_stats.json";

const raw = JSON.parse(
  readFileSync(join(__dirname, "..", "datamine/data/weapon_stats.json"), "utf-8"),
) as WeaponStatsFile;
const turrets = JSON.parse(
  readFileSync(join(__dirname, "..", "datamine/data/turret_stats.json"), "utf-8"),
) as TurretStatsFile;
const data = JSON.parse(readFileSync(join(__dirname, "data.json"), "utf-8")) as {
  items: { id: string; slug: string }[];
};
const slugById = new Map(data.items.map((i) => [i.id, i.slug]));

const items: Record<string, StatPatch> = {};
const dropped: string[] = [];

function add(id: string, patch: StatPatch) {
  if (Object.keys(patch).length === 0) return;
  const slug = slugById.get(id);
  if (!slug) { dropped.push(id); return; }
  items[slug] = { ...items[slug], ...patch };
}

for (const [id, w] of Object.entries(raw.weapons)) add(id, weaponPatch(w));
for (const [id, a] of Object.entries(raw.ammo)) add(id, ammoPatch(a));
for (const [id, a] of Object.entries(raw.armor)) add(id, armorPatch(a));
for (const [id, t] of Object.entries(turrets.turrets)) add(id, turretPatch(t));

const sorted = Object.fromEntries(Object.keys(items).sort().map((k) => [k, items[k]]));
const artifact: WeaponStatsArtifact = {
  meta: { source: SOURCE, items: Object.keys(sorted).length },
  items: sorted,
};
writeFileSync(join(__dirname, "weapon-stats.json"), JSON.stringify(artifact, null, 2) + "\n");

console.log(`Wrote prisma/weapon-stats.json: ${artifact.meta.items} items.`);
if (dropped.length) console.log(`Dropped ${dropped.length} unmatched datamine id(s): ${dropped.join(", ")}`);
