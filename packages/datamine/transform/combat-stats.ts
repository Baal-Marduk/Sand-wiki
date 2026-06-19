import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Entity, ItemStats } from "@sandlabs/data";
import type { ReconcileHit } from "./reconcile";
import { canonicalSekId } from "./variants";

const SEK = resolve(import.meta.dirname, "../sek-out");

export interface Range { full: number | null; max: number | null; minMult: number | null; falloff: boolean | null }
export interface WeaponStat { reloadSeconds: number | null; range: Range | null }
export interface AmmoStat { turret: boolean; damagePhysical: number | null; range: Range | null; penetrates: boolean | null; stack: number[] | null }
export interface ArmorStat { armorRating: number | null; regen: { delay: number | null; speed: number | null } | null; durability: number | null }
export interface TurretStat { fireRate: number | null; clipSize: number | null; reloadSeconds: number | null; projectileVelocity: number | null; penetrates: boolean | null }
export interface WeaponStatsFile { weapons: Record<string, WeaponStat>; ammo: Record<string, AmmoStat>; armor: Record<string, ArmorStat> }

/** weapon_stats.json (release: weapons/ammo/armor). Empty shape when absent → merge is a no-op. */
export function loadWeaponStats(dir = SEK): WeaponStatsFile {
  const p = resolve(dir, "weapon_stats.json");
  if (!existsSync(p)) return { weapons: {}, ammo: {}, armor: {} };
  const d = JSON.parse(readFileSync(p, "utf-8"));
  return { weapons: d.weapons ?? {}, ammo: d.ammo ?? {}, armor: d.armor ?? {} };
}

/** turret_stats.json (.turrets map). Empty when absent. */
export function loadTurretStats(dir = SEK): Record<string, TurretStat> {
  const p = resolve(dir, "turret_stats.json");
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf-8")).turrets ?? {};
}

type Patch = Partial<ItemStats>;
const set = (p: Patch, k: keyof ItemStats, v: number | boolean | null | undefined) => {
  if (v !== null && v !== undefined) (p as Record<string, unknown>)[k] = v;
};
function rangeInto(p: Patch, r: Range | null) {
  if (!r) return;
  set(p, "rangeFull", r.full); set(p, "rangeMax", r.max);
  set(p, "rangeMinMult", r.minMult); set(p, "rangeFalloff", r.falloff);
}
function weaponPatch(w: WeaponStat): Patch { const p: Patch = {}; set(p, "reloadSeconds", w.reloadSeconds); rangeInto(p, w.range); return p; }
function ammoPatch(a: AmmoStat): Patch { const p: Patch = {}; set(p, "damage", a.damagePhysical); rangeInto(p, a.range); set(p, "penetrates", a.penetrates); return p; }
function armorPatch(a: ArmorStat): Patch {
  const p: Patch = {}; set(p, "armorRating", a.armorRating);
  if (a.regen) { set(p, "armorRegenDelay", a.regen.delay); set(p, "armorRegenSpeed", a.regen.speed); }
  set(p, "armorDurability", a.durability); return p;
}
function turretPatch(t: TurretStat): Patch {
  const p: Patch = {}; set(p, "fireRate", t.fireRate); set(p, "magazine", t.clipSize);
  set(p, "reloadSeconds", t.reloadSeconds); set(p, "projectileVelocity", t.projectileVelocity);
  set(p, "penetrates", t.penetrates); return p;
}

const EMPTY_ITEM_STATS: ItemStats = {
  storageStack: null, workbenchTier: null, statType: null, statValue: null, damage: null,
  playerDamage: null, tramplerDamage: null, splashDamage: null, magazine: null, ammoName: null,
  ammoType: null, reloadSeconds: null, rangeFull: null, rangeMax: null, rangeMinMult: null,
  rangeFalloff: null, penetrates: null, armorRating: null, armorRegenDelay: null,
  armorRegenSpeed: null, armorDurability: null, fireRate: null, projectileVelocity: null,
};

/** Merge datamined combat stats over baseline ITEM entities. Reconcile each SEK id (canonical)
 *  via bySekId → slug, build a per-slug patch (an item may be weapon+ammo+turret → patches merge),
 *  and refresh those fields over the baseline itemStats (creating it from nulls if absent). Only
 *  datamine-provided fields are written; baseline extras (ammoType, statType, workbenchTier,
 *  storageStack, …) are preserved. storageStack is intentionally NOT sourced from ammo `stack`. */
export function mergeCombatStats(
  baseline: Entity[],
  weaponStats: WeaponStatsFile,
  turretStats: Record<string, TurretStat>,
  bySekId: Map<string, ReconcileHit>,
): Entity[] {
  const patchBySlug = new Map<string, Patch>();
  const add = (sekId: string, patch: Patch) => {
    if (Object.keys(patch).length === 0) return;
    const h = bySekId.get(canonicalSekId(sekId));
    if (!h) return;
    patchBySlug.set(h.slug, { ...(patchBySlug.get(h.slug) ?? {}), ...patch });
  };
  for (const [id, w] of Object.entries(weaponStats.weapons)) add(id, weaponPatch(w));
  for (const [id, a] of Object.entries(weaponStats.ammo)) add(id, ammoPatch(a));
  for (const [id, a] of Object.entries(weaponStats.armor)) add(id, armorPatch(a));
  for (const [id, t] of Object.entries(turretStats)) add(id, turretPatch(t));

  return baseline.map((e) => {
    const patch = patchBySlug.get(e.slug);
    if (!patch) return e;
    return { ...e, itemStats: { ...(e.itemStats ?? EMPTY_ITEM_STATS), ...patch } };
  });
}
