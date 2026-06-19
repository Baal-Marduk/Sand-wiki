import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Recipe, RecipeLineRow } from "@sandlabs/data";
import type { ReconcileHit } from "./reconcile";
import { canonicalSekId } from "./variants";

const SEK = resolve(import.meta.dirname, "../sek-out");

export interface RawLine { item: string; amount: number }
export interface RawRecipe { workbench: string | null; tier: number | null; inputs: RawLine[]; outputs: RawLine[]; seconds: number | null }

/** sek-out/recipes.json (crafting). Empty when absent → merge keeps the baseline recipes. */
export function loadRecipes(dir = SEK): RawRecipe[] {
  const p = resolve(dir, "recipes.json");
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf-8")) as RawRecipe[];
}

export interface RecipesResult { recipes: Recipe[]; missing: { slug: string }[] }

const mapLines = (lines: RawLine[], bySekId: Map<string, ReconcileHit>): RecipeLineRow[] =>
  lines
    .map((l) => { const h = bySekId.get(canonicalSekId(l.item)); return h ? { itemSlug: h.slug, amount: l.amount } : null; })
    .filter((x): x is RecipeLineRow => x !== null);

/** Content signature for matching a datamined recipe to a baseline recipe (workbench+tier+sorted
 *  input/output slugs+amounts) — independent of slug, so baseline slugs stay stable. */
function signature(workbench: string | null, tier: number | null, inputs: RecipeLineRow[], outputs: RecipeLineRow[]): string {
  const part = (rows: RecipeLineRow[]) => rows.map((r) => `${r.itemSlug}:${r.amount}`).sort().join(",");
  return `${(workbench ?? "").toLowerCase()}|t${tier ?? 0}|out=${part(outputs)}|in=${part(inputs)}`;
}

/** Merge datamined crafting recipes over the baseline:
 *  - match by content signature → refresh fields in place, KEEP the baseline slug;
 *  - unmatched datamined recipe → new entry, slug = primary output slug (deduped -2/-3);
 *  - recipe with no resolvable output → skipped;
 *  - baseline recipes not produced by the datamine (location recipes, uncovered crafts) → kept
 *    and listed in `missing`. */
export function mergeRecipes(baseline: Recipe[], raws: RawRecipe[], bySekId: Map<string, ReconcileHit>): RecipesResult {
  const baseBySig = new Map(baseline.map((r) => [signature(r.workbench, r.tier, r.inputs, r.outputs), r]));
  const taken = new Set(baseline.map((r) => r.slug));
  const result = new Map(baseline.map((r) => [r.slug, r]));
  const matchedSlugs = new Set<string>();

  for (const raw of raws) {
    const inputs = mapLines(raw.inputs, bySekId);
    const outputs = mapLines(raw.outputs, bySekId);
    if (outputs.length === 0) continue;
    const sig = signature(raw.workbench, raw.tier, inputs, outputs);
    const existing = baseBySig.get(sig);
    if (existing) {
      result.set(existing.slug, { ...existing, workbench: raw.workbench, tier: raw.tier, craftTimeSeconds: raw.seconds, inputs, outputs });
      matchedSlugs.add(existing.slug);
      continue;
    }
    let base = outputs[0].itemSlug, slug = base, n = 1;
    while (taken.has(slug)) { n += 1; slug = `${base}-${n}`; }
    taken.add(slug);
    result.set(slug, { slug, workbench: raw.workbench, tier: raw.tier, craftTimeSeconds: raw.seconds, locationSlug: null, inputs, outputs });
  }

  const missing = baseline.filter((r) => !matchedSlugs.has(r.slug)).map((r) => ({ slug: r.slug }));
  return { recipes: [...result.values()], missing };
}
