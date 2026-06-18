import { describe, it, expect } from "vitest";
import { curatedExtraRow, type CuratedExtraItem } from "./curated-extras";
import entries from "./curated-extras.json";

const SAMPLE: CuratedExtraItem = {
  slug: "anti-reactor-gun-ammo",
  name: "Anti-Reactor Cell",
  derivedName: "Anti Reactor Gun Ammo",
  category: "ammo",
  rarity: "Experimental",
  description: "Energy cell for the anti-reactor rifle.",
  iconFile: "icon_ammo_antiReactorGun.png",
};

describe("curatedExtraRow", () => {
  it("maps a CuratedExtraItem to a curated Entity identity", () => {
    expect(curatedExtraRow(SAMPLE)).toEqual({
      kind: "item",
      name: "Anti-Reactor Cell",
      derivedName: "Anti Reactor Gun Ammo",
      description: "Energy cell for the anti-reactor rifle.",
      category: "ammo",
      rarity: "Experimental",
      icon: "/icons/icon_ammo_antiReactorGun.png",
      curated: true,
      lootCurated: true,
    });
  });

  it("defaults rarity to Common and derivedName/description to null when omitted", () => {
    const row = curatedExtraRow({ slug: "x-ray", name: "X", category: "ammo", iconFile: "a.png" });
    expect(row.rarity).toBe("Common");
    expect(row.derivedName).toBeNull();
    expect(row.description).toBeNull();
  });

  it("throws on an invalid slug", () => {
    expect(() => curatedExtraRow({ ...SAMPLE, slug: "Bad_Slug" })).toThrow(/slug/i);
  });

  it("throws on an invalid item category", () => {
    expect(() => curatedExtraRow({ ...SAMPLE, category: "not-a-category" })).toThrow(/category/i);
  });

  it("throws on an unknown rarity", () => {
    expect(() => curatedExtraRow({ ...SAMPLE, rarity: "Mythic" })).toThrow(/rarity/i);
  });
});

describe("curated-extras.json", () => {
  const list = entries as CuratedExtraItem[];

  it("has unique slugs and every entry builds cleanly", () => {
    expect(new Set(list.map((e) => e.slug)).size).toBe(list.length);
    for (const e of list) expect(() => curatedExtraRow(e)).not.toThrow();
  });
});
