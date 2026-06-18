import { describe, it, expect } from "vitest";
import { itemStatCells, EMPTY_ITEM_STATS } from "./StatBox";

const cell = (cells: ReturnType<typeof itemStatCells>, label: string) =>
  cells.find((c) => c.label === label)?.value;

describe("itemStatCells — new datamined fields", () => {
  it("renders weapon reload + range (with falloff multiplier)", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, reloadSeconds: 3.05,
      rangeFull: 15, rangeMax: 150, rangeMinMult: 0.5, rangeFalloff: true,
    });
    expect(cell(cells, "Reload")).toBe("3.05s");
    expect(cell(cells, "Range")).toBe("15→150 m ·×0.5");
  });

  it("renders range without multiplier when falloff is false", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, rangeFull: 8, rangeMax: 30, rangeMinMult: 0.4, rangeFalloff: false,
    });
    expect(cell(cells, "Range")).toBe("8→30 m");
  });

  it("renders ammo damage, range and penetrates (only when true)", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, damage: 50, rangeFull: 35, rangeMax: 150, rangeMinMult: 0.3, rangeFalloff: true, penetrates: true,
    });
    expect(cell(cells, "Damage")).toBe(50);
    expect(cell(cells, "Penetrates")).toBe("Yes");
  });

  it("omits the Penetrates cell when penetrates is false", () => {
    const cells = itemStatCells({ ...EMPTY_ITEM_STATS, penetrates: false });
    expect(cells.find((c) => c.label === "Penetrates")).toBeUndefined();
  });

  it("renders armor rating, durability and combined regen", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, armorRating: 150, armorDurability: 1400, armorRegenSpeed: 5, armorRegenDelay: 10,
    });
    expect(cell(cells, "Armor")).toBe(150);
    expect(cell(cells, "Durability")).toBe(1400);
    expect(cell(cells, "Regen")).toBe("5/s · 10s delay");
  });

  it("renders turret fire rate, velocity and magazine", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, fireRate: 5, projectileVelocity: 150, magazine: 2, penetrates: true,
    });
    expect(cell(cells, "Fire rate")).toBe("5/s");
    expect(cell(cells, "Velocity")).toBe("150 m/s");
    expect(cell(cells, "Magazine")).toBe(2);
  });
});
