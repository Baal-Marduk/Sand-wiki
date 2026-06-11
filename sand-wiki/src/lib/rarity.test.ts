import { describe, it, expect } from "vitest";
import { rarityColor, rarityTier, isRarity, RARITIES, DEFAULT_RARITY, mixHex, rarityGradient, byRarityThenName } from "./rarity";

describe("rarity", () => {
  it("orders the known scale by tier", () => {
    expect(RARITIES.map((r) => r.name)).toEqual([
      "Common", "Uncommon", "Rare", "Noteworthy", "Remarkable", "Experimental",
    ]);
    expect(RARITIES.map((r) => r.tier)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("maps name to color (case-insensitive); null for unknown/absent", () => {
    expect(rarityColor("Common")).toBe("#AEAEB2");
    expect(rarityColor("noteworthy")).toBe("#A37FC9");
    expect(rarityColor("nope")).toBeNull();
    expect(rarityColor(null)).toBeNull();
    expect(rarityColor(undefined)).toBeNull();
  });

  it("maps name to tier; unknown/absent -> 0", () => {
    expect(rarityTier("Rare")).toBe(3);
    expect(rarityTier("Noteworthy")).toBe(4);
    expect(rarityTier("REMARKABLE")).toBe(5);
    expect(rarityTier(undefined)).toBe(0);
    expect(rarityTier("nope")).toBe(0);
  });

  it("validates known names case-insensitively", () => {
    expect(isRarity("Remarkable")).toBe(true);
    expect(isRarity("common")).toBe(true);
    expect(isRarity("legendary")).toBe(false);
  });

  it("DEFAULT_RARITY is a valid rarity equal to Common", () => {
    expect(DEFAULT_RARITY).toBe("Common");
    expect(isRarity(DEFAULT_RARITY)).toBe(true);
  });

  it("mixHex blends two hex colors by weight of the second", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#102030", "#403020", 0.5)).toBe("#282828");
    expect(mixHex("#ADADAD", "#FFFFFF", 0)).toBe("#ADADAD");
    expect(mixHex("#ADADAD", "#FFFFFF", 1)).toBe("#FFFFFF");
  });

  it("rarityGradient builds a top-left gradient with pre-mixed hex stops; null for unknown/absent", () => {
    const c = rarityColor("Noteworthy")!;
    const g = rarityGradient("Noteworthy");
    expect(g).toBe(
      `linear-gradient(135deg, ${mixHex(c, "#FFFFFF", 0.05)} 0%, ` +
        `${mixHex(c, "#14171F", 0.65)} 38%, #11131A 100%)`,
    );
    expect(rarityGradient("nope")).toBeNull();
    expect(rarityGradient(null)).toBeNull();
    expect(rarityGradient(undefined)).toBeNull();
  });

  it("byRarityThenName orders by rarity tier asc, unknown last, then by name", () => {
    type Row = { rarity: string | null; name: string };
    const rare: Row = { rarity: "Rare", name: "Bolt" };
    const rareEarly: Row = { rarity: "Rare", name: "Axle" };
    const common: Row = { rarity: "Common", name: "Zinc" };
    const unknown: Row = { rarity: null, name: "Mystery" };
    const sorted = [rare, unknown, common, rareEarly].sort(byRarityThenName);
    expect(sorted.map((x) => x.name)).toEqual(["Zinc", "Axle", "Bolt", "Mystery"]);
    expect(byRarityThenName(common, rare)).toBeLessThan(0);
    expect(byRarityThenName(unknown, common)).toBeGreaterThan(0);
  });
});
