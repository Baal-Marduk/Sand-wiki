import { describe, it, expect } from "vitest";
import {
  SECTIONS, ITEM_CATEGORIES, ITEM_CATEGORY_SLUGS,
  isItemCategory, categoryLabel, getSection, categoryForType, categoryForItem,
  isEnvCategory, CATEGORY_COLORS, categoryColor,
  isTramplerCategory, tramplerCategoryForName, TRAMPLER_CATEGORY_SLUGS,
  isWeaponClassCategory, WEAPON_CLASS_CATEGORIES,
  isWipSection,
} from "./taxonomy";

describe("taxonomy", () => {
  it("exposes the five top-level sections in order", () => {
    expect(SECTIONS.map((s) => s.slug)).toEqual([
      "items", "environment", "tramplers", "tech", "tools",
    ]);
  });

  it("has unique section slugs", () => {
    expect(new Set(SECTIONS.map((s) => s.slug)).size).toBe(SECTIONS.length);
  });

  it("has unique category slugs within each section", () => {
    for (const s of SECTIONS) {
      const slugs = s.categories.map((c) => c.slug);
      expect(new Set(slugs).size, `duplicate in ${s.slug}`).toBe(slugs.length);
    }
  });

  it("defines the eight item categories", () => {
    expect(ITEM_CATEGORY_SLUGS).toEqual([
      "weapons", "artillery", "resources", "attire", "tools", "medical", "ammo", "misc",
    ]);
    expect(ITEM_CATEGORIES.every((c) => c.label.length > 0)).toBe(true);
  });

  it("validates item categories", () => {
    expect(isItemCategory("weapons")).toBe(true);
    expect(isItemCategory("npcs")).toBe(false);
    expect(isItemCategory("nope")).toBe(false);
  });

  it("maps a category slug to its label, falling back to the slug", () => {
    expect(categoryLabel("weapons")).toBe("Weapons");
    expect(categoryLabel("loot-containers")).toBe("Loot Containers");
    expect(categoryLabel("game-modes")).toBe("Game Modes");
    expect(categoryLabel("unknown")).toBe("unknown");
  });

  it("looks up a section by slug", () => {
    expect(getSection("environment")?.label).toBe("Environment");
    expect(getSection("missing")).toBeUndefined();
  });

  it("environment is a data section with the four env categories", () => {
    const env = getSection("environment");
    expect(env?.kind).toBe("data");
    expect(env?.categories.map((c) => c.slug)).toEqual([
      "loot-containers", "landmarks", "game-modes", "npcs",
    ]);
  });

  it("validates env categories", () => {
    expect(isEnvCategory("loot-containers")).toBe(true);
    expect(isEnvCategory("landmarks")).toBe(true);
    expect(isEnvCategory("weapons")).toBe(false);
  });

  it("exposes the nine trampler categories as a data section", () => {
    const tr = getSection("tramplers");
    expect(tr?.kind).toBe("data");
    expect(tr?.categories.map((c) => c.slug)).toEqual([
      "chassis", "reactors", "engines", "crew", "driving",
      "cargo", "turrets", "stations", "structure",
    ]);
    expect(isTramplerCategory("chassis")).toBe(true);
    expect(isTramplerCategory("weapons")).toBe(false);
  });

  it("maps component names to functional categories, specific before generic", () => {
    expect(tramplerCategoryForName("KF-B \"Hole\" Middling Chassis")).toBe("chassis");
    expect(tramplerCategoryForName("NZ AzE80 Motor-Reactor, Covered (1x3)")).toBe("reactors");
    expect(tramplerCategoryForName("NZ Mb2k Maneuver Engine, Small")).toBe("engines");
    expect(tramplerCategoryForName("S&H MK4 Crew Cabin, 4 People")).toBe("crew");
    expect(tramplerCategoryForName("S&H M78 Framed Steering Deck")).toBe("driving");
    expect(tramplerCategoryForName("S&H Cargo Bay, L-Shape")).toBe("cargo");
    expect(tramplerCategoryForName("S.Trs Turret Deck")).toBe("turrets");
    expect(tramplerCategoryForName("S&H Armaments Workbench")).toBe("stations");
    expect(tramplerCategoryForName("S&H Supporting Frame")).toBe("structure");
  });

  it("resolves trampler category labels", () => {
    expect(categoryLabel("stations")).toBe("Crafting Stations");
    expect(categoryLabel("chassis")).toBe("Chassis");
  });
});

describe("categoryForType", () => {
  it("maps known game types to wiki categories", () => {
    expect(categoryForType("WEAPON")).toBe("weapons");
    expect(categoryForType("WEAPON_BELT")).toBe("weapons");
    expect(categoryForType("AMMO")).toBe("ammo");
    expect(categoryForType("TURRET_AMMO")).toBe("ammo");
    expect(categoryForType("RESOURCE_T1")).toBe("resources");
    expect(categoryForType("RESOURCE_T3")).toBe("resources");
    expect(categoryForType("ENERGY")).toBe("tools");
    expect(categoryForType("ARMOR")).toBe("attire");
    expect(categoryForType("BACKPACK")).toBe("attire");
    expect(categoryForType("ATTACK_CONSUMABLE")).toBe("weapons");
    expect(categoryForType("RAID_EXPLOSIVES")).toBe("weapons");
    expect(categoryForType("UTILITY_CONSUMABLE")).toBe("tools");
    expect(categoryForType("FOOD")).toBe("medical");
    expect(categoryForType("KEY")).toBe("misc");
    expect(categoryForType("MONEY")).toBe("misc");
    expect(categoryForType("LARGE_VALUABLE")).toBe("misc");
    expect(categoryForType("SMALL_VALUABLE")).toBe("misc");
  });

  it("maps null/unknown types to misc", () => {
    expect(categoryForType(null)).toBe("misc");
    expect(categoryForType("SOME_NEW_TYPE")).toBe("misc");
  });
});

describe("categoryForItem", () => {
  it("routes mm-named weapons to artillery", () => {
    expect(categoryForItem("WEAPON", "40mm Cannon")).toBe("artillery");
    expect(categoryForItem("WEAPON", "85 mm Howitzer")).toBe("artillery");
    expect(categoryForItem("WEAPON_BELT", "120mm Belt")).toBe("artillery");
  });

  it("keeps non-mm weapons in weapons", () => {
    expect(categoryForItem("WEAPON", "Assault Rifle")).toBe("weapons");
    expect(categoryForItem("WEAPON_BELT", "Ammo Belt")).toBe("weapons");
  });

  it("only applies the mm rule to weapon types", () => {
    // "mm" in a non-weapon name must not move it to artillery
    expect(categoryForItem("FOOD", "Yummy 9mm Snack")).toBe("medical");
    expect(categoryForItem("RESOURCE_T1", "100mm Scrap")).toBe("resources");
  });

  it("falls back to type mapping for null/unknown", () => {
    expect(categoryForItem(null, "anything")).toBe("misc");
    expect(categoryForItem("SOME_NEW_TYPE", "40mm")).toBe("misc");
  });

  it("applies per-slug overrides ahead of the type mapping", () => {
    // Untyped weapon and a utility-typed medical item.
    expect(categoryForItem(null, 'M1866/9 "Einzel" Breechloader', "rifle-musket")).toBe("weapons");
    expect(categoryForItem("UTILITY_CONSUMABLE", "MedKit", "med-kit")).toBe("medical");
    // Deployable defensive consumables: ATTACK_CONSUMABLE would map to weapons.
    expect(categoryForItem("ATTACK_CONSUMABLE", "Pestkop Lorenz Amplifier", "projectile-amplifier")).toBe("tools");
    expect(categoryForItem("ATTACK_CONSUMABLE", "Von Liebig Reflector", "projectile-deflect-shield")).toBe("tools");
    expect(categoryForItem("ATTACK_CONSUMABLE", "Domovyk Protective Dome", "projectile-sphere-shield")).toBe("tools");
  });

  it("leaves non-overridden slugs to the normal mapping", () => {
    expect(categoryForItem("UTILITY_CONSUMABLE", "Repair Kit", "repair-kit")).toBe("tools");
    expect(categoryForItem("ENERGY", "NZ Mk2 Energy Rod", "energy-rod-mk2")).toBe("tools");
  });
});

describe("category colors", () => {
  it("defines a color for every item category", () => {
    for (const slug of ITEM_CATEGORY_SLUGS) {
      expect(CATEGORY_COLORS[slug], `missing color for ${slug}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("defines a color for every trampler category", () => {
    for (const slug of TRAMPLER_CATEGORY_SLUGS) {
      expect(CATEGORY_COLORS[slug], `missing color for ${slug}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("falls back to the misc color for unknown slugs", () => {
    expect(categoryColor("nope")).toBe(CATEGORY_COLORS.misc);
    expect(categoryColor("weapons")).toBe("#d4654f");
  });
});

describe("isWeaponClassCategory", () => {
  it("is true only for caliber-bearing categories", () => {
    expect(WEAPON_CLASS_CATEGORIES).toEqual(["weapons", "artillery", "ammo"]);
    expect(isWeaponClassCategory("weapons")).toBe(true);
    expect(isWeaponClassCategory("artillery")).toBe(true);
    expect(isWeaponClassCategory("ammo")).toBe(true);
    expect(isWeaponClassCategory("tools")).toBe(false);
    expect(isWeaponClassCategory(undefined)).toBe(false);
  });
});

describe("WIP markers", () => {
  it("flags placeholder sections as WIP", () => {
    expect(isWipSection(getSection("tech")!)).toBe(true);
    expect(isWipSection(getSection("tools")!)).toBe(true);
  });
  it("does not flag data sections as WIP", () => {
    expect(isWipSection(getSection("items")!)).toBe(false);
    expect(isWipSection(getSection("environment")!)).toBe(false);
    expect(isWipSection(getSection("tramplers")!)).toBe(false);
  });
  it("marks the NPCs env category wip and leaves the others live", () => {
    const env = getSection("environment")!;
    const bySlug = Object.fromEntries(env.categories.map((c) => [c.slug, c]));
    expect(bySlug["npcs"].wip).toBe(true);
    expect(bySlug["loot-containers"].wip).toBeFalsy();
    expect(bySlug["landmarks"].wip).toBeFalsy();
    expect(bySlug["game-modes"].wip).toBeFalsy();
  });
});
