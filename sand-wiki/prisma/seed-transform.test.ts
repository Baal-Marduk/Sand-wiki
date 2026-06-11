import { describe, it, expect } from "vitest";
import { flattenStats, lootToTiers, costToRows } from "./seed-transform";

describe("flattenStats", () => {
  it("maps wiki stat keys to flat column names", () => {
    expect(
      flattenStats({
        type: "Revolver", value: 25, damage: 15, pDamage: 1, tDamage: 2,
        sDamage: 3, magazine: 6, ammoSlug: "pistol-ammo", ammoName: "8x21 mm Ammo",
      }),
    ).toEqual({
      statType: "Revolver", statValue: 25, damage: 15, playerDamage: 1, tramplerDamage: 2,
      splashDamage: 3, magazine: 6, ammoSlug: "pistol-ammo", ammoName: "8x21 mm Ammo",
    });
  });

  it("returns all-null when there are no stats", () => {
    expect(flattenStats(undefined)).toEqual({
      statType: null, statValue: null, damage: null, playerDamage: null, tramplerDamage: null,
      splashDamage: null, magazine: null, ammoSlug: null, ammoName: null,
    });
  });
});

describe("lootToTiers", () => {
  const loot = {
    tiers: [
      {
        tier: "Normal",
        columns: ["Lesser", "Normal", "Greater"],
        entries: [
          { slug: "canned-food", name: "Canned Food", values: ["4-5", "5-6"] }, // short row (real data)
          { name: "Crowns", values: [] },                                       // empty row (real data)
        ],
      },
      { tier: "Rare", columns: ["Count", "Chance"], entries: [] },
    ],
  };

  it("flattens tiers with column labels and array-index sort order", () => {
    const tiers = lootToTiers(loot);
    expect(tiers).toHaveLength(2);
    expect(tiers[0]).toMatchObject({
      tier: "Normal", col1Label: "Lesser", col2Label: "Normal", col3Label: "Greater", sortOrder: 0,
    });
    expect(tiers[1]).toMatchObject({
      tier: "Rare", col1Label: "Count", col2Label: "Chance", col3Label: null, sortOrder: 1,
    });
  });

  it("pads short value rows with null and keeps slug-less entries", () => {
    const [t] = lootToTiers(loot);
    expect(t.entries[0]).toEqual({
      itemSlug: "canned-food", name: "Canned Food", value1: "4-5", value2: "5-6", value3: null, sortOrder: 0,
    });
    expect(t.entries[1]).toEqual({
      itemSlug: null, name: "Crowns", value1: null, value2: null, value3: null, sortOrder: 1,
    });
  });

  it("returns [] when there is no loot", () => {
    expect(lootToTiers(undefined)).toEqual([]);
    expect(lootToTiers({})).toEqual([]);
  });

  it("throws on more than 3 columns", () => {
    expect(() =>
      lootToTiers({ tiers: [{ tier: "X", columns: ["a", "b", "c", "d"], entries: [] }] }),
    ).toThrow(/expected 1-3/);
  });
});

describe("costToRows", () => {
  it("maps cost lines, keeping slug-less currency lines", () => {
    expect(
      costToRows([
        { name: "Crowns", amount: 500 },
        { slug: "resource-metal-t1", name: "Mechanical Parts", amount: 20 },
      ]),
    ).toEqual([
      { itemSlug: null, name: "Crowns", amount: 500, sortOrder: 0 },
      { itemSlug: "resource-metal-t1", name: "Mechanical Parts", amount: 20, sortOrder: 1 },
    ]);
  });

  it("returns [] when there is no cost", () => {
    expect(costToRows(undefined)).toEqual([]);
  });
});
