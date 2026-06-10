import { describe, it, expect } from "vitest";
import { itemDetailRows, availableTabs, type ItemFacts } from "./item-view";
import type { ItemTrades } from "@/lib/trades";

const noTrades: ItemTrades = { buy: [], sell: [], crafts: [], usedInCrafts: [] };
const facts: ItemFacts = { category: "weapons", isResource: false, storageStack: 5, workbenchTier: 2 };

const buyOpt = { recipeSlug: "x", quantity: 1, totalCrowns: 10, unitPrice: 10, isBest: true };
const sellOpt = { recipeSlug: "y", quantity: 100, totalCrowns: 1000, unitPrice: 10, isBest: true };

describe("itemDetailRows", () => {
  it("includes category, stack and tier; omits resource when false", () => {
    expect(itemDetailRows(facts, noTrades)).toEqual([
      { label: "Category", value: "Weapons" },
      { label: "Stack size", value: "×5" },
      { label: "Workbench tier", value: "2" },
    ]);
  });

  it("omits stack and tier when null and shows Resource when true", () => {
    const r = itemDetailRows({ category: "resources", isResource: true, storageStack: null, workbenchTier: null }, noTrades);
    expect(r).toEqual([
      { label: "Category", value: "Resources" },
      { label: "Resource", value: "Yes" },
    ]);
  });

  it("adds Buyable/Sellable summaries from trades", () => {
    const r = itemDetailRows(facts, { ...noTrades, buy: [buyOpt], sell: [sellOpt] });
    expect(r).toContainEqual({ label: "Buyable", value: "10", coin: true, unit: "/ unit" });
    expect(r).toContainEqual({ label: "Sellable", value: "10", coin: true, unit: "/ unit" });
  });
});

describe("availableTabs", () => {
  it("returns nothing when there is no data", () => {
    expect(availableTabs(noTrades)).toEqual([]);
  });

  it("returns tabs in fixed order, only those with data", () => {
    const trades: ItemTrades = {
      crafts: [{ slug: "c", workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] }],
      usedInCrafts: [],
      buy: [buyOpt],
      sell: [sellOpt],
    };
    expect(availableTabs(trades)).toEqual([
      { id: "crafted-by", label: "Crafted by" },
      { id: "buy", label: "Buy" },
      { id: "sell", label: "Sell" },
    ]);
  });
});
