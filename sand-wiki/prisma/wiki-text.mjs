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
