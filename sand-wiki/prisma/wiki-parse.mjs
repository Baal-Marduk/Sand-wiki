// Pure wikitext parsing for the SAND weapons infobox. No I/O — unit-tested.

/** Split a template body on top-level "|" (not inside nested {{}} or [[]]). */
export function splitTopLevel(body) {
  const parts = [];
  let buf = "", depthC = 0, depthB = 0;
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "{{") { depthC++; buf += two; i++; continue; }
    if (two === "}}") { depthC--; buf += two; i++; continue; }
    if (two === "[[") { depthB++; buf += two; i++; continue; }
    if (two === "]]") { depthB--; buf += two; i++; continue; }
    if (body[i] === "|" && depthC === 0 && depthB === 0) { parts.push(buf); buf = ""; continue; }
    buf += body[i];
  }
  parts.push(buf);
  return parts;
}

/** Parse "k = v" params from a template body into a lowercased-key map. */
export function parseTemplateParams(body) {
  const out = {};
  for (const part of splitTopLevel(body)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/** Pull an item display name from an Ammo field value:
 *  {{Icon|key|3=Name|...}}, [[Name]], or [[Target|Name]]. */
export function extractAmmoName(raw) {
  if (!raw) return null;
  const icon = raw.match(/\{\{Icon\b([\s\S]*?)\}\}/i);
  if (icon) {
    const p = parseTemplateParams(icon[1]);
    if (p["3"]) return p["3"];
  }
  const link = raw.match(/\[\[([^\]]+)\]\]/);
  if (link) {
    const inner = link[1].split("|");
    return (inner[1] || inner[0]).trim();
  }
  return null;
}

const num = (v) => {
  if (v == null) return null;
  if (!/\d/.test(String(v))) return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const clean = (v) =>
  v == null ? null : v.replace(/'''/g, "").replace(/\[\[|\]\]/g, "").trim() || null;

/** Find every {{Weapons|...}} block (brace-matched) and map to a normalized entry. */
export function parseWeaponInfoboxes(wikitext) {
  const out = [];
  const re = /\{\{Weapons\b/gi;
  let m;
  while ((m = re.exec(wikitext))) {
    let i = m.index + 2, depth = 1, body = "";
    while (i < wikitext.length && depth > 0) {
      const two = wikitext.slice(i, i + 2);
      if (two === "{{") { depth++; body += two; i += 2; continue; }
      if (two === "}}") { depth--; if (depth === 0) { i += 2; break; } body += two; i += 2; continue; }
      body += wikitext[i]; i++;
    }
    re.lastIndex = i;
    const p = parseTemplateParams(body);
    out.push({
      name: clean(p["name"]),
      rarity: clean(p["rarity"]),
      type: clean(p["type"]),
      magazine: num(p["mag"]),
      damage: num(p["damage"]),
      value: num(p["value"]),
      ammoName: extractAmmoName(p["ammo"] || ""),
    });
  }
  return out;
}
