// Builds the static builder part maps consumed by the Trampler Builder:
//   - part_tech.json  : compId -> {node, name}  (the "Match my tech tree" switch
//                        + the locker tech-tree link buttons)
//   - part_icons.json : compId -> wiki 2D icon path (/tramplers/walker_<id>_icon.png),
//                        so the locker shows the real game icons, not the 3D renders.
//
// Chain (all from the static @sandlabs/data export, no DB at runtime):
//   1. builder part id (e.g. compArmor_Framed_Metal_1x1) -> wiki entity,
//      via the entity icon path which embeds the comp id: walker_<compId>_icon.png
//   2. entity slug -> unlocking tech-node slug, via the `tech-unlocks` EntityLink
//      (sourceSlug = node, targetSlug = part). The node slug is what /tech?select= uses.
//
// Re-run after a game-data refresh:  node scripts/build-part-tech.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const dataDir = join(repoRoot, "packages", "data", "generated");
const builderData = join(here, "..", "src", "components", "builder", "data");
const techFile = join(builderData, "part_tech.json");
const iconFile = join(builderData, "part_icons.json");

const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const entities = read("entities.json");
const links = read("links.json");
const parts = JSON.parse(readFileSync(join(builderData, "parts_v2.json"), "utf8")).parts;

// 1. comp id -> entity slug + icon path  +  node slug -> display name
const compToSlug = {};
const compToIcon = {};
const nodeName = {};
for (const e of entities) {
  if (e.kind === "tech-node") nodeName[e.slug] = e.name;
  const m = (e.icon || "").match(/walker_(comp[A-Za-z0-9_]+)_icon/i);
  if (m) {
    compToSlug[m[1]] = e.slug;
    compToIcon[m[1]] = e.icon; // /tramplers/walker_<compId>_icon.png (served from public/)
  }
}

// 2. part slug -> unlocking node slug
const slugToNode = {};
for (const l of links) if (l.role === "tech-unlocks") slugToNode[l.targetSlug] = l.sourceSlug;

const tech = {};
const icons = {};
for (const p of parts) {
  if (typeof p.id !== "string" || p.id.endsWith("_mirror")) continue;
  if (compToIcon[p.id]) icons[p.id] = compToIcon[p.id];
  const slug = compToSlug[p.id];
  if (!slug) continue;
  const node = slugToNode[slug];
  if (node) tech[p.id] = { node, name: nodeName[node] ?? null }; // gated; base parts skipped
}

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(techFile, JSON.stringify(sortKeys(tech), null, 2) + "\n");
writeFileSync(iconFile, JSON.stringify(sortKeys(icons), null, 2) + "\n");
console.log(`wrote ${Object.keys(tech).length} tech-gated parts -> ${techFile}`);
console.log(`wrote ${Object.keys(icons).length} part icons -> ${iconFile}`);
