// One-off importer: scrape rarity + weapon stats from sandgame.wiki (MediaWiki API)
// and emit prisma/wiki-enrichment.json keyed by our item slug.
//
//   node prisma/import-wiki-enrichment.mjs
//
// Re-run to refresh. Matches wiki infobox "Name" to our item displayName/name by
// alphanumeric-only normalization, with prisma/wiki-overrides.json for misses.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseInfoboxes } from "./wiki-parse.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = "https://sandgame.wiki/api.php";
// All item-bearing categories. Pages parse {{Weapons}}, {{Ammo}}, or {{Items}} infoboxes.
const CATEGORIES = [
  "Weapons", "Player_Weapons", "Mounted_Weapons",
  "Ammunition", "Mounted_Weapon_Ammunition", "Throwables",
  "Consumables", "Research_Components", "Crafting_Components",
  "Carryable_Objects", "Player_Gear", "Valuables", "Key",
];

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "User-Agent": "sand-wiki-enrichment/1.0 (one-off import)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
  return r.json();
}

async function categoryMembers(cat) {
  const out = [];
  let cont = {};
  do {
    const d = await api({ action: "query", list: "categorymembers", cmtitle: `Category:${cat}`, cmlimit: "500", format: "json", ...cont });
    out.push(...(d.query?.categorymembers ?? []).filter((m) => m.ns === 0).map((m) => m.title));
    cont = d.continue ? { cmcontinue: d.continue.cmcontinue } : null;
  } while (cont);
  return out;
}

async function wikitext(title) {
  const d = await api({ action: "parse", page: title, prop: "wikitext", format: "json", formatversion: "2", redirects: "1" });
  return d?.parse?.wikitext ?? "";
}

async function main() {
  const data = JSON.parse(readFileSync(join(__dirname, "data.json"), "utf-8"));
  let overrides = {};
  try { overrides = JSON.parse(readFileSync(join(__dirname, "wiki-overrides.json"), "utf-8")); } catch { /* none yet */ }

  // Name index: normalized displayName/name -> { slug, displayName }
  const index = new Map();
  for (const it of data.items) {
    for (const n of [it.displayName, it.name]) {
      const k = norm(n);
      if (k && !index.has(k)) index.set(k, { slug: it.slug, displayName: it.displayName ?? it.name });
    }
  }
  const resolve = (name) => {
    const k = norm(name);
    if (overrides[k]) {
      const it = data.items.find((i) => i.slug === overrides[k]);
      return it ? { slug: it.slug, displayName: it.displayName ?? it.name } : null;
    }
    return index.get(k) ?? null;
  };

  const titles = [...new Set((await Promise.all(CATEGORIES.map(categoryMembers))).flat())];
  console.log(`Scanning ${titles.length} pages across ${CATEGORIES.join(", ")}…`);

  const enrichment = {};
  const unmatched = [];
  const ammoUnresolved = new Set();
  let entryCount = 0;

  for (const title of titles) {
    const wt = await wikitext(title);
    for (const e of parseInfoboxes(wt)) {
      if (!e.name) continue;
      entryCount++;
      const item = resolve(e.name);
      if (!item) { unmatched.push(`${e.name}  (page: ${title})`); continue; }
      if (enrichment[item.slug]) continue; // cross-listed variant already captured

      const stats = {};
      if (e.type) stats.type = e.type;
      if (e.damage != null) stats.damage = e.damage;
      if (e.pDamage != null) stats.pDamage = e.pDamage;
      if (e.tDamage != null) stats.tDamage = e.tDamage;
      if (e.sDamage != null) stats.sDamage = e.sDamage;
      if (e.magazine != null) stats.magazine = e.magazine;
      if (e.value != null) stats.value = e.value;
      if (e.ammoName) {
        const ammo = resolve(e.ammoName);
        if (ammo) { stats.ammoSlug = ammo.slug; stats.ammoName = ammo.displayName; }
        else ammoUnresolved.add(e.ammoName);
      }
      enrichment[item.slug] = {};
      if (e.rarity) enrichment[item.slug].rarity = e.rarity;
      if (Object.keys(stats).length) enrichment[item.slug].stats = stats;
    }
  }

  const sorted = Object.fromEntries(Object.keys(enrichment).sort().map((k) => [k, enrichment[k]]));
  writeFileSync(join(__dirname, "wiki-enrichment.json"), JSON.stringify(sorted, null, 2) + "\n");

  const rarities = [...new Set(Object.values(enrichment).map((e) => e.rarity).filter(Boolean))];
  console.log(`\nEntries parsed: ${entryCount}`);
  console.log(`Matched items:  ${Object.keys(enrichment).length}`);
  console.log(`Rarities seen:  ${JSON.stringify(rarities)}`);
  console.log(`\nUnmatched wiki entries (${unmatched.length}) — add real ones to wiki-overrides.json:`);
  for (const u of unmatched) console.log(`  - ${u}`);
  if (ammoUnresolved.size) {
    console.log(`\nAmmo names not resolved to an item (${ammoUnresolved.size}):`);
    for (const a of ammoUnresolved) console.log(`  - ${a}`);
  }
  console.log(`\nWrote prisma/wiki-enrichment.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
