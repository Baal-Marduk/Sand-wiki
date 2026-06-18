import { byRarityThenName } from "@/lib/rarity";

/** A catalog option the picker can render and link to. `category` feeds ItemIcon's
 *  `categorySlug` fallback; `rarity`/`icon` drive the tile + name color. */
export interface LinkOption {
  slug: string;
  name: string;
  rarity: string | null;
  icon: string | null;
  category: string | null;
}

/** Catalog options matching `query` (case-insensitive substring on name), minus any
 *  slug in `excludeSlugs`, sorted by rarity tier then name. Empty query → all (minus
 *  excluded). Pure — safe to unit test and call from render. */
export function filterLinkOptions(
  options: LinkOption[],
  query: string,
  excludeSlugs: string[],
): LinkOption[] {
  const q = query.trim().toLowerCase();
  const exclude = new Set(excludeSlugs);
  return options
    .filter((o) => !exclude.has(o.slug) && (q === "" || o.name.toLowerCase().includes(q)))
    .sort(byRarityThenName);
}

/** True iff some option's name equals `query` exactly (case-insensitive). Drives whether
 *  the "add as custom / unlinked" fallback row is offered. False for a blank query. */
export function hasExactOptionMatch(options: LinkOption[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return false;
  return options.some((o) => o.name.toLowerCase() === q);
}
