export interface MigLine { slug: string; amount: number }
export interface MigRecipe { id: string; slug: string; inputs: MigLine[]; outputs: MigLine[] }

const has = (lines: MigLine[], slug: string) => lines.some((l) => l.slug === slug);

/** Classify a recipe relative to the currency item. "buy" = currency in & item out;
 *  "sell" = item in & currency out; "keep" = anything else (incl. currency on both
 *  sides, or no currency). */
export function classifyCoinRecipe(rec: MigRecipe, currencySlug: string): "buy" | "sell" | "keep" {
  const inHas = has(rec.inputs, currencySlug);
  const outHas = has(rec.outputs, currencySlug);
  if (inHas === outHas) return "keep"; // both or neither -> not a pure trade
  return inHas ? "buy" : "sell";
}

export interface ExtractedOption { costs: MigLine[]; yield: number }

/** From a buy recipe, the cost components (all inputs) and the yield (the item output's
 *  amount). `itemSlug` is the bought item (the recipe's non-currency output). */
export function buyOptionFromRecipe(rec: MigRecipe, itemSlug: string, _currencySlug: string): ExtractedOption {
  const costs = rec.inputs.map((l) => ({ slug: l.slug, amount: l.amount }));
  const out = rec.outputs.find((o) => o.slug === itemSlug);
  return { costs, yield: out?.amount ?? 1 };
}

/** The bought item of a buy recipe = its first non-currency output slug (null if none). */
export function boughtItemSlug(rec: MigRecipe, currencySlug: string): string | null {
  return rec.outputs.find((o) => o.slug !== currencySlug)?.slug ?? null;
}
