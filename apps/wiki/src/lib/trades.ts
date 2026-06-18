import type { RecipeCard } from "./recipes";

export const CURRENCY_SLUG = "coin-crown";

export interface TradeOption {
  recipeSlug: string;
  quantity: number; // units of the item bought or sold
  totalCrowns: number; // crowns paid (buy) or received (sell)
  unitPrice: number; // totalCrowns / quantity
  isBest: boolean;
}

export interface ItemTrades {
  buy: TradeOption[];
  sell: TradeOption[];
  crafts: RecipeCard[]; // non-trade recipes that produce the item
  usedInCrafts: RecipeCard[]; // non-trade recipes that consume the item
}

/**
 * Partition an item's recipes into crafts and usedInCrafts.
 * Buy/sell classification is no longer derived from coin recipes —
 * buy options are stored separately in the BuyOption table.
 */
export function classifyTrades(
  _itemSlug: string,
  craftedBy: RecipeCard[],
  usedIn: RecipeCard[],
): ItemTrades {
  return { buy: [], sell: [], crafts: craftedBy, usedInCrafts: usedIn };
}

export function formatCrowns(n: number): string {
  return n.toLocaleString("en-US");
}
