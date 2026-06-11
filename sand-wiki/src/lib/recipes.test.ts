import { describe, it, expect } from "vitest";
import { toRecipeCard, type RecipeWithItems } from "./recipes";

const recipe: RecipeWithItems = {
  slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2,
  inputs: [{ amount: 5, item: { slug: "scraps", name: "Scraps", icon: null, rarity: "Common" } }],
  outputs: [{ amount: 1, item: { slug: "fabric", name: "Fabric", icon: "/icons/icon_fabric.png", rarity: null } }],
};

describe("toRecipeCard", () => {
  it("flattens a recipe into display rows, carrying each item's icon and rarity", () => {
    expect(toRecipeCard(recipe)).toEqual({
      slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2,
      inputs: [{ slug: "scraps", name: "Scraps", icon: null, rarity: "Common", amount: 5 }],
      outputs: [{ slug: "fabric", name: "Fabric", icon: "/icons/icon_fabric.png", rarity: null, amount: 1 }],
    });
  });
});
