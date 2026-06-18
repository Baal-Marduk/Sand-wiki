import { describe, it, expect } from "vitest";
import { ammoPatch, armorPatch, rangePatch, weaponPatch } from "./weapon-stats";

describe("rangePatch", () => {
  it("maps the four range fields", () => {
    expect(rangePatch({ full: 35, max: 150, minMult: 0.3, falloff: true })).toEqual({
      rangeFull: 35, rangeMax: 150, rangeMinMult: 0.3, rangeFalloff: true,
    });
  });
  it("is empty when range is null", () => {
    expect(rangePatch(null)).toEqual({});
  });
});

describe("weaponPatch", () => {
  it("maps reload + range, never damage", () => {
    expect(weaponPatch({
      reloadSeconds: 3.05,
      range: { full: 15, max: 150, minMult: 0.5, falloff: true },
      recoil: null, spread: null,
    })).toEqual({
      reloadSeconds: 3.05, rangeFull: 15, rangeMax: 150, rangeMinMult: 0.5, rangeFalloff: true,
    });
  });
  it("drops a null reload and null range entirely", () => {
    expect(weaponPatch({ reloadSeconds: null, range: null, recoil: null, spread: null })).toEqual({});
  });
});

describe("ammoPatch", () => {
  it("maps damage (rounded), penetrates and range; ignores stack/turret", () => {
    expect(ammoPatch({
      turret: false, damagePhysical: 50,
      range: { full: 35, max: 150, minMult: 0.3, falloff: true },
      penetrates: false, stack: [50, 250, 1000],
    })).toEqual({
      damage: 50, penetrates: false,
      rangeFull: 35, rangeMax: 150, rangeMinMult: 0.3, rangeFalloff: true,
    });
  });
  it("rounds fractional damage and drops null damage", () => {
    expect(ammoPatch({ turret: false, damagePhysical: 12.6, range: null, penetrates: null, stack: [] }))
      .toEqual({ damage: 13 });
  });
});

describe("armorPatch", () => {
  it("maps rating, regen delay/speed, durability", () => {
    expect(armorPatch({ armorRating: 50, regen: { delay: 6, speed: 7 }, durability: 1400 })).toEqual({
      armorRating: 50, armorRegenDelay: 6, armorRegenSpeed: 7, armorDurability: 1400,
    });
  });
  it("drops a null regen block", () => {
    expect(armorPatch({ armorRating: 100, regen: null, durability: 1400 }))
      .toEqual({ armorRating: 100, armorDurability: 1400 });
  });
});
