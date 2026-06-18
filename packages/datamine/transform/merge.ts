import type { Entity, LocalizedText } from "@sandlabs/data";
import type { SekItem } from "./sek";
import type { ReconcileHit } from "./reconcile";
import { sekItemPatch, newItemEntity } from "./items";

export interface MissingEntry { slug: string; name: string; kind: string }
export interface MergeItemsResult { entities: Entity[]; missing: MissingEntry[] }

/** Merge SEK items over the baseline ITEMS:
 *  - matched/override slug -> apply datamine patch over the baseline entity (datamine wins
 *    per provided field; baseline kept otherwise) + attach i18n;
 *  - new -> append a new Entity (+ i18n);
 *  - baseline items with no SEK match -> kept unchanged + recorded in `missing`.
 *  Non-item baseline entities are passed through untouched (other kinds merge elsewhere). */
export function mergeItems(
  baseline: Entity[],
  sekItems: SekItem[],
  bySekId: Map<string, ReconcileHit>,
  i18nBySlug: Map<string, Record<string, LocalizedText>>,
): MergeItemsResult {
  const bySlug = new Map(baseline.map((e) => [e.slug, e]));
  const matchedSlugs = new Set<string>();
  const additions: Entity[] = [];

  const applyI18n = (e: Entity): Entity => {
    const i = i18nBySlug.get(e.slug);
    return i ? { ...e, i18n: i } : e;
  };

  for (const it of sekItems) {
    const hit = bySekId.get(it.id);
    if (!hit) continue;
    if (hit.status === "new") {
      additions.push(applyI18n(newItemEntity(hit.slug, it)));
      continue;
    }
    const base = bySlug.get(hit.slug);
    if (!base) { // override/matched pointing at a missing slug -> treat as new
      additions.push(applyI18n(newItemEntity(hit.slug, it)));
      continue;
    }
    matchedSlugs.add(hit.slug);
    bySlug.set(hit.slug, applyI18n({ ...base, ...sekItemPatch(it) }));
  }

  const missing: MissingEntry[] = baseline
    .filter((e) => e.kind === "item" && !matchedSlugs.has(e.slug))
    .map((e) => ({ slug: e.slug, name: e.name, kind: e.kind }));

  // Reassemble: baseline order preserved (with refreshed values), then new additions.
  const entities = baseline.map((e) => bySlug.get(e.slug)!).concat(additions);
  return { entities, missing };
}
