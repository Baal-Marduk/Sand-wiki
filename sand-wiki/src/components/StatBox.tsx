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
}

export function itemStatCells(item: ItemStatFields, typeLabel?: string): StatCell[] {
  const cells: StatCell[] = [];
  if (item.damage != null) cells.push({ label: "Damage", value: item.damage });
  if (item.playerDamage != null) cells.push({ label: "Damage (Player)", value: item.playerDamage });
  if (item.tramplerDamage != null) cells.push({ label: "Damage (Trampler)", value: item.tramplerDamage });
  if (item.splashDamage != null) cells.push({ label: "Splash Damage", value: item.splashDamage });
  if (item.magazine != null) cells.push({ label: "Magazine", value: item.magazine });
  const typeValue = typeLabel ?? item.statType;
  if (typeValue) cells.push({ label: "Type", value: typeValue });
  return cells;
}

/** Prominent grid of wiki-sourced gameplay stats, shown under the detail header.
 *  Renders nothing when there are no displayable stats. */
export function StatBox({ item, typeLabel }: { item: ItemStatFields; typeLabel?: string }) {
  return <StatGrid cells={itemStatCells(item, typeLabel)} />;
}
