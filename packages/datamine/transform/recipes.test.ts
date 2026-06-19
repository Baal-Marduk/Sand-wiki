import { describe, it, expect } from "vitest";
import { mergeRecipes, type RawRecipe } from "./recipes";
import type { Recipe } from "@sandlabs/data";
import type { ReconcileHit } from "./reconcile";

const hit = (slug: string): ReconcileHit => ({ slug, status: "matched" });
const map = new Map<string, ReconcileHit>([
  ["item_resourceFabricScraps", hit("resource-fabric-scraps")],
  ["item_resourceThreads", hit("resource-threads")],
  ["item_resourceFabric", hit("resource-fabric")],
  ["Old_Jacket", hit("old-jacket")],
]);
const raw = (o: Partial<RawRecipe>): RawRecipe => ({ workbench: "Utility", tier: 1, inputs: [], outputs: [], seconds: 2, ...o });

describe("mergeRecipes", () => {
  it("refreshes a baseline recipe matched by content signature, keeping its slug", () => {
    const baseline: Recipe[] = [{ slug: "resource-fabric", workbench: "Utility", tier: 1,
      craftTimeSeconds: 99, locationSlug: null,
      inputs: [{ itemSlug: "resource-fabric-scraps", amount: 5 }, { itemSlug: "resource-threads", amount: 15 }],
      outputs: [{ itemSlug: "resource-fabric", amount: 1 }] }];
    const dm = [raw({ inputs: [{ item: "item_resourceFabricScraps", amount: 5 }, { item: "item_resourceThreads", amount: 15 }],
      outputs: [{ item: "item_resourceFabric", amount: 1 }], seconds: 2 })];
    const { recipes, missing } = mergeRecipes(baseline, dm, map);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].slug).toBe("resource-fabric");
    expect(recipes[0].craftTimeSeconds).toBe(2);
    expect(missing).toHaveLength(0);
  });

  it("adds a new datamined recipe (slug = primary output) and preserves unmatched baseline recipes", () => {
    const baseline: Recipe[] = [{ slug: "loc-x-energy", workbench: null, tier: null,
      craftTimeSeconds: null, locationSlug: "x", inputs: [], outputs: [{ itemSlug: "energy", amount: 1 }] }];
    const dm = [raw({ outputs: [{ item: "Old_Jacket", amount: 1 }],
      inputs: [{ item: "item_resourceFabric", amount: 2 }], seconds: 5 })];
    const { recipes, missing } = mergeRecipes(baseline, dm, map);
    expect(recipes.map((r) => r.slug).sort()).toEqual(["loc-x-energy", "old-jacket"]);
    expect(missing.map((m) => m.slug)).toEqual(["loc-x-energy"]);
  });

  it("drops recipe lines whose item id does not reconcile, and skips recipes with no resolvable output", () => {
    const dm = [
      raw({ outputs: [{ item: "unknown_item", amount: 1 }] }),
      raw({ outputs: [{ item: "Old_Jacket", amount: 1 }], inputs: [{ item: "unknown_item", amount: 9 }, { item: "item_resourceThreads", amount: 3 }] }),
    ];
    const { recipes } = mergeRecipes([], dm, map);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].slug).toBe("old-jacket");
    expect(recipes[0].inputs).toEqual([{ itemSlug: "resource-threads", amount: 3 }]);
  });

  it("dedupes new-recipe slugs with a numeric suffix", () => {
    const dm = [
      raw({ outputs: [{ item: "Old_Jacket", amount: 1 }], tier: 1 }),
      raw({ outputs: [{ item: "Old_Jacket", amount: 1 }], tier: 2 }),
    ];
    const { recipes } = mergeRecipes([], dm, map);
    expect(recipes.map((r) => r.slug).sort()).toEqual(["old-jacket", "old-jacket-2"]);
  });
});
