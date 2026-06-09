import { describe, it, expect } from "vitest";
import { toRecipeCard, type RecipeWithItems } from "./recipes";

const recipe: RecipeWithItems = {
  slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2,
  inputs: [{ amount: 5, item: { slug: "scraps", name: "Scraps", icon: null } }],
  outputs: [{ amount: 1, item: { slug: "fabric", name: "Fabric", icon: "/icons/icon_fabric.png" } }],
};

describe("toRecipeCard", () => {
  it("flattens a recipe into display rows, carrying each item's icon", () => {
    expect(toRecipeCard(recipe)).toEqual({
      slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2,
      inputs: [{ slug: "scraps", name: "Scraps", icon: null, amount: 5 }],
      outputs: [{ slug: "fabric", name: "Fabric", icon: "/icons/icon_fabric.png", amount: 1 }],
    });
  });
});
