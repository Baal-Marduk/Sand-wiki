/** Shared types + pure transforms for the datamined weapon/ammo/armor stats import.
 *  Source: SEK site/src/data/weapon_stats.json (copied to datamine/data/weapon_stats.json).
 *  Imported by build-weapon-stats.ts (reshape → prisma/weapon-stats.json) and
 *  load-weapon-stats.ts (writes ItemStats). Mirrors the prisma/loot-containers.ts pattern. */

export interface RangeRaw { full: number; max: number; minMult: number; falloff: boolean }
export interface WeaponRaw { reloadSeconds: number | null; range: RangeRaw | null; recoil: unknown; spread: unknown }
export interface AmmoRaw {
  turret: boolean;
  damagePhysical: number | null;
  range: RangeRaw | null;
  penetrates: boolean | null;
  stack: number[];
}
export interface ArmorRaw {
  armorRating: number | null;
  regen: { delay: number; speed: number } | null;
  durability: number | null;
}
export interface WeaponStatsFile {
  weapons: Record<string, WeaponRaw>;
  ammo: Record<string, AmmoRaw>;
  armor: Record<string, ArmorRaw>;
}

/** The subset of ItemStats columns this import manages. All optional; only present keys
 *  are written, so a partial patch never clobbers an unrelated column with null. */
export interface StatPatch {
  damage?: number;
  reloadSeconds?: number;
  rangeFull?: number;
  rangeMax?: number;
  rangeMinMult?: number;
  rangeFalloff?: boolean;
  penetrates?: boolean;
  armorRating?: number;
  armorRegenDelay?: number;
  armorRegenSpeed?: number;
  armorDurability?: number;
}

export interface WeaponStatsArtifact {
  meta: { source: string; items: number };
  items: Record<string, StatPatch>; // keyed by wiki slug
}

/** Drop undefined-valued keys so the artifact and the Prisma update carry only real values. */
function prune(p: StatPatch): StatPatch {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as StatPatch;
}

/** Range → the four range columns. Empty patch when range is null/absent. */
export function rangePatch(range: RangeRaw | null | undefined): StatPatch {
  if (!range) return {};
  return { rangeFull: range.full, rangeMax: range.max, rangeMinMult: range.minMult, rangeFalloff: range.falloff };
}

export function weaponPatch(w: WeaponRaw): StatPatch {
  return prune({
    reloadSeconds: w.reloadSeconds ?? undefined,
    ...rangePatch(w.range),
  });
}

export function ammoPatch(a: AmmoRaw): StatPatch {
  return prune({
    damage: a.damagePhysical == null ? undefined : Math.round(a.damagePhysical),
    penetrates: a.penetrates ?? undefined,
    ...rangePatch(a.range),
  });
}

export function armorPatch(a: ArmorRaw): StatPatch {
  return prune({
    armorRating: a.armorRating ?? undefined,
    armorRegenDelay: a.regen?.delay ?? undefined,
    armorRegenSpeed: a.regen?.speed ?? undefined,
    armorDurability: a.durability ?? undefined,
  });
}
