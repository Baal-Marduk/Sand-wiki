import type { DataSet } from "./types";

/** Minimal hand-built dataset exercising every index: an item produced by a recipe,
 *  a container that loots it, a trampler part with a cost link, a tech node, and a
 *  disabled item that must be scrubbed. */
export const fixture: DataSet = {
  entities: [
    {
      id: "1", slug: "iron", kind: "item", name: "Iron", description: null,
      category: "resources", rarity: "Common", icon: "/i/iron.png", imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: null, tramplerStats: null, techNodeStats: null,
    },
    {
      id: "2", slug: "rifle", kind: "item", name: "Rifle", description: null,
      category: "weapons", rarity: "Rare", icon: "/i/rifle.png", imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: { ...nullStats(), workbenchTier: 2, ammoType: "9x42 mm" },
      tramplerStats: null, techNodeStats: null,
    },
    {
      id: "3", slug: "ammo-9x42", kind: "item", name: "9x42 mm Ammo", description: null,
      category: "ammo", rarity: "Common", icon: "/i/ammo.png", imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: { ...nullStats(), ammoType: "9x42 mm" },
      tramplerStats: null, techNodeStats: null,
    },
    {
      id: "4", slug: "crate", kind: "environment", name: "Crate", description: null,
      category: "loot-containers", rarity: null, icon: "/i/crate.png", imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: null, tramplerStats: null, techNodeStats: null,
    },
    {
      id: "5", slug: "hull", kind: "trampler-part", name: "Hull", description: null,
      category: "chassis", rarity: "Common", icon: "/i/hull.png", imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: null,
      tramplerStats: { ...nullTrampler(), researchTier: 1 },
      techNodeStats: null,
    },
    {
      id: "6", slug: "tech-kaiser-t1a-hull", kind: "tech-node", name: "Hull Tech",
      description: null, category: "tech", rarity: null, icon: null, imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: null, tramplerStats: null,
      techNodeStats: { faction: "kaiser", tier: 1, sortOrder: 0 },
    },
    {
      id: "7", slug: "ghost", kind: "item", name: "Ghost", description: null,
      category: "resources", rarity: "Common", icon: null, imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: true,
      itemStats: null, tramplerStats: null, techNodeStats: null,
    },
  ],
  recipes: [
    {
      slug: "rifle-recipe", workbench: "Bench", tier: 2, craftTimeSeconds: 5,
      locationSlug: null,
      inputs: [{ itemSlug: "iron", amount: 3 }],
      outputs: [{ itemSlug: "rifle", amount: 1 }],
    },
  ],
  links: [
    { sourceSlug: "crate", targetSlug: "iron", role: "loot", name: "Iron", amount: null, tier: "Tier 1", value1: "50", value2: null, value3: null, sortOrder: 0, buyGroup: null },
    { sourceSlug: "crate", targetSlug: "ghost", role: "loot", name: "Ghost", amount: null, tier: "Tier 1", value1: "1", value2: null, value3: null, sortOrder: 1, buyGroup: null },
    { sourceSlug: "hull", targetSlug: "iron", role: "cost", name: "Iron", amount: 10, tier: null, value1: null, value2: null, value3: null, sortOrder: 0, buyGroup: null },
    { sourceSlug: "tech-kaiser-t1a-hull", targetSlug: "hull", role: "tech-unlocks", name: "Hull", amount: null, tier: null, value1: null, value2: null, value3: null, sortOrder: 0, buyGroup: null },
  ],
};

function nullStats() {
  return {
    storageStack: null, workbenchTier: null, statType: null, statValue: null,
    damage: null, playerDamage: null, tramplerDamage: null, splashDamage: null,
    magazine: null, ammoName: null, ammoType: null, reloadSeconds: null,
    rangeFull: null, rangeMax: null, rangeMinMult: null, rangeFalloff: null,
    penetrates: null, armorRating: null, armorRegenDelay: null, armorRegenSpeed: null,
    armorDurability: null, fireRate: null, projectileVelocity: null,
  };
}
function nullTrampler() {
  return {
    dimensions: null, health: null, weight: null, weightCapacity: null,
    weightCompensation: null, energyConsumption: null, energyCapacity: null,
    ratedPower: null, crewSlots: null, itemSlots: null,
    researchNode: null, researchName: null, researchTier: null,
  };
}
