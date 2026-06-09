import { describe, it, expect } from "vitest";
import { searchSuggestions, type IndexItem } from "./search";

const index: IndexItem[] = [
  { slug: "sniper-rifle", name: "1874s Petros Sniper Rifle", category: "weapons", derivedName: "Sniper Rifle" },
  { slug: "pistol-ammo", name: "8x21 mm Ammo", category: "ammo", derivedName: "Pistol Ammo" },
  { slug: "energy-bar", name: "NZ Mk2 Energy Rod", category: "medical", derivedName: "Energy Bar" },
];

describe("searchSuggestions", () => {
  it("returns nothing for an empty/whitespace query", () => {
    expect(searchSuggestions("", index)).toEqual({ categories: [], items: [] });
    expect(searchSuggestions("   ", index)).toEqual({ categories: [], items: [] });
  });

  it("matches item names case-insensitively", () => {
    const r = searchSuggestions("rifle", index);
    expect(r.items.map((i) => i.slug)).toEqual(["sniper-rifle"]);
  });

  it("matches category labels", () => {
    const r = searchSuggestions("ammo", index);
    expect(r.categories.map((c) => c.slug)).toContain("ammo");
    expect(r.items.map((i) => i.slug)).toContain("pistol-ammo");
  });

  it("caps item results at 8", () => {
    const many: IndexItem[] = Array.from({ length: 20 }, (_, n) => ({
      slug: `gun-${n}`, name: `Gun ${n}`, category: "weapons", derivedName: `Gun ${n}`,
    }));
    expect(searchSuggestions("gun", many).items).toHaveLength(8);
  });

  it("matches the derived name even when the display name does not contain the query", () => {
    // "pistol ammo" is absent from the display name "8x21 mm Ammo" but present in derivedName.
    const r = searchSuggestions("pistol ammo", index);
    expect(r.items.map((i) => i.slug)).toEqual(["pistol-ammo"]);
  });

  it("still displays the real name in suggestions", () => {
    const r = searchSuggestions("pistol ammo", index);
    expect(r.items[0].name).toBe("8x21 mm Ammo");
  });

  it("matches the display name when the query is absent from the derived name", () => {
    // "petros" is in the display name but not the derived name "Sniper Rifle".
    const r = searchSuggestions("petros", index);
    expect(r.items.map((i) => i.slug)).toEqual(["sniper-rifle"]);
  });
});
