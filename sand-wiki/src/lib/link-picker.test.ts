import { describe, it, expect } from "vitest";
import { filterLinkOptions, hasExactOptionMatch, type LinkOption } from "./link-picker";

const opt = (slug: string, name: string, rarity: string | null = null): LinkOption => ({
  slug, name, rarity, icon: null, category: null,
});

const ITEMS: LinkOption[] = [
  opt("scrap-metal", "Scrap Metal", "Common"),
  opt("scrap-alloy", "Scrap Alloy", "Noteworthy"),
  opt("copper-wire", "Copper Wire", "Uncommon"),
];

describe("filterLinkOptions", () => {
  it("filters by case-insensitive substring on name", () => {
    const r = filterLinkOptions(ITEMS, "scrap", []);
    expect(r.map((o) => o.slug)).toEqual(["scrap-metal", "scrap-alloy"]);
  });

  it("returns all options (rarity-then-name sorted) for an empty query", () => {
    const r = filterLinkOptions(ITEMS, "", []);
    // Common(1) < Uncommon(2) < Noteworthy(4)
    expect(r.map((o) => o.slug)).toEqual(["scrap-metal", "copper-wire", "scrap-alloy"]);
  });

  it("excludes already-selected slugs", () => {
    const r = filterLinkOptions(ITEMS, "", ["scrap-metal"]);
    expect(r.map((o) => o.slug)).toEqual(["copper-wire", "scrap-alloy"]);
  });

  it("orders two same-rarity matches alphabetically", () => {
    const same: LinkOption[] = [
      opt("zinc-plate", "Zinc Plate", "Common"),
      opt("alloy-pin", "Alloy Pin", "Common"),
    ];
    const r = filterLinkOptions(same, "", []);
    expect(r.map((o) => o.name)).toEqual(["Alloy Pin", "Zinc Plate"]);
  });

  it("sorts unknown/absent rarity last", () => {
    const mixed: LinkOption[] = [
      opt("mystery", "Mystery Thing", null),
      opt("common-bolt", "Common Bolt", "Common"),
    ];
    const r = filterLinkOptions(mixed, "", []);
    expect(r.map((o) => o.slug)).toEqual(["common-bolt", "mystery"]);
  });
});

describe("hasExactOptionMatch", () => {
  it("is true for a case-insensitive exact name match", () => {
    expect(hasExactOptionMatch(ITEMS, "scrap metal")).toBe(true);
  });
  it("is false for a partial match", () => {
    expect(hasExactOptionMatch(ITEMS, "scrap")).toBe(false);
  });
  it("is false for an empty/blank query", () => {
    expect(hasExactOptionMatch(ITEMS, "  ")).toBe(false);
  });
});
