import type { StatCell } from "@/lib/item-view";
import { StatGrid } from "@/components/StatGrid";

/** The flat wiki-stat columns on Item that StatBox renders. */
export interface ItemStatFields {
  statType: string | null;
  damage: number | null;
  playerDamage: number | null;
  tramplerDamage: number | null;
  splashDamage: number | null;
  magazine: number | null;
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

/** All-null defaults, for callers that may not have an ItemStats row. */
export const EMPTY_ITEM_STATS: ItemStatFields = {
  statType: null, damage: null, playerDamage: null, tramplerDamage: null,
  splashDamage: null, magazine: null, reloadSeconds: null, rangeFull: null,
  rangeMax: null, rangeMinMult: null, rangeFalloff: null, penetrates: null,
  armorRating: null, armorRegenDelay: null, armorRegenSpeed: null,
  armorDurability: null, fireRate: null, projectileVelocity: null,
};

/** "35→150 m", with a "·×0.3" suffix only when the round has damage falloff. */
function formatRange(full: number, max: number, minMult: number | null, falloff: boolean | null): string {
  const base = `${full}→${max} m`;
  return falloff && minMult != null ? `${base} ·×${minMult}` : base;
}

/** "5/s · 6s delay" (or "5/s" when there is no delay). */
function formatRegen(speed: number, delay: number | null): string {
  return delay != null ? `${speed}/s · ${delay}s delay` : `${speed}/s`;
}

export function itemStatCells(item: ItemStatFields, typeLabel?: string): StatCell[] {
  const cells: StatCell[] = [];
  if (item.damage != null) cells.push({ label: "Damage", value: item.damage });
  if (item.playerDamage != null) cells.push({ label: "Damage (Player)", value: item.playerDamage });
  if (item.tramplerDamage != null) cells.push({ label: "Damage (Trampler)", value: item.tramplerDamage });
  if (item.splashDamage != null) cells.push({ label: "Splash Damage", value: item.splashDamage });
  if (item.rangeFull != null && item.rangeMax != null) {
    cells.push({ label: "Range", value: formatRange(item.rangeFull, item.rangeMax, item.rangeMinMult, item.rangeFalloff) });
  }
  if (item.reloadSeconds != null) cells.push({ label: "Reload", value: `${item.reloadSeconds}s` });
  if (item.fireRate != null) cells.push({ label: "Fire rate", value: `${item.fireRate}/s` });
  if (item.projectileVelocity != null) cells.push({ label: "Velocity", value: `${item.projectileVelocity} m/s` });
  if (item.magazine != null) cells.push({ label: "Magazine", value: item.magazine });
  if (item.penetrates === true) cells.push({ label: "Penetrates", value: "Yes" });
  if (item.armorRating != null) cells.push({ label: "Armor", value: item.armorRating });
  if (item.armorDurability != null) cells.push({ label: "Durability", value: item.armorDurability });
  if (item.armorRegenSpeed != null) cells.push({ label: "Regen", value: formatRegen(item.armorRegenSpeed, item.armorRegenDelay) });
  const typeValue = typeLabel ?? item.statType;
  if (typeValue) cells.push({ label: "Type", value: typeValue });
  return cells;
}

/** Prominent grid of wiki-sourced gameplay stats, shown under the detail header.
 *  Renders nothing when there are no displayable stats. */
export function StatBox({ item, typeLabel }: { item: ItemStatFields; typeLabel?: string }) {
  return <StatGrid cells={itemStatCells(item, typeLabel)} />;
}
