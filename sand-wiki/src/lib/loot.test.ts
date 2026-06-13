import { describe, it, expect } from "vitest";
import { lootEntryView } from "./loot";
import type { LinkRow } from "./entity-links";

const row = (over: Partial<LinkRow>): LinkRow => ({
  targetSlug: null, targetKind: null, name: "x", icon: null, rarity: null,
  amount: null, tier: null, value1: null, sortOrder: 0, ...over,
});

describe("lootEntryView", () => {
  it("projects an item target to the item page with its icon/rarity", () => {
    expect(lootEntryView(row({
      name: "Iron", targetSlug: "iron", targetKind: "item", icon: "/i/iron.png", rarity: "Common",
    }))).toEqual({ name: "Iron", icon: "/i/iron.png", rarity: "Common", href: "/items/iron" });
  });

  it("projects an environment target to the environment page", () => {
    expect(lootEntryView(row({
      name: "Ammo Crate", targetSlug: "ammo-crate", targetKind: "environment", icon: "/i/crate.png",
    }))).toEqual({ name: "Ammo Crate", icon: "/i/crate.png", rarity: null, href: "/environment/ammo-crate" });
  });

  it("projects a trampler-part target to the tramplers page", () => {
    expect(lootEntryView(row({
      name: "Wheel", targetSlug: "wheel", targetKind: "trampler-part",
    })).href).toBe("/tramplers/wheel");
  });

  it("projects a name-only entry (no target) to no link", () => {
    expect(lootEntryView(row({ name: "Mystery" })))
      .toEqual({ name: "Mystery", icon: null, rarity: null, href: null });
  });
});
