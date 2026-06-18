/** Canonical site origin, used for metadataBase, sitemap, and robots.
 *  `NEXT_PUBLIC_SITE_URL` is set in production; falls back to localhost for dev so
 *  `new URL()` (metadataBase) never throws on a missing env var. Trailing slash stripped. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

export const SITE_NAME = "Sand Help";

/** Clamp a description to a meta-tag-friendly length (~160 chars) on a word boundary,
 *  falling back to `fallback` when the source text is empty. */
export function metaDescription(text: string | null | undefined, fallback: string): string {
  const t = text?.trim();
  if (!t) return fallback;
  if (t.length <= 160) return t;
  const cut = t.slice(0, 160);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
