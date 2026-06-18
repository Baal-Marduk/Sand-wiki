// Hand-authored static-data types. Field names/nullability mirror the (soon-removed)
// Prisma entity models so the wiki's existing consumers compile unchanged.

export interface ItemStats {
  storageStack: number | null;
  workbenchTier: number | null;
  statType: string | null;
  statValue: number | null;
  damage: number | null;
  playerDamage: number | null;
  tramplerDamage: number | null;
  splashDamage: number | null;
  magazine: number | null;
  ammoName: string | null;
  ammoType: string | null;
  reloadSeconds: number | null;
  rangeFull: number | null;
  rangeMax: number | null;
  rangeMinMult: number | null;
  rangeFalloff: boolean | null;
  penetrates: boolean | null;
  armorRating: number | null;
  armorRegenDelay: number | null;
  armorRegenSpeed: number | null;
  armorDurability: number | null;
  fireRate: number | null;
  projectileVelocity: number | null;
}

export interface TramplerStats {
  dimensions: string | null;
  health: number | null;
  weight: number | null;
  weightCapacity: number | null;
  weightCompensation: number | null;
  energyConsumption: number | null;
  energyCapacity: number | null;
  ratedPower: number | null;
  crewSlots: number | null;
  itemSlots: number | null;
  researchNode: string | null;
  researchName: string | null;
  researchTier: number | null;
}

export interface TechNodeStats {
  faction: string;
  tier: number;
  sortOrder: number | null;
}

export interface Entity {
  id: string;
  slug: string;
  kind: string; // "item" | "environment" | "trampler-part" | "tech-node"
  name: string;
  description: string | null;
  category: string;
  rarity: string | null;
  icon: string | null;
  imageAlt: string | null;
  derivedName: string | null;
  sourceUrl: string | null;
  disabled: boolean;
  itemStats: ItemStats | null;
  tramplerStats: TramplerStats | null;
  techNodeStats: TechNodeStats | null;
}

/** A directed link between two entities (or a name-only link with no target). */
export interface EntityLink {
  sourceSlug: string;
  targetSlug: string | null;
  role: string;
  name: string;
  amount: number | null;
  tier: string | null;
  value1: string | null;
  value2: string | null;
  value3: string | null;
  sortOrder: number;
  buyGroup: number | null;
}

export interface RecipeLineRow {
  itemSlug: string;
  amount: number;
}

export interface Recipe {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  locationSlug: string | null;
  inputs: RecipeLineRow[];
  outputs: RecipeLineRow[];
}

/** The full on-disk dataset shape (one per generated/*.json file). */
export interface DataSet {
  entities: Entity[];
  recipes: Recipe[];
  links: EntityLink[];
}
