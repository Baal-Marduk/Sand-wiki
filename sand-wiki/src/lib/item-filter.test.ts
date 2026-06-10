import { describe, it, expect } from "vitest";
import { buildItemQuery, applyItemView } from "./item-filter";

describe("buildItemQuery", () => {
  it("defaults to no filters and name-ascending", () => {
    expect(buildItemQuery({})).toEqual({ where: {}, orderBy: { name: "asc" } });
  });

  it("filters by name OR derivedName (case-insensitive) and category", () => {
    expect(buildItemQuery({ query: "rifle", category: "weapons" }).where).toEqual({
      OR: [
        { name: { contains: "rifle", mode: "insensitive" } },
        { derivedName: { contains: "rifle", mode: "insensitive" } },
      ],
      category: "weapons",
    });
  });

  it("filters by workbench tier", () => {
    expect(buildItemQuery({ workbenchTier: 2 }).where).toEqual({ workbenchTier: 2 });
  });

  it("filters by rarity", () => {
    expect(buildItemQuery({ rarity: "Rare" }).where).toEqual({ rarity: "Rare" });
  });

});

const mk = (slug: string, name: string, rarity: string | null, ammoName?: string) => ({
  slug, name, rarity, stats: ammoName ? { ammoName } : null,
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
      mk("rifle", "Rifle", "Common", "9x42 mm Ammo"),  // Rifle
      mk("snip", "Sniper", "Rare", "11x54 mm Ammo"),   // Sniper
    ];
    expect(applyItemView(weapons, { sort: "name", weaponClass: "Rifle" }).map((i) => i.slug)).toEqual(["rifle"]);
  });
});
