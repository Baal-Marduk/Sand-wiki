import { describe, it, expect } from "vitest";
import { applyItemView } from "./item-filter";

const mk = (slug: string, name: string, rarity: string | null, ammoType?: string) => ({
  slug, name, rarity, ammoType: ammoType ?? null,
});

describe("applyItemView", () => {
  // Input is in name-asc order (the DB base ordering applyItemView relies on).
  const items = [
    mk("a", "Alpha", "Rare"),     // tier 4
    mk("b", "Bravo", "Common"),   // tier 1
    mk("c", "Charlie", "Common"), // tier 1
    mk("d", "Delta", null),       // tier 0
  ];

  it("sorts by rarity tier ascending with name as the tiebreaker by default", () => {
    expect(applyItemView(items, {}).map((i) => i.slug)).toEqual(["d", "b", "c", "a"]);
  });

  it("treats sort:'rarity' the same as the default", () => {
    expect(applyItemView(items, { sort: "rarity" }).map((i) => i.slug)).toEqual(["d", "b", "c", "a"]);
  });

  it("leaves DB name order untouched for sort:'name'", () => {
    expect(applyItemView(items, { sort: "name" }).map((i) => i.slug)).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by weapon class", () => {
    const weapons = [
      mk("rifle", "Rifle", "Common", "9x42 mm"),  // Rifle
      mk("snip", "Sniper", "Rare", "11x54 mm"),   // Sniper
    ];
    expect(applyItemView(weapons, { sort: "name", weaponClass: "Rifle" }).map((i) => i.slug)).toEqual(["rifle"]);
  });

  it("applies the weapon-class filter before the rarity sort", () => {
    const weapons = [
      mk("rifle-c", "Rifle Common", "Common", "9x42 mm"),    // Rifle, tier 1
      mk("rifle-r", "Rifle Rare", "Rare", "9x42 mm"),        // Rifle, tier 4
      mk("snip", "Sniper", "Remarkable", "11x54 mm"),        // Sniper — filtered out
    ];
    expect(
      applyItemView(weapons, { sort: "rarity", weaponClass: "Rifle" }).map((i) => i.slug),
    ).toEqual(["rifle-c", "rifle-r"]);
  });
});
