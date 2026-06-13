import { describe, it, expect } from "vitest";
import { groupLootByTier, type LinkRow } from "./entity-links";

const row = (over: Partial<LinkRow>): LinkRow => ({
  targetSlug: null, targetKind: null, name: "x", icon: null, rarity: null,
  amount: null, tier: null, value1: null, sortOrder: 0, ...over,
});

describe("groupLootByTier", () => {
  it("groups rows into tiers in canonical order, preserving row order", () => {
    const groups = groupLootByTier([
      row({ name: "B", tier: "Rare", sortOrder: 1001 }),
      row({ name: "A", tier: "Normal", sortOrder: 1 }),
      row({ name: "C", tier: "Normal", sortOrder: 2 }),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["Normal", "Rare"]);
    expect(groups[0].rows.map((r) => r.name)).toEqual(["A", "C"]);
  });

  it("puts unknown tiers last and null tier under 'Other'", () => {
    const groups = groupLootByTier([
      row({ name: "Z", tier: null, sortOrder: 5 }),
      row({ name: "A", tier: "Normal", sortOrder: 1 }),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["Normal", "Other"]);
  });
});
