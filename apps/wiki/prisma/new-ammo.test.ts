import { describe, it, expect } from "vitest";
import { ammoRowIdentity, type NewAmmo } from "./new-ammo";
import entries from "./new-ammo.json";
import data from "./data.json";
import icons from "./icons.json";

const SAMPLE: NewAmmo = {
  slug: "small-cannon-ammo-low-recoil",
  id: "item_smallCannonAmmo_lowRecoil",
  name: "Small Cannon Ammo Low Recoil",
  displayName: "Low-Recoil 40 mm Shell",
  description: "A smaller-caliber cannon shell utilized by autocannons. Tuned for reduced recoil.",
  iconFile: "icon_ammo_smallCannon_lowRecoil.png",
  caliber: "40 mm",
};

describe("ammoRowIdentity", () => {
  it("maps a NewAmmo entry to a curated Entity identity", () => {
    expect(ammoRowIdentity(SAMPLE)).toEqual({
      name: "Low-Recoil 40 mm Shell",
      derivedName: "Small Cannon Ammo Low Recoil",
      description: "A smaller-caliber cannon shell utilized by autocannons. Tuned for reduced recoil.",
      category: "ammo",
      rarity: "Common",
      icon: "/icons/icon_ammo_smallCannon_lowRecoil.png",
      curated: true,
      lootCurated: true,
    });
  });

  it("throws when the displayName's caliber token disagrees with the declared caliber", () => {
    const bad = { ...SAMPLE, caliber: "70 mm" };
    expect(() => ammoRowIdentity(bad)).toThrow(/caliber/i);
  });

  it("throws when the displayName contains no caliber token", () => {
    const bad = { ...SAMPLE, displayName: "Low-Recoil Shell" };
    expect(() => ammoRowIdentity(bad)).toThrow(/caliber/i);
  });
});

describe("new-ammo.json", () => {
  const list = entries as NewAmmo[];

  it("has exactly three entries with unique slugs and ids", () => {
    expect(list).toHaveLength(3);
    expect(new Set(list.map((e) => e.slug)).size).toBe(3);
    expect(new Set(list.map((e) => e.id)).size).toBe(3);
  });

  it("every entry passes the caliber invariant", () => {
    for (const e of list) expect(() => ammoRowIdentity(e)).not.toThrow();
  });

  it("covers the two known slugs plus one more 70 mm shotgun-turret variant", () => {
    const slugs = list.map((e) => e.slug);
    expect(slugs).toContain("shotgun-turret-ammo-smoke");
    expect(slugs).toContain("small-cannon-ammo-low-recoil");
    // The penetrating round's exact suffix is finalized later from the real icon filename;
    // assert only that a third entry exists and is a shotgun-turret (70 mm) variant.
    const extra = slugs.filter(
      (s) => s.startsWith("shotgun-turret-ammo-") && s !== "shotgun-turret-ammo-smoke",
    );
    expect(extra).toHaveLength(1);
  });
});

describe("fresh-seed parity", () => {
  const list = entries as NewAmmo[];
  const items = (data as { items: { slug: string; type?: string }[] }).items;
  const iconMap = icons as Record<string, string>;

  it("data.json has an AMMO item for every new entry", () => {
    for (const e of list) {
      const item = items.find((i) => i.slug === e.slug);
      expect(item, `data.json missing ${e.slug}`).toBeTruthy();
      expect(item!.type).toBe("AMMO");
    }
  });

  it("icons.json maps every new id to its PNG path", () => {
    for (const e of list) {
      expect(iconMap[e.id]).toBe(`icons/${e.iconFile}`);
    }
  });
});
