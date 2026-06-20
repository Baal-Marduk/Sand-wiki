// Builds the absolute, shareable URL for a published design's view page.
// `origin` is e.g. "https://sandhelp.example" (server) or window.location.origin
// (client). Trailing slashes on the origin are trimmed so the path joins cleanly.
export function designShareUrl(slug: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/builder/${slug}`;
}
