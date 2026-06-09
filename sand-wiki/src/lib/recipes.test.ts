import { describe, it, expect } from "vitest";
import { toRecipeCard, type RecipeWithItems } from "./recipes";

const recipe: RecipeWithItems = {
  slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2,
  inputs: [{ amount: 5, item: { slug: "scraps", name: "Scraps" } }],
  outputs: [{ amount: 1, item: { slug: "fabric", name: "Fabric" } }],
};

describe("toRecipeCard", () => {
  it("flattens a recipe into display rows", () => {
    expect(toRecipeCard(recipe)).toEqual({
      slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2,
      inputs: [{ slug: "scraps", name: "Scraps", amount: 5 }],
      outputs: [{ slug: "fabric", name: "Fabric", amount: 1 }],
    });
  });
});
