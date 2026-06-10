import { describe, it, expect } from "vitest";
import { rarityColor, rarityBgColor, rarityTier, isRarity, RARITIES, DEFAULT_RARITY } from "./rarity";

describe("rarity", () => {
  it("orders the known scale by tier", () => {
    expect(RARITIES.map((r) => r.name)).toEqual([
      "Common", "Uncommon", "Noteworthy", "Rare", "Remarkable", "Experimental",
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
    expect(rarityTier("Rare")).toBe(4);
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
});
