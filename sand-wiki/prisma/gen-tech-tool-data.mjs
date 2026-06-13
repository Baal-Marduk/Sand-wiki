// Throwaway generator: emits prisma/tech-tree-tool-data.js (window.TECH_DATA) consumed by
// tech-tree-tool.html. Rebuilds the reliable node skeleton from tramplers.json. NOT committed.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(__dirname, "tramplers.json"), "utf-8"));

const ROMAN = { 1: "I", 2: "II", 3: "III", 4: "IV" };
const costStr = (c) => (c && c.length ? c.map((x) => `${x.amount}× ${x.name}`).join(", ") : "—");

function guessFaction(cat, slugs) {
  if (/\bkf-/.test(slugs)) return "kaiser";
  if (cat === "cargo") return "kaiser";
  if (["turrets", "driving", "stations"].includes(cat)) return "landwehr";
  if (["reactors", "engines", "chassis", "crew"].includes(cat)) return "godlewski";
  if (cat === "structure") {
    if (/balcony|deck|frame/.test(slugs)) return "kaiser";
    if (/vestibule/.test(slugs)) return "landwehr";
    return "godlewski";
  }
  return "godlewski";
}

const groups = new Map();
const rootByName = new Map();
for (const v of Object.values(t)) {
  if (!v.researchName) continue;
  if (!v.researchNode) {
    if (!rootByName.has(v.researchName)) rootByName.set(v.researchName, { name: v.researchName, cat: v.category, parts: [] });
    rootByName.get(v.researchName).parts.push({ slug: v.slug, name: v.name, cost: costStr(v.cost) });
    continue;
  }
  const m = v.researchNode.match(/^([IVX]+)\(([a-z])\)$/);
  const letter = m ? m[2] : "?";
  const key = `${v.researchTier}|${letter}|${v.researchName}`;
  if (!groups.has(key)) groups.set(key, { tier: v.researchTier, letter, name: v.researchName, cat: v.category, parts: [] });
  groups.get(key).parts.push({ slug: v.slug, name: v.name, cost: costStr(v.cost) });
}

const factionOf = (name) => (name.includes("Godlewski") ? "godlewski" : name.includes("Kaiser") ? "kaiser" : "landwehr");

const roots = [...rootByName.values()].map((r) => ({
  id: `root:${factionOf(r.name)}`,
  label: r.name,
  faction: factionOf(r.name),
  parts: r.parts,
}));

const nodes = [...groups.values()]
  .sort((a, b) => a.tier - b.tier || a.letter.localeCompare(b.letter) || a.name.localeCompare(b.name))
  .map((n) => ({
    id: `${ROMAN[n.tier]}(${n.letter}) ${n.name}`,
    tier: n.tier,
    letter: n.letter,
    name: n.name,
    cat: n.cat,
    factionGuess: guessFaction(n.cat, n.parts.map((p) => p.slug).join(" ")),
    parts: n.parts,
  }));

// Candidate item-granting nodes read from image 2 (to confirm/edit in the tool).
// gate=true → progression-only node that unlocks nothing (e.g. "Resources").
// itemSlug may hold several comma-separated slugs (a node can unlock multiple items).
const itemNodes = [
  { name: "Energy Rod", tier: 1, faction: "godlewski", itemSlug: "energy-bar", gate: false },
  { name: "Shovel", tier: 2, faction: "godlewski", itemSlug: "treasure-shovel", gate: false },
  { name: "Crafting Materials", tier: 3, faction: "godlewski", itemSlug: "", gate: false },
  { name: "Smokeless Energy Rod", tier: 4, faction: "godlewski", itemSlug: "smokeless-energy-bar", gate: false },
  { name: "MedKit", tier: 1, faction: "godlewski", itemSlug: "med-kit", gate: false },
  { name: "Shotgun Cannon", tier: 1, faction: "kaiser", itemSlug: "game-packed-shotgun-turret-t1-container", gate: false },
  { name: "Auto Cannon", tier: 2, faction: "kaiser", itemSlug: "game-packed-auto-turret-t1-container", gate: false },
  { name: "Cannon", tier: 2, faction: "kaiser", itemSlug: "game-packed-turret-t1-container", gate: false },
  { name: "Autocannon", tier: 3, faction: "kaiser", itemSlug: "game-packed-auto-turret-t2-container", gate: false },
  { name: "Resources", tier: 3, faction: "kaiser", itemSlug: "", gate: true },
  { name: "Weapons", tier: 1, faction: "landwehr", itemSlug: "", gate: false },
  { name: "Armor", tier: 2, faction: "landwehr", itemSlug: "old-jacket-t2", gate: false },
  { name: "Time Bomb", tier: 2, faction: "landwehr", itemSlug: "c4-dynamite", gate: false },
  { name: "Grenade", tier: 3, faction: "landwehr", itemSlug: "grenade-contact", gate: false },
  { name: "Smoke Grenade", tier: 3, faction: "landwehr", itemSlug: "smoke-grenade", gate: false },
  { name: "Improved Ammo", tier: 4, faction: "landwehr", itemSlug: "", gate: false },
];

// Known cost resources (for the tool's autocomplete + name→slug resolution at ingest).
// Crowns is intentionally slug-less (stored like build costs, targetId = null).
const RES_TYPES = new Set(["MONEY", "LARGE_VALUABLE", "SMALL_VALUABLE"]);
const resources = [{ name: "Crowns", slug: "" }];
const dataItems = JSON.parse(readFileSync(join(__dirname, "data.json"), "utf-8")).items || [];
const gearItems = JSON.parse(readFileSync(join(__dirname, "gear.json"), "utf-8"));
for (const it of [...dataItems, ...gearItems]) {
  if (it.slug === "coin-crown") continue; // Crowns handled above (slug-less)
  if (it.isResource || RES_TYPES.has(it.type)) resources.push({ name: it.displayName || it.name, slug: it.slug });
}
resources.sort((a, b) => a.name.localeCompare(b.name));

const data = { roots, nodes, itemNodes, resources };
writeFileSync(join(__dirname, "tech-tree-tool-data.js"), "window.TECH_DATA = " + JSON.stringify(data, null, 2) + ";\n");
console.log(`Wrote tech-tree-tool-data.js: ${roots.length} roots, ${nodes.length} part-nodes, ${itemNodes.length} item-nodes.`);
