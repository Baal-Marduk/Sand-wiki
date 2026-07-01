/** Canonical site origin, used for metadataBase, sitemap, and robots.
 *  `NEXT_PUBLIC_SITE_URL` is set in production; falls back to localhost for dev so
 *  `new URL()` (metadataBase) never throws on a missing env var. Trailing slash stripped. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

export const SITE_NAME = "Sand Help";

/** Organization + WebSite JSON-LD for the root layout. The WebSite node carries a
 *  SearchAction so Google can surface a sitelinks search box; its target is the
 *  free-text search route (`/items?q=`) that the SearchBox already posts to. */
export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/items?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/** BreadcrumbList JSON-LD from a breadcrumb trail. Relative hrefs resolve against
 *  SITE_URL; the trailing (current-page) crumb has no href, so it lists name +
 *  position only — which Google accepts for the final breadcrumb. */
export function breadcrumbJsonLd(items: { label: string; href?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: new URL(c.href, `${SITE_URL}/`).toString() } : {}),
    })),
  };
}

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
