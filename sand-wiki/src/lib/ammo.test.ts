import { describe, it, expect } from "vitest";
import { ammoCaliber, weaponCaliber, caliberLabel, ammoTypeFor, itemClasses, CLASS_ORDER } from "./ammo";
// (itemClass removed: class is now derived from the stored ammoType)

describe("ammoCaliber", () => {
  it("reads NxN mm without degrading to the second number", () => {
    expect(ammoCaliber("11x54 mm Ammo")).toBe("11x54 mm");
    expect(ammoCaliber("11x54 mm AP Ammo")).toBe("11x54 mm");
    expect(ammoCaliber("8x21 mm FMJ Ammo")).toBe("8x21 mm");
  });
  it("reads shotgun gauge", () => {
    expect(ammoCaliber("12 GA Toxic Ammo")).toBe("12 GA");
  });
  it("reads plain mm shells", () => {
    expect(ammoCaliber("Long-Range 40 mm Shell")).toBe("40 mm");
    expect(ammoCaliber("High Velocity 80 mm Shell")).toBe("80 mm");
  });
  it("recognises rockets and returns null otherwise", () => {
    expect(ammoCaliber("High-Explosive Rocket")).toBe("Rocket");
    expect(ammoCaliber("Bandages")).toBeNull();
  });
});

describe("weaponCaliber", () => {
  it("derives from ammoName when present", () => {
    expect(weaponCaliber("rifle-musket", "9x42 mm Ammo")).toBe("9x42 mm");
  });
  it("derives turrets from the slug prefix", () => {
    expect(weaponCaliber("game-packed-auto-turret-t1-container", null)).toBe("40 mm");
    expect(weaponCaliber("game-packed-shotgun-turret-t1-container", null)).toBe("70 mm");
    expect(weaponCaliber("game-packed-turret-t4-rail-gun-container", null)).toBe("80 mm");
  });
  it("returns null for items with no ammo and no override", () => {
    expect(weaponCaliber("c4-dynamite", null)).toBeNull();
  });
});

describe("caliberLabel", () => {
  it("maps small arms to gun class and shells to artillery class", () => {
    expect(caliberLabel("11x54 mm")).toBe("Sniper");
    expect(caliberLabel("8x21 mm")).toBe("Pistol");
    expect(caliberLabel("9x42 mm")).toBe("Rifle");
    expect(caliberLabel("12 GA")).toBe("Shotgun");
    expect(caliberLabel("40 mm")).toBe("Autocannon");
    expect(caliberLabel("70 mm")).toBe("Shotgun");
    expect(caliberLabel("80 mm")).toBe("Naval");
  });
  it("returns null for unknown or null", () => {
    expect(caliberLabel("999 mm")).toBeNull();
    expect(caliberLabel(null)).toBeNull();
  });
});

describe("ammoTypeFor", () => {
  it("derives ammo items from their own name", () => {
    expect(ammoTypeFor("ammo", "ammo-1154", "11x54 mm AP Ammo", null)).toBe("11x54 mm");
  });
  it("derives weapons from ammoName", () => {
    expect(ammoTypeFor("weapons", "service-rifle", "Service Rifle", "9x42 mm Ammo")).toBe("9x42 mm");
  });
  it("derives artillery turrets from the slug override when ammoName is null", () => {
    expect(ammoTypeFor("artillery", "game-packed-shotgun-turret-t1-container", "Packed Shotgun Turret", null)).toBe("70 mm");
  });
  it("returns null for non-weapon, non-ammo categories", () => {
    expect(ammoTypeFor("medical", "bandages", "Bandages", null)).toBeNull();
  });
});

describe("itemClasses", () => {
  it("returns distinct present classes in canonical order, from stored ammoType", () => {
    const rows = [
      { ammoType: "11x54 mm" }, // Sniper
      { ammoType: "9x42 mm" },  // Rifle
      { ammoType: "8x21 mm" },  // Pistol
      { ammoType: null },       // none
    ];
    expect(itemClasses(rows)).toEqual(["Pistol", "Rifle", "Sniper"]);
  });
  it("CLASS_ORDER lists every label caliberLabel can return", () => {
    expect(CLASS_ORDER).toEqual(["Pistol", "Rifle", "Sniper", "Shotgun", "Autocannon", "Naval", "Rocket"]);
  });
});
