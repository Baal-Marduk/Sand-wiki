import { describe, it, expect } from "vitest";
import { lootEntryView } from "./loot";

describe("lootEntryView", () => {
  it("projects an item entry to the item page with item icon/rarity", () => {
    expect(lootEntryView({
      name: "Iron", item: { slug: "iron", icon: "/i/iron.png", rarity: "Common" }, container: null,
    })).toEqual({ name: "Iron", icon: "/i/iron.png", rarity: "Common", href: "/items/iron" });
  });

  it("projects a container entry to the environment page, with no rarity", () => {
    expect(lootEntryView({
      name: "Ammo Crate", item: null, container: { slug: "ammo-crate", icon: "/i/crate.png" },
    })).toEqual({ name: "Ammo Crate", icon: "/i/crate.png", rarity: null, href: "/environment/ammo-crate" });
  });

  it("projects a name-only entry to no link and no icon", () => {
    expect(lootEntryView({ name: "Mystery", item: null, container: null }))
      .toEqual({ name: "Mystery", icon: null, rarity: null, href: null });
  });

  it("prefers the item when both item and container are somehow set", () => {
    expect(lootEntryView({
      name: "X", item: { slug: "x", icon: null, rarity: null }, container: { slug: "c", icon: null },
    }).href).toBe("/items/x");
  });
});
