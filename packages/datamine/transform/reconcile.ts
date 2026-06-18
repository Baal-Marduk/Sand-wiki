import type { Entity } from "@sandlabs/data";

export type ReconcileStatus = "matched" | "override" | "new";
export interface ReconcileHit { slug: string; status: ReconcileStatus }
export interface ReconcileResult {
  bySekId: Map<string, ReconcileHit>;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Resolve each SEK record {id,name} to a wiki slug:
 *  1) override map (sekId -> slug) wins; 2) exact baseline name match (case-insensitive);
 *  3) else a new slugify(name), deduped against baseline + already-assigned new slugs. */
export function reconcile(
  sek: { id: string; name: string }[],
  baseline: Entity[],
  overrides: Record<string, string>,
): ReconcileResult {
  const byName = new Map(baseline.map((e) => [e.name.toLowerCase(), e.slug]));
  const taken = new Set(baseline.map((e) => e.slug));
  const bySekId = new Map<string, ReconcileHit>();

  for (const rec of sek) {
    const ov = overrides[rec.id];
    if (ov) { bySekId.set(rec.id, { slug: ov, status: "override" }); continue; }
    const named = byName.get((rec.name ?? "").toLowerCase());
    if (named) { bySekId.set(rec.id, { slug: named, status: "matched" }); continue; }
    // new entity: unique slug
    let base = slugify(rec.name || rec.id) || slugify(rec.id);
    let slug = base, n = 1;
    while (taken.has(slug)) { n += 1; slug = `${base}-${n}`; }
    taken.add(slug);
    bySekId.set(rec.id, { slug, status: "new" });
  }
  return { bySekId };
}
