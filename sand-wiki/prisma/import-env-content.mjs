// One-off importer: scrape Loot Container descriptions from sandgame.wiki (MediaWiki API)
// into prisma/env-content.json keyed by slug.  node prisma/import-env-content.mjs
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripWikiMarkup, titleToSlug } from "./wiki-text.mjs";

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
  const titles = await members("Loot Container");
  const out = {};
  const empty = [];
  for (const title of titles) {
    const description = stripWikiMarkup(await wikitext(title));
    const slug = titleToSlug(title);
    if (!description) empty.push(title);
    out[slug] = {
      category: "loot-containers",
      name: title,
      description,
      sourceUrl: "https://sandgame.wiki/index.php/" + encodeURIComponent(title.replace(/ /g, "_")),
    };
  }
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeFileSync(join(__dirname, "env-content.json"), JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(sorted).length} loot containers. Empty descriptions: ${empty.join(", ") || "none"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
