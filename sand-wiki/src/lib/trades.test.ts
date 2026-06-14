import { describe, it, expect } from "vitest";
import { classifyTrades, formatCrowns } from "./trades";
import type { RecipeCard } from "./recipes";

const buyC4: RecipeCard = {
  slug: "c4-dynamite", workbench: null, tier: null, craftTimeSeconds: 30, location: null,
  inputs: [{ slug: "coin-crown", name: "Coin Crown", icon: null, rarity: null, amount: 10 }],
  outputs: [{ slug: "c4-dynamite", name: "C4 Dynamite", icon: null, rarity: null, amount: 1 }],
};

const craftC4: RecipeCard = {
  slug: "c4-dynamite-2", workbench: "Armament", tier: 2, craftTimeSeconds: 3, location: null,
  inputs: [
    { slug: "resource-fabric", name: "Fabric", icon: null, rarity: null, amount: 2 },
    { slug: "resource-gunpowder", name: "Gunpowder", icon: null, rarity: null, amount: 2 },
  ],
  outputs: [{ slug: "c4-dynamite", name: "C4 Dynamite", icon: null, rarity: null, amount: 1 }],
};

// pistol-ammo sells: 1->5, 5->25, 100->1000 (unit 5, 5, 10)
const sell = (qty: number, crowns: number, slug: string): RecipeCard => ({
  slug, workbench: null, tier: null, craftTimeSeconds: null, location: null,
  inputs: [{ slug: "pistol-ammo", name: "Pistol Ammo", icon: null, rarity: null, amount: qty }],
  outputs: [{ slug: "coin-crown", name: "Coin Crown", icon: null, rarity: null, amount: crowns }],
});

describe("classifyTrades", () => {
  it("treats a coin-crown-input recipe as a Buy and keeps real crafts separate", () => {
    const r = classifyTrades("c4-dynamite", [buyC4, craftC4], []);
    expect(r.buy).toEqual([
      { recipeSlug: "c4-dynamite", quantity: 1, totalCrowns: 10, unitPrice: 10, isBest: true },
    ]);
    expect(r.sell).toEqual([]);
    expect(r.crafts.map((c) => c.slug)).toEqual(["c4-dynamite-2"]);
  });

  it("treats coin-crown-output recipes as Sells, sorted by quantity, best = highest unit price", () => {
    const r = classifyTrades(
      "pistol-ammo",
      [],
      [sell(100, 1000, "coin-crown-3"), sell(1, 5, "coin-crown"), sell(5, 25, "coin-crown-2")],
    );
    expect(r.sell).toEqual([
      { recipeSlug: "coin-crown", quantity: 1, totalCrowns: 5, unitPrice: 5, isBest: false },
      { recipeSlug: "coin-crown-2", quantity: 5, totalCrowns: 25, unitPrice: 5, isBest: false },
      { recipeSlug: "coin-crown-3", quantity: 100, totalCrowns: 1000, unitPrice: 10, isBest: true },
    ]);
    expect(r.usedInCrafts).toEqual([]);
  });

  it("does not classify trades when the page item IS the currency", () => {
    const r = classifyTrades("coin-crown", [sell(1, 5, "coin-crown")], [buyC4]);
    expect(r.buy).toEqual([]);
    expect(r.sell).toEqual([]);
    expect(r.crafts).toHaveLength(1);
    expect(r.usedInCrafts).toHaveLength(1);
  });
});

describe("formatters", () => {
  it("formats crown totals with thousands separators", () => {
    expect(formatCrowns(1000)).toBe("1,000");
    expect(formatCrowns(5)).toBe("5");
  });
});
