import type { Store } from "./store";
import type { Entity, EntityLink, Recipe } from "./types";

export function getEntity(s: Store, slug: string): Entity | null {
  return s.bySlug.get(slug) ?? null;
}

export function listByKind(s: Store, kind: string): Entity[] {
  return s.byKind.get(kind) ?? [];
}

export function listByCategory(s: Store, kind: string, category: string): Entity[] {
  return listByKind(s, kind).filter((e) => e.category === category);
}

/** Count of enabled entities per category for one kind (mirrors the old groupBy). */
export function categoryCounts(s: Store, kind: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of listByKind(s, kind)) {
    if (e.disabled) continue;
    out[e.category] = (out[e.category] ?? 0) + 1;
  }
  return out;
}

/** Outgoing links from `slug` whose role is in `roles`, sorted by sortOrder. */
export function outgoingLinks(s: Store, slug: string, roles: string[]): EntityLink[] {
  const set = new Set(roles);
  return (s.linksFrom.get(slug) ?? [])
    .filter((l) => set.has(l.role))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Incoming links pointing at `slug` whose role is in `roles`. Unsorted (callers sort). */
export function incomingLinks(s: Store, slug: string, roles: string[]): EntityLink[] {
  const set = new Set(roles);
  return (s.linksTo.get(slug) ?? []).filter((l) => set.has(l.role));
}

export function recipesProducing(s: Store, slug: string): Recipe[] {
  return s.recipesByOutput.get(slug) ?? [];
}
export function recipesUsing(s: Store, slug: string): Recipe[] {
  return s.recipesByInput.get(slug) ?? [];
}
export function recipesAtLocation(s: Store, slug: string): Recipe[] {
  return (s.recipesByLocation.get(slug) ?? []).slice().sort((a, b) => a.slug.localeCompare(b.slug));
}

/** True iff the slug exists and is not disabled. Used for cross-ref scrubbing. */
export function isEntityEnabled(s: Store, slug: string): boolean {
  const e = s.bySlug.get(slug);
  return !!e && !e.disabled;
}

export function entityPaths(s: Store): { slug: string; kind: string }[] {
  const kinds = new Set(["item", "environment", "trampler-part"]);
  return s.entities
    .filter((e) => kinds.has(e.kind) && !e.disabled)
    .map((e) => ({ slug: e.slug, kind: e.kind }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
