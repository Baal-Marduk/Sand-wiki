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
    const parts = inner.split("|");
    return (parts[parts.length - 1] || "").replace(/^:?Category:/i, "").trim();
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
