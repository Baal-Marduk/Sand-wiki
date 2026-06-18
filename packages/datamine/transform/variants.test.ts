import { describe, it, expect } from "vitest";
import { canonicalSekId } from "./variants";

describe("canonicalSekId", () => {
  it("collapses _Melee / _Ranged usage-mode suffixes to one canonical id", () => {
    expect(canonicalSekId("item_smokeGrenade_Melee")).toBe("item_smokeGrenade");
    expect(canonicalSekId("item_smokeGrenade_Ranged")).toBe("item_smokeGrenade");
    expect(canonicalSekId("item_Tool_Flaregun_Melee")).toBe("item_Tool_Flaregun");
    expect(canonicalSekId("item_Tool_Flaregun_Ranged")).toBe("item_Tool_Flaregun");
  });

  it("keeps element / ballistic variants distinct (NOT collapsed)", () => {
    for (const id of [
      "item_pistolAmmo_Fire", "item_pistolAmmo_Toxic", "item_pistolAmmo_Armor",
      "item_pistolAmmo_highVelocity", "item_turretAmmo_EMP", "item_shotgunAmmo_slug",
      "item_shotgunAmmo_explosive", "item_sniperRifleAmmo_highPenetration",
    ]) {
      expect(canonicalSekId(id)).toBe(id);
    }
  });

  it("leaves plain ids untouched", () => {
    expect(canonicalSekId("game_keyIslandDoorRed")).toBe("game_keyIslandDoorRed");
    expect(canonicalSekId("item_multiTool")).toBe("item_multiTool");
  });

  it("is case-insensitive on the suffix and strips only a trailing match", () => {
    expect(canonicalSekId("item_foo_melee")).toBe("item_foo");
    expect(canonicalSekId("item_meleeWeapon")).toBe("item_meleeWeapon"); // not a suffix
  });
});
