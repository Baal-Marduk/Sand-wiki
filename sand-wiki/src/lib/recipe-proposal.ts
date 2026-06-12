export interface RecipeLineDraft {
  slug: string;
  name: string;
  amount: number;
}

export interface RecipeSnapshot {
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  inputs: RecipeLineDraft[];
  outputs: RecipeLineDraft[];
}

/** Stored shape of a recipe_edit proposal's `changes` JSON. */
export interface RecipeProposalChange {
  old: RecipeSnapshot;
  new: RecipeSnapshot;
}

/** A recipe row with its inputs/outputs and the related item's slug+name. */
interface RawRecipe {
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  inputs: { amount: number; item: { slug: string; name: string } }[];
  outputs: { amount: number; item: { slug: string; name: string } }[];
}

const toLine = (x: { amount: number; item: { slug: string; name: string } }): RecipeLineDraft => ({
  slug: x.item.slug,
  name: x.item.name,
  amount: x.amount,
});

/** Flatten a loaded recipe (with included items) into a comparable snapshot. */
export function recipeToSnapshot(r: RawRecipe): RecipeSnapshot {
  return {
    workbench: r.workbench,
    tier: r.tier,
    craftTimeSeconds: r.craftTimeSeconds,
    inputs: r.inputs.map(toLine),
    outputs: r.outputs.map(toLine),
  };
}

export interface ParsedLines {
  lines: RecipeLineDraft[];
  error: string | null;
}

/** Pair index-aligned slug/amount arrays into validated lines. Blank rows (no
 *  slug) are dropped. Returns an error if a kept row has an unknown slug, a
 *  non-positive / non-integer amount, or a slug that appears more than once. */
export function parseRecipeLines(
  slugs: string[],
  amounts: string[],
  nameBySlug: Map<string, string>,
): ParsedLines {
  const lines: RecipeLineDraft[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < slugs.length; i++) {
    const slug = (slugs[i] ?? "").trim();
    if (slug === "") continue;
    const name = nameBySlug.get(slug);
    if (!name) return { lines: [], error: `Unknown item: ${slug}` };
    const n = Number((amounts[i] ?? "").trim());
    if (!Number.isInteger(n) || n <= 0) {
      return { lines: [], error: `Amount for ${name} must be a positive whole number.` };
    }
    if (seen.has(slug)) return { lines: [], error: `${name} is listed twice.` };
    seen.add(slug);
    lines.push({ slug, name, amount: n });
  }
  return { lines, error: null };
}

const linesEqual = (a: RecipeLineDraft[], b: RecipeLineDraft[]): boolean =>
  a.length === b.length && a.every((l, i) => l.slug === b[i].slug && l.amount === b[i].amount);

/** True when two snapshots match on meta and lines. Line comparison is
 *  ORDER-SENSITIVE (positional): callers must keep both lists in the same order
 *  (the stored order) or a pure reordering reads as a change. */
export function snapshotsEqual(a: RecipeSnapshot, b: RecipeSnapshot): boolean {
  return (
    a.workbench === b.workbench &&
    a.tier === b.tier &&
    a.craftTimeSeconds === b.craftTimeSeconds &&
    linesEqual(a.inputs, b.inputs) &&
    linesEqual(a.outputs, b.outputs)
  );
}

export interface RecipeLineCreate {
  itemId: string;
  amount: number;
}

/** Resolve draft lines to {itemId, amount} create rows. Throws on a missing slug. */
export function buildLineCreates(
  lines: RecipeLineDraft[],
  idBySlug: Map<string, string>,
): RecipeLineCreate[] {
  return lines.map((l) => {
    const itemId = idBySlug.get(l.slug);
    if (!itemId) throw new Error(`Cannot resolve item ${l.slug}`);
    return { itemId, amount: l.amount };
  });
}

export interface LineDiffRow {
  slug: string;
  name: string;
  oldAmount: number | null;
  newAmount: number | null;
  status: "added" | "removed" | "changed" | "same";
}

/** Per-slug diff of two line lists (old order first, then new-only slugs). */
export function diffRecipeLines(oldLines: RecipeLineDraft[], newLines: RecipeLineDraft[]): LineDiffRow[] {
  const oldBy = new Map(oldLines.map((l) => [l.slug, l]));
  const newBy = new Map(newLines.map((l) => [l.slug, l]));
  const slugs = [...new Set([...oldLines.map((l) => l.slug), ...newLines.map((l) => l.slug)])];
  return slugs.map((slug) => {
    const o = oldBy.get(slug);
    const n = newBy.get(slug);
    const name = (n ?? o)!.name;
    const status: LineDiffRow["status"] = !o ? "added" : !n ? "removed" : o.amount !== n.amount ? "changed" : "same";
    return { slug, name, oldAmount: o?.amount ?? null, newAmount: n?.amount ?? null, status };
  });
}
