// One-off importer: scrape Loot Container descriptions from sandgame.wiki (MediaWiki API)
// into prisma/env-content.json keyed by slug.  node prisma/import-env-content.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripWikiMarkup, titleToSlug, parseLootTable } from "./wiki-text.mjs";

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = "https://sandgame.wiki/api.php";

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "User-Agent": "sand-wiki-env/1.0 (one-off import)" } });
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

async function main() {
  // Build a normalized item-name -> slug index (+ overrides), shared with item enrichment.
  const data = JSON.parse(readFileSync(join(__dirname, "data.json"), "utf-8"));
  let overrides = {};
  try { overrides = JSON.parse(readFileSync(join(__dirname, "wiki-overrides.json"), "utf-8")); } catch { /* none */ }
  const index = new Map();
  for (const it of data.items) for (const n of [it.displayName, it.name]) {
    const k = norm(n);
    if (k && !index.has(k)) index.set(k, it.slug);
  }
  const resolveSlug = (name) => overrides[norm(name)] ?? index.get(norm(name));

  const CATS = [
    { wiki: "Loot Container", slug: "loot-containers", loot: true },
    { wiki: "Landmarks", slug: "landmarks", loot: false },
    { wiki: "Gamemodes", slug: "game-modes", loot: false },
  ];
  const out = {};
  const empty = [];
  const unresolved = new Set();
  for (const cat of CATS) {
    const titles = await members(cat.wiki);
    for (const title of titles) {
      const wt = await wikitext(title);
      const description = stripWikiMarkup(wt);
      const slug = titleToSlug(title);
      if (out[slug]) { console.warn(`Slug collision "${slug}" (${title}) — keeping first`); continue; }
      if (!description) empty.push(title);
      out[slug] = {
        category: cat.slug,
        name: title,
        description,
        sourceUrl: "https://sandgame.wiki/index.php/" + encodeURIComponent(title.replace(/ /g, "_")),
      };
      if (cat.loot) {
        const tiers = parseLootTable(wt, title).map((t) => ({
          tier: t.tier,
          columns: t.columns,
          entries: t.entries.map((e) => {
            const itemSlug = resolveSlug(e.name);
            if (!itemSlug) unresolved.add(e.name);
            return itemSlug ? { slug: itemSlug, name: e.name, values: e.values } : { name: e.name, values: e.values };
          }),
        }));
        if (tiers.length) out[slug].loot = { tiers };
        const entryCount = tiers.reduce((n, t) => n + t.entries.length, 0);
        console.log(`  ${title}: ${tiers.length} tiers, ${entryCount} entries`);
      }
    }
    console.log(`[${cat.slug}] ${titles.length} pages`);
  }
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeFileSync(join(__dirname, "env-content.json"), JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(sorted).length} env entities. Empty descriptions: ${empty.join(", ") || "none"}`);
  if (unresolved.size) console.log(`Unresolved loot items: ${[...unresolved].join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
