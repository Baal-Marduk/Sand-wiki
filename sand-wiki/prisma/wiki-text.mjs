// Pure helpers for turning a wiki page into a clean lead description. No I/O — unit-tested.

/** Remove all {{...}} templates (brace-matched, nesting-safe). */
function stripTemplates(s) {
  let out = "", depth = 0;
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "{{") { depth++; i++; continue; }
    if (two === "}}") { if (depth > 0) depth--; i++; continue; }
    if (depth === 0) out += s[i];
  }
  return out;
}

/** Lead section (before the first ==heading==) of a wiki page, as clean plain text. */
export function stripWikiMarkup(wikitext) {
  if (!wikitext) return "";
  const lead = wikitext.split(/(?:^|\n)=={1,}/)[0] ?? "";
  let s = stripTemplates(lead);
  s = s.replace(/<[^>]+>/g, " ");                    // html / tabber tags
  s = s.replace(/\{\|[\s\S]*?\|\}/g, " ");           // stray wikitables
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => { // [[a|b]] -> b, [[a]] -> a
    const t = inner.trim();
    if (/^:?\s*(File|Image)\s*:/i.test(t)) return ""; // file/image embeds
    if (/^Category\s*:/i.test(t)) return "";          // bare category tag (no leading colon)
    const parts = inner.split("|");
    return (parts[parts.length - 1] || "").replace(/^:?\s*Category\s*:/i, "").trim();
  });
  s = s.replace(/'''?/g, "");                         // bold / italic
  s = s.replace(/[ \t]+/g, " ").replace(/ *\n+ */g, "\n").trim();
  return s;
}

/** Kebab-case a page title into a slug. */
export function titleToSlug(title) {
  return (title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const TIER_ORDER = ["Normal", "Rare", "Very Rare"];

/** Item rows of a tier chunk: each {{Icon|…}} with the bold values that follow it
 *  (before the next icon) as its column values. Falls back to the Icon key when no 3=. */
function lootEntriesFromChunk(chunk) {
  const re = /\{\{Icon\|([\s\S]*?)\}\}/g;
  const icons = [];
  let m;
  while ((m = re.exec(chunk))) {
    const parts = m[1].split("|");
    let name = null;
    for (const p of parts.slice(1)) {
      const mm = p.match(/^\s*3\s*=\s*([\s\S]+)$/);
      if (mm) name = mm[1].trim();
    }
    if (!name) name = (parts[0] || "").trim();
    icons.push({ name, start: m.index, end: re.lastIndex });
  }
  const entries = [];
  for (let i = 0; i < icons.length; i++) {
    const segEnd = i + 1 < icons.length ? icons[i + 1].start : chunk.length;
    const seg = chunk.slice(icons[i].end, segEnd);
    const values = [...seg.matchAll(/'''([^']+?)'''/g)].map((x) => x[1].trim());
    entries.push({ name: icons[i].name, values });
  }
  return entries;
}

/** Column header labels of a tier chunk (text after the last "|" on each "!" cell), minus "Item". */
function lootColumns(chunk) {
  const cols = [];
  for (const line of chunk.split("\n")) {
    if (!line.startsWith("!")) continue;
    for (const cell of line.split("!!")) {
      const c = cell.replace(/^!+/, "");
      const pipe = c.lastIndexOf("|");
      const label = (pipe >= 0 ? c.slice(pipe + 1) : c).trim();
      if (label && label.toLowerCase() !== "item") cols.push(label);
    }
  }
  return cols;
}

/** Parse the ==Loot Table== tabber into tiers with dynamic columns + item entries. */
export function parseLootTable(wikitext, crateName) {
  if (!wikitext) return [];
  const idx = wikitext.search(/==+\s*Loot Table/i);
  if (idx < 0) return [];
  const tb = wikitext.slice(idx).match(/<tabber>([\s\S]*?)<\/tabber>/i);
  if (!tb) return [];
  const tiers = [];
  for (const chunk of tb[1].split(/\n\|-\|\n/)) {
    const labelMatch = chunk.match(/^\s*([^\n=]+?)=/);
    if (!labelMatch) continue;
    const tier = labelMatch[1].replace(crateName, "").trim();
    if (!tier) continue;
    tiers.push({ tier, columns: lootColumns(chunk), entries: lootEntriesFromChunk(chunk) });
  }
  tiers.sort((a, b) => {
    const ia = TIER_ORDER.indexOf(a.tier), ib = TIER_ORDER.indexOf(b.tier);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return tiers;
}

/** Parse a {{Module}} infobox into a flat { key: value } map. Line-based: collects
 *  `| key = value` lines until the closing `}}` on its own line, so inline templates
 *  in a value (e.g. {{Tag Tier2}}) are preserved. Returns {} if no Module block. */
export function parseModule(wikitext) {
  if (!wikitext) return {};
  const start = wikitext.indexOf("{{Module");
  if (start < 0) return {};
  const lines = wikitext.slice(start).split("\n");
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\}\}/.test(line)) break;
    const m = line.match(/^\s*\|\s*([^=]+?)\s*=\s*(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

/** The four ordered cost slots of the {{Module}} infobox, by resource name.
 *  cost 1 is the Crowns currency (no item slug); 2-4 are craftable resources. */
const COST_SLOTS = [
  { field: "cost 1", name: "Crowns" },
  { field: "cost 2", name: "Mechanical Parts" },
  { field: "cost 3", name: "Pneumatic Parts" },
  { field: "cost 4", name: "Computing Module" },
];

/** Build a [{ slug?, name, amount }] cost array from Module fields, dropping zero/blank
 *  amounts. `resolve(name)` returns an item slug or undefined; Crowns stays slug-less. */
export function parseCost(fields, resolve) {
  const out = [];
  for (const { field, name } of COST_SLOTS) {
    const amount = Number(fields[field]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const slug = name === "Crowns" ? undefined : resolve(name);
    out.push(slug ? { slug, name, amount } : { name, amount });
  }
  return out;
}

/** Parse `research = II(b). Middling Chassis {{Tag TierN}}` into { node, name, tier }.
 *  Roman-numeral node prefixes (I, II(b), …) are split off; dotted root names
 *  (e.g. "K.K. Landwehr") have no node and stay whole. */
export function parseResearch(value) {
  if (!value) return { node: null, name: null, tier: null };
  const tierMatch = value.match(/\{\{\s*Tag\s+Tier(\d+)\s*\}\}/i);
  const tier = tierMatch ? Number(tierMatch[1]) : null;
  const text = value.replace(/\{\{[^}]*\}\}/g, "").trim();
  const nodeMatch = text.match(/^([IVX]+(?:\([a-z]\))?)\.\s+(.*)$/);
  if (nodeMatch) return { node: nodeMatch[1], name: nodeMatch[2].trim(), tier };
  return { node: null, name: text || null, tier };
}
