import { describe, it, expect } from "vitest";
import { createStore } from "./store";
import { fixture } from "./fixtures";

describe("store indexes", () => {
  const s = createStore(fixture);

  it("indexes entities by slug", () => {
    expect(s.bySlug.get("rifle")?.name).toBe("Rifle");
    expect(s.bySlug.get("nope")).toBeUndefined();
  });

  it("indexes entities by kind", () => {
    expect(s.byKind.get("item")?.map((e) => e.slug).sort()).toEqual(["ammo-9x42", "ghost", "iron", "rifle"]);
    expect(s.byKind.get("trampler-part")?.length).toBe(1);
  });

  it("indexes outgoing and incoming links", () => {
    expect(s.linksFrom.get("crate")?.length).toBe(2);
    expect(s.linksTo.get("iron")?.map((l) => l.role).sort()).toEqual(["cost", "loot"]);
  });

  it("indexes recipes by output, input and location", () => {
    expect(s.recipesByOutput.get("rifle")?.[0].slug).toBe("rifle-recipe");
    expect(s.recipesByInput.get("iron")?.[0].slug).toBe("rifle-recipe");
    expect(s.recipesByLocation.get("nowhere")).toBeUndefined();
  });
});
