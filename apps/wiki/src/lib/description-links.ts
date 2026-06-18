export type Segment =
  | { type: "text"; value: string }
  | { type: "link"; slug: string; label?: string };

// Label may itself contain "|" (only the FIRST pipe splits slug from label); an
// empty/whitespace-only label group doesn't match, so [[slug|]] stays literal.
// [[slug]] or [[slug|label]] — slug excludes ] and |; label excludes ].
const LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Split one paragraph of text into text and item-link segments. A link's slug
 *  and explicit label are trimmed; an empty slug isn't a link (stays literal). */
export function parseDescription(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const slug = m[1].trim();
    if (slug === "") continue; // defensive; the regex already requires ≥1 char
    const start = m.index!;
    if (start > last) segments.push({ type: "text", value: text.slice(last, start) });
    const label = m[2]?.trim();
    segments.push(label ? { type: "link", slug, label } : { type: "link", slug });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments.length ? segments : [{ type: "text", value: text }];
}

/** Unique link slugs, in first-seen order. */
export function collectSlugs(segments: Segment[]): string[] {
  const seen = new Set<string>();
  for (const s of segments) if (s.type === "link") seen.add(s.slug);
  return [...seen];
}
