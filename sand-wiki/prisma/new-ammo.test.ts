import { describe, it, expect } from "vitest";
import { ammoRowIdentity, type NewAmmo } from "./new-ammo";

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
