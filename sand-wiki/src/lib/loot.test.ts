import { describe, it, expect } from "vitest";
import { lootEntryView } from "./loot";
import type { LinkRow } from "./entity-links";

const row = (over: Partial<LinkRow>): LinkRow => ({
  targetSlug: null, targetKind: null, name: "x", icon: null, rarity: null,
  amount: null, tier: null, value1: null, value2: null, value3: null, sortOrder: 0, ...over,
});

const base: LinkRow = {
  targetSlug: "med-kit", targetKind: "item", name: "Med Kit", icon: null, rarity: null,
  amount: null, tier: "Tier 1", value1: "50", value2: "1-2", value3: "3-4", sortOrder: 0,
};

describe("lootEntryView", () => {
  it("surfaces chance/voyage/storm and derives the storm bonus", () => {
    const v = lootEntryView(base);
    expect(v.chance).toBe("50%");
    expect(v.voyage).toBe("1-2");
    expect(v.storm).toBe("3-4");
    expect(v.moreInStorm).toBe(true);
    expect(v.stormBonus).toBeCloseTo(2.33, 2); // avg 3.5 / avg 1.5
  });

  it("handles missing values (legacy value1-only rows)", () => {
    const v = lootEntryView({ ...base, value1: null, value2: null, value3: null });
    expect(v.chance).toBeNull();
    expect(v.moreInStorm).toBe(false);
    expect(v.stormBonus).toBeNull();
  });

  it("projects an item target to the item page with its icon/rarity", () => {
    const v = lootEntryView(row({
      name: "Iron", targetSlug: "iron", targetKind: "item", icon: "/i/iron.png", rarity: "Common",
    }));
    expect(v.name).toBe("Iron");
    expect(v.icon).toBe("/i/iron.png");
    expect(v.rarity).toBe("Common");
    expect(v.href).toBe("/items/iron");
  });

  it("projects an environment target to the environment page", () => {
    expect(lootEntryView(row({
      name: "Ammo Crate", targetSlug: "ammo-crate", targetKind: "environment", icon: "/i/crate.png",
    })).href).toBe("/environment/ammo-crate");
  });

  it("projects a trampler-part target to the tramplers page", () => {
    expect(lootEntryView(row({
      name: "Wheel", targetSlug: "wheel", targetKind: "trampler-part",
    })).href).toBe("/tramplers/wheel");
  });

  it("projects a name-only entry (no target) to no link", () => {
    expect(lootEntryView(row({ name: "Mystery" })).href).toBeNull();
  });
});
