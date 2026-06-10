import { describe, it, expect } from "vitest";
import { rarityColor, rarityTier, isRarity, RARITIES } from "./rarity";

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
});
