import { describe, it, expect } from "vitest";
import { itemStatCells, EMPTY_ITEM_STATS } from "./StatBox";

const cell = (cells: ReturnType<typeof itemStatCells>, label: string) =>
  cells.find((c) => c.label === label)?.value;

describe("itemStatCells — new datamined fields", () => {
  it("renders weapon reload (1 decimal) + range as max only", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, reloadSeconds: 1.434,
      rangeFull: 15, rangeMax: 150, rangeMinMult: 0.5, rangeFalloff: true,
    });
    expect(cell(cells, "Reload")).toBe("1.4s");
    expect(cell(cells, "Range")).toBe("150 m");
  });

  it("rounds reload to one decimal", () => {
    expect(cell(itemStatCells({ ...EMPTY_ITEM_STATS, reloadSeconds: 2.783 }), "Reload")).toBe("2.8s");
    expect(cell(itemStatCells({ ...EMPTY_ITEM_STATS, reloadSeconds: 5 }), "Reload")).toBe("5.0s");
  });

  it("shows ammo damage + range (max only) + penetrates (only when true)", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, damage: 50, rangeFull: 35, rangeMax: 150, rangeMinMult: 0.3, rangeFalloff: true, penetrates: true,
    });
    expect(cell(cells, "Damage")).toBe(50);
    expect(cell(cells, "Range")).toBe("150 m");
    expect(cell(cells, "Penetrates")).toBe("Yes");
  });

  it("hides damage for guns/turrets (reloadSeconds or fireRate present) — not reliably extracted per-weapon", () => {
    const gun = itemStatCells({ ...EMPTY_ITEM_STATS, damage: 60, playerDamage: 40, reloadSeconds: 2.5 });
    expect(gun.find((c) => c.label === "Damage")).toBeUndefined();
    expect(gun.find((c) => c.label === "Damage (Player)")).toBeUndefined();
    expect(cell(gun, "Reload")).toBe("2.5s");

    const turret = itemStatCells({ ...EMPTY_ITEM_STATS, damage: 300, fireRate: 5 });
    expect(turret.find((c) => c.label === "Damage")).toBeUndefined();
    expect(cell(turret, "Fire rate")).toBe("5/s");
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

  it("renders Range from rangeMax even when rangeFull is absent", () => {
    const cells = itemStatCells({ ...EMPTY_ITEM_STATS, rangeMax: 30 });
    expect(cell(cells, "Range")).toBe("30 m");
  });
});
