import { describe, it, expect } from "vitest";
import { rarityColor, rarityBgColor, rarityTier, isRarity, RARITIES, DEFAULT_RARITY, mixHex, rarityGradient } from "./rarity";

describe("rarity", () => {
  it("orders the known scale by tier", () => {
    expect(RARITIES.map((r) => r.name)).toEqual([
      "Common", "Uncommon", "Rare", "Noteworthy", "Remarkable", "Experimental",
    ]);
    expect(RARITIES.map((r) => r.tier)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("maps name to color (case-insensitive); null for unknown/absent", () => {
    expect(rarityColor("Common")).toBe("#ADADAD");
    expect(rarityColor("noteworthy")).toBe("#9C86B7");
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

  it("rarityBgColor appends ~65% alpha to the solid color; null for unknown/absent", () => {
    expect(rarityBgColor("Noteworthy")).toBe("#9C86B7A6");
    expect(rarityBgColor("common")).toBe("#ADADADA6");
    expect(rarityBgColor("nope")).toBeNull();
    expect(rarityBgColor(null)).toBeNull();
    expect(rarityBgColor(undefined)).toBeNull();
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
    const g = rarityGradient("Noteworthy");
    expect(g).toBe(
      `linear-gradient(135deg, ${mixHex("#9C86B7", "#FFFFFF", 0.05)} 0%, ` +
        `${mixHex("#9C86B7", "#14171F", 0.65)} 38%, #11131A 100%)`,
    );
    expect(rarityGradient("nope")).toBeNull();
    expect(rarityGradient(null)).toBeNull();
    expect(rarityGradient(undefined)).toBeNull();
  });
});
