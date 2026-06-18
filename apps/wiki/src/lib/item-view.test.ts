import { describe, it, expect } from "vitest";
import { itemDetailRows, availableTabs, type ItemFacts } from "./item-view";
import type { ItemTrades } from "@/lib/trades";

const noTrades: ItemTrades = { buy: [], sell: [], crafts: [], usedInCrafts: [] };
const facts: ItemFacts = { category: "weapons", storageStack: 5, workbenchTier: 2 };

const buyOpt = { recipeSlug: "x", quantity: 1, totalCrowns: 10, unitPrice: 10, isBest: true };
const sellOpt = { recipeSlug: "y", quantity: 100, totalCrowns: 1000, unitPrice: 10, isBest: true };

describe("itemDetailRows", () => {
  it("includes category and tier", () => {
    expect(itemDetailRows(facts)).toEqual([
      { label: "Category", value: "Weapons" },
      { label: "Workbench tier", value: "2" },
    ]);
  });

  it("omits tier when null", () => {
    const r = itemDetailRows({ category: "resources", storageStack: null, workbenchTier: null });
    expect(r).toEqual([{ label: "Category", value: "Resources" }]);
  });

  it("does NOT emit a Buyable or Sellable row even when trades.buy/sell have entries", () => {
    const r = itemDetailRows(facts);
    expect(r.some((row) => row.label === "Buyable")).toBe(false);
    expect(r.some((row) => row.label === "Sellable")).toBe(false);
  });

  it("adds a Value row from the wiki value, without a unit", () => {
    const r = itemDetailRows({ ...facts, value: 5 });
    expect(r).toContainEqual({ label: "Value", value: "5", coin: true });
  });

  it("omits the Value row when value is null/undefined", () => {
    expect(itemDetailRows(facts).some((row) => row.label === "Value")).toBe(false);
  });
});

describe("availableTabs", () => {
  it("returns nothing when there is no data", () => {
    expect(availableTabs(noTrades, false)).toEqual([]);
  });

  it("returns tabs in fixed order, only those with data", () => {
    const trades: ItemTrades = {
      crafts: [{ slug: "c", workbench: null, tier: null, craftTimeSeconds: null, location: null, inputs: [], outputs: [] }],
      usedInCrafts: [],
      buy: [buyOpt],
      sell: [sellOpt],
    };
    expect(availableTabs(trades, false)).toEqual([
      { id: "crafted-by", label: "Crafted by" },
    ]);
  });

  it("adds a Buy tab first when the item has buy options", () => {
    const tabs = availableTabs(noTrades, true);
    expect(tabs[0]).toEqual({ id: "buy", label: "Buy" });
  });

  it("omits the Buy tab when there are no buy options", () => {
    const tabs = availableTabs(noTrades, false);
    expect(tabs.find((t) => t.id === "buy")).toBeUndefined();
  });
});
