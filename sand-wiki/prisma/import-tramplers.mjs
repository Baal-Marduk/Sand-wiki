// One-off importer: scrape Trampler Component pages from sandgame.wiki into
// prisma/tramplers.json (slug-keyed) and download module images into public/tramplers/.
//   node prisma/import-tramplers.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripWikiMarkup, titleToSlug, parseModule, parseResearch, parseCost } from "./wiki-text.mjs";
import { tramplerCategoryForName } from "../src/lib/taxonomy.ts";

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const __dirname = dirname(fileURLToPath(import.meta.url));
const API = "https://sandgame.wiki/api.php";
const CATEGORY = "Trampler Components";

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "User-Agent": "sand-wiki-tramplers/1.0 (one-off import)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function members(cat) {
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

// Resolve a File: page to its original URL, download it to public/tramplers/<slug>.png.
async function downloadImage(imageField, slug, dir) {
  if (!imageField) return undefined;
  const d = await api({ action: "query", titles: `File:${imageField}`, prop: "imageinfo", iiprop: "url", format: "json", formatversion: "2" });
  const url = d?.query?.pages?.[0]?.imageinfo?.[0]?.url;
  if (!url) return undefined;
  const r = await fetch(url, { headers: { "User-Agent": "sand-wiki-tramplers/1.0 (one-off import)" } });
  if (!r.ok) return undefined;
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(join(dir, `${slug}.png`), buf);
  return `/tramplers/${slug}.png`;
}

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
};

async function main() {
  // Name -> item slug index (shared resolver with item/env import).
  const data = JSON.parse(readFileSync(join(__dirname, "data.json"), "utf-8"));
  let overrides = {};
  try { overrides = JSON.parse(readFileSync(join(__dirname, "wiki-overrides.json"), "utf-8")); } catch { /* none */ }
  const index = new Map();
  for (const it of data.items) for (const n of [it.displayName, it.name]) {
    const k = norm(n);
    if (k && !index.has(k)) index.set(k, it.slug);
  }
  const resolveSlug = (name) => overrides[norm(name)] ?? index.get(norm(name));

  const imgDir = join(__dirname, "..", "public", "tramplers");
  if (!existsSync(imgDir)) mkdirSync(imgDir, { recursive: true });

  const titles = await members(CATEGORY);
  const out = {};
  const catCounts = {};
  const unresolvedCost = new Set();
  const noImage = [];

  for (const title of titles) {
    const wt = await wikitext(title);
    const m = parseModule(wt);
    const slug = titleToSlug(title);
    const category = tramplerCategoryForName(title);
    catCounts[category] = (catCounts[category] ?? 0) + 1;
    const research = parseResearch(m.research);
    const cost = parseCost(m, resolveSlug);
    for (const c of cost) if (!c.slug && c.name !== "Crowns") unresolvedCost.add(c.name);
    const icon = await downloadImage(m.image, slug, imgDir);
    if (!icon) noImage.push(title);

    out[slug] = {
      slug, name: m.name || title, category,
      description: stripWikiMarkup(wt) || undefined,
      icon, sourceUrl: "https://sandgame.wiki/index.php/" + encodeURIComponent(title.replace(/ /g, "_")),
      dimensions: m.dimensions || undefined,
      health: toInt(m.health),
      weight: toInt(m.weight),
      weightCapacity: toInt(m.weight_capacity),
      weightCompensation: toInt(m.weight_compensation),
      energyConsumption: toInt(m.energy_consumption),
      energyCapacity: toInt(m.energy_capacity),
      ratedPower: toInt(m.rated_power),
      crewSlots: toInt(m.crew_slots),
      itemSlots: toInt(m.item_slots),
      researchNode: research.node ?? undefined,
      researchName: research.name ?? undefined,
      researchTier: research.tier ?? undefined,
      cost: cost.length ? cost : undefined,
    };
    console.log(`  ${title} -> ${category}${icon ? "" : " (no image)"}`);
  }

  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeFileSync(join(__dirname, "tramplers.json"), JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(sorted).length} trampler parts.`);
  console.log(`Per category: ${JSON.stringify(catCounts)}`);
  if (unresolvedCost.size) console.log(`Unresolved cost items: ${[...unresolvedCost].join(", ")}`);
  if (noImage.length) console.log(`No image: ${noImage.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
