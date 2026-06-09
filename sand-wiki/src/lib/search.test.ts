import { describe, it, expect } from "vitest";
import { searchSuggestions, type IndexItem } from "./search";

const index: IndexItem[] = [
  { slug: "sniper-rifle", name: "Sniper Rifle", category: "guns" },
  { slug: "pistol-ammo", name: "Pistol Ammo", category: "ammo" },
  { slug: "energy-bar", name: "Energy Bar", category: "medical" },
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
      slug: `gun-${n}`, name: `Gun ${n}`, category: "guns",
    }));
    expect(searchSuggestions("gun", many).items).toHaveLength(8);
  });
});
