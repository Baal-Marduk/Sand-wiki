import { describe, it, expect } from "vitest";
import { itemDetailRows, availableTabs, type ItemFacts } from "./item-view";
import type { ItemTrades } from "@/lib/trades";

const noTrades: ItemTrades = { buy: [], sell: [], crafts: [], usedInCrafts: [] };
const facts: ItemFacts = { category: "weapons", storageStack: 5, workbenchTier: 2 };

const buyOpt = { recipeSlug: "x", quantity: 1, totalCrowns: 10, unitPrice: 10, isBest: true };
const sellOpt = { recipeSlug: "y", quantity: 100, totalCrowns: 1000, unitPrice: 10, isBest: true };

describe("itemDetailRows", () => {
  it("includes category and tier", () => {
    expect(itemDetailRows(facts, noTrades)).toEqual([
      { label: "Category", value: "Weapons" },
      { label: "Workbench tier", value: "2" },
    ]);
  });

  it("omits tier when null", () => {
    const r = itemDetailRows({ category: "resources", storageStack: null, workbenchTier: null }, noTrades);
    expect(r).toEqual([{ label: "Category", value: "Resources" }]);
  });

  it("adds a Buyable summary from trades, but no Sellable row (Value covers it)", () => {
    const r = itemDetailRows(facts, { ...noTrades, buy: [buyOpt], sell: [sellOpt] });
    expect(r).toContainEqual({ label: "Buyable", value: "10", coin: true, unit: "/ unit" });
    expect(r.some((row) => row.label === "Sellable")).toBe(false);
  });

  it("adds a Value row from the wiki value, without a unit", () => {
    const r = itemDetailRows({ ...facts, value: 5 }, noTrades);
    expect(r).toContainEqual({ label: "Value", value: "5", coin: true });
  });

  it("omits the Value row when value is null/undefined", () => {
    expect(itemDetailRows(facts, noTrades).some((row) => row.label === "Value")).toBe(false);
  });
});

describe("availableTabs", () => {
  it("returns nothing when there is no data", () => {
    expect(availableTabs(noTrades)).toEqual([]);
  });

  it("returns tabs in fixed order, only those with data", () => {
    const trades: ItemTrades = {
      crafts: [{ slug: "c", workbench: null, tier: null, craftTimeSeconds: null, location: null, inputs: [], outputs: [] }],
      usedInCrafts: [],
      buy: [buyOpt],
      sell: [sellOpt],
    };
    expect(availableTabs(trades)).toEqual([
      { id: "crafted-by", label: "Crafted by" },
    ]);
  });
});
