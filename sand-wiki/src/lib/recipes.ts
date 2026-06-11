export interface RecipeLineItem { slug: string; name: string; icon: string | null; rarity: string | null }
export interface RecipeLine { amount: number; item: RecipeLineItem }
export interface RecipeWithItems {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  inputs: RecipeLine[];
  outputs: RecipeLine[];
}

export interface RecipeCardRow { slug: string; name: string; icon: string | null; rarity: string | null; amount: number }
export interface RecipeCard {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  inputs: RecipeCardRow[];
  outputs: RecipeCardRow[];
}

const row = (l: RecipeLine): RecipeCardRow => ({ slug: l.item.slug, name: l.item.name, icon: l.item.icon, rarity: l.item.rarity, amount: l.amount });

/** Flatten a recipe (with nested items) into display-ready rows for the item page. */
export function toRecipeCard(r: RecipeWithItems): RecipeCard {
  return {
    slug: r.slug, workbench: r.workbench, tier: r.tier, craftTimeSeconds: r.craftTimeSeconds,
    inputs: r.inputs.map(row),
    outputs: r.outputs.map(row),
  };
}
