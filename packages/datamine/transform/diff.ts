import type { Entity } from "@sandlabs/data";

export interface EntityDiff {
  added: string[];    // slugs in next but not prev
  removed: string[];  // slugs in prev but not next (slug-safety violation)
  total: { prev: number; next: number };
}

/** Slug-level diff of two entity sets (prev = baseline, next = regenerated). */
export function diffEntities(prev: Entity[], next: Entity[]): EntityDiff {
  const prevSlugs = new Set(prev.map((e) => e.slug));
  const nextSlugs = new Set(next.map((e) => e.slug));
  const added = [...nextSlugs].filter((s) => !prevSlugs.has(s)).sort();
  const removed = [...prevSlugs].filter((s) => !nextSlugs.has(s)).sort();
  return { added, removed, total: { prev: prev.length, next: next.length } };
}
