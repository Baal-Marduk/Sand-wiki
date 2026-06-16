import { describe, it, expect } from "vitest";
import { classifyTrades, formatCrowns } from "./trades";
import type { RecipeCard } from "./recipes";

const craftC4: RecipeCard = {
  slug: "c4-dynamite-2", workbench: "Armament", tier: 2, craftTimeSeconds: 3, location: null,
  inputs: [
    { slug: "resource-fabric", name: "Fabric", icon: null, rarity: null, amount: 2 },
    { slug: "resource-gunpowder", name: "Gunpowder", icon: null, rarity: null, amount: 2 },
  ],
  outputs: [{ slug: "c4-dynamite", name: "C4 Dynamite", icon: null, rarity: null, amount: 1 }],
};

const usedInRecipe: RecipeCard = {
  slug: "some-recipe", workbench: "Armament", tier: 1, craftTimeSeconds: 5, location: null,
  inputs: [{ slug: "c4-dynamite", name: "C4 Dynamite", icon: null, rarity: null, amount: 1 }],
  outputs: [{ slug: "big-bomb", name: "Big Bomb", icon: null, rarity: null, amount: 1 }],
};

describe("classifyTrades", () => {
  it("passes craftedBy recipes through as crafts and usedIn as usedInCrafts (buy/sell always empty)", () => {
    const r = classifyTrades("c4-dynamite", [craftC4], [usedInRecipe]);
    expect(r.buy).toEqual([]);
    expect(r.sell).toEqual([]);
    expect(r.crafts.map((c) => c.slug)).toEqual(["c4-dynamite-2"]);
    expect(r.usedInCrafts.map((c) => c.slug)).toEqual(["some-recipe"]);
  });

  it("returns empty arrays for all fields when given no recipes", () => {
    const r = classifyTrades("anything", [], []);
    expect(r).toEqual({ buy: [], sell: [], crafts: [], usedInCrafts: [] });
  });
});

describe("formatters", () => {
  it("formats crown totals with thousands separators", () => {
    expect(formatCrowns(1000)).toBe("1,000");
    expect(formatCrowns(5)).toBe("5");
  });
});
