import type { StatCell, DetailRow } from "@/lib/item-view";

/** The numeric/spec fields on a trampler part shown in the prominent stat grid. */
export interface TramplerStatFields {
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
}

/** Prominent stat-grid cells — only fields that have a value. Numeric 0 is kept;
 *  null and empty strings are dropped. Order is fixed. */
export function tramplerStatCells(part: TramplerStatFields): StatCell[] {
  const cells: StatCell[] = [];
  if (part.dimensions) cells.push({ label: "Dimensions", value: part.dimensions });
  if (part.health != null) cells.push({ label: "Health", value: part.health });
  if (part.weight != null) cells.push({ label: "Weight", value: part.weight });
  if (part.weightCapacity != null) cells.push({ label: "Weight Capacity", value: part.weightCapacity });
  if (part.weightCompensation != null) cells.push({ label: "Weight Compensation", value: part.weightCompensation });
  if (part.energyConsumption != null) cells.push({ label: "Energy Consumption", value: part.energyConsumption });
  if (part.energyCapacity != null) cells.push({ label: "Energy Capacity", value: part.energyCapacity });
  if (part.ratedPower != null) cells.push({ label: "Rated Power", value: part.ratedPower });
  if (part.crewSlots != null) cells.push({ label: "Crew Slots", value: part.crewSlots });
  if (part.itemSlots != null) cells.push({ label: "Item Slots", value: part.itemSlots });
  return cells;
}

/** The research fields on a trampler part shown in the Details sidebar. */
export interface TramplerResearchFields {
  researchNode: string | null;
  researchName: string | null;
  researchTier: number | null;
}

/** Details-panel rows for a trampler part: a joined Research row and a Research Tier row,
 *  each only when present. */
export function tramplerDetailRows(part: TramplerResearchFields): DetailRow[] {
  const rows: DetailRow[] = [];
  const research = [part.researchNode, part.researchName].filter(Boolean).join(". ");
  if (research) rows.push({ label: "Research", value: research });
  if (part.researchTier != null) rows.push({ label: "Research Tier", value: String(part.researchTier) });
  return rows;
}
