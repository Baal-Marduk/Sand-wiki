import { describe, it, expect } from "vitest";
import { toRecipeCard, type RecipeWithItems } from "./recipes";

describe("toRecipeCard", () => {
  it("carries each line item's rarity into the card rows", () => {
    const recipe: RecipeWithItems = {
      slug: "r", workbench: null, tier: null, craftTimeSeconds: null,
      inputs: [{ amount: 2, item: { slug: "a", name: "A", icon: null, rarity: "Rare" } }],
      outputs: [{ amount: 1, item: { slug: "b", name: "B", icon: "/b.png", rarity: null } }],
    };
    const card = toRecipeCard(recipe);
    expect(card.inputs[0].rarity).toBe("Rare");
    expect(card.outputs[0].rarity).toBeNull();
  });
});
