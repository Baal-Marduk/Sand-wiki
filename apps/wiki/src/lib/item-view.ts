import type { ReactNode } from "react";
import type { ItemTrades } from "@/lib/trades";
import { formatCrowns } from "@/lib/trades";
import { categoryLabel } from "@/lib/taxonomy";

/** A detail-panel row. `coin` marks a price row so the panel renders the Crowns sprite
 *  between the figure and `unit` (e.g. "10 [coin] / unit"). */
export interface DetailRow { label: string; value: string; coin?: boolean; unit?: string }

/** A cell in the prominent stat grid (StatGrid). */
export interface StatCell { label: string; value: ReactNode }

export interface ItemFacts {
  category: string;
  storageStack: number | null;
  workbenchTier: number | null;
  value?: number | null;
}

/** Detail-panel rows — only those we have a value for. */
export function itemDetailRows(facts: ItemFacts): DetailRow[] {
  const rows: DetailRow[] = [{ label: "Category", value: categoryLabel(facts.category) }];
  if (facts.workbenchTier !== null) rows.push({ label: "Workbench tier", value: String(facts.workbenchTier) });
  if (facts.value != null) rows.push({ label: "Value", value: formatCrowns(facts.value), coin: true });
  // No "Buyable" row: buy options are shown in the Buy tab.
  // No "Sellable" row: the "Value" row above already conveys an item's sell worth.
  return rows;
}

export type TabId = "buy" | "crafted-by" | "used-in" | "ammo" | "used-by" | "loot";
export interface TabDef { id: TabId; label: string }

/** Available relationship tabs in fixed order, only those with data. */
export function availableTabs(trades: ItemTrades, hasBuyOptions: boolean): TabDef[] {
  const tabs: TabDef[] = [];
  if (hasBuyOptions) tabs.push({ id: "buy", label: "Buy" });
  if (trades.crafts.length > 0) tabs.push({ id: "crafted-by", label: "Crafted by" });
  if (trades.usedInCrafts.length > 0) tabs.push({ id: "used-in", label: "Used in" });
  return tabs;
}
