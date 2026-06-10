import type { RecipeCard, RecipeCardRow } from "./recipes";

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

const amountOf = (rows: RecipeCardRow[], slug: string): number =>
  rows.find((r) => r.slug === slug)?.amount ?? 0;

const hasItem = (rows: RecipeCardRow[], slug: string): boolean =>
  rows.some((r) => r.slug === slug);

/** Sort by quantity asc and flag the single best unit price (first match wins on ties). */
function withBest(options: Omit<TradeOption, "isBest">[], pick: "min" | "max"): TradeOption[] {
  if (options.length === 0) return [];
  const sorted = [...options].sort((a, b) => a.quantity - b.quantity);
  const prices = sorted.map((o) => o.unitPrice);
  const best = pick === "min" ? Math.min(...prices) : Math.max(...prices);
  let flagged = false;
  return sorted.map((o) => {
    const isBest = !flagged && o.unitPrice === best;
    if (isBest) flagged = true;
    return { ...o, isBest };
  });
}

/**
 * Partition an item's recipes into Buy/Sell trades (the other side is Coin Crown)
 * and the leftover real crafts. When the page item itself is the currency, nothing
 * is reclassified as a trade.
 */
export function classifyTrades(
  itemSlug: string,
  craftedBy: RecipeCard[],
  usedIn: RecipeCard[],
): ItemTrades {
  const isCurrencyPage = itemSlug === CURRENCY_SLUG;

  const rawBuy: Omit<TradeOption, "isBest">[] = [];
  const crafts: RecipeCard[] = [];
  for (const r of craftedBy) {
    const isBuy =
      !isCurrencyPage && hasItem(r.inputs, CURRENCY_SLUG) && hasItem(r.outputs, itemSlug);
    if (isBuy) {
      const quantity = amountOf(r.outputs, itemSlug);
      const totalCrowns = amountOf(r.inputs, CURRENCY_SLUG);
      rawBuy.push({ recipeSlug: r.slug, quantity, totalCrowns, unitPrice: totalCrowns / quantity });
    } else {
      crafts.push(r);
    }
  }

  const rawSell: Omit<TradeOption, "isBest">[] = [];
  const usedInCrafts: RecipeCard[] = [];
  for (const r of usedIn) {
    const isSell =
      !isCurrencyPage && hasItem(r.outputs, CURRENCY_SLUG) && hasItem(r.inputs, itemSlug);
    if (isSell) {
      const quantity = amountOf(r.inputs, itemSlug);
      const totalCrowns = amountOf(r.outputs, CURRENCY_SLUG);
      rawSell.push({ recipeSlug: r.slug, quantity, totalCrowns, unitPrice: totalCrowns / quantity });
    } else {
      usedInCrafts.push(r);
    }
  }

  return {
    buy: withBest(rawBuy, "min"), // cheapest per unit is best to buy
    sell: withBest(rawSell, "max"), // most per unit is best to sell
    crafts,
    usedInCrafts,
  };
}

export function formatCrowns(n: number): string {
  return n.toLocaleString("en-US");
}
