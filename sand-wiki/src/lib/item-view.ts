import type { ItemTrades } from "@/lib/trades";
import { formatCrowns } from "@/lib/trades";
import { categoryLabel } from "@/lib/taxonomy";

export interface DetailRow { label: string; value: string }

export interface ItemFacts {
  category: string;
  isResource: boolean;
  storageStack: number | null;
  workbenchTier: number | null;
}

/** Detail-panel rows — only those we have a value for. */
export function itemDetailRows(facts: ItemFacts, trades: ItemTrades): DetailRow[] {
  const rows: DetailRow[] = [{ label: "Category", value: categoryLabel(facts.category) }];
  if (facts.storageStack !== null) rows.push({ label: "Stack size", value: `×${facts.storageStack}` });
  if (facts.workbenchTier !== null) rows.push({ label: "Workbench tier", value: String(facts.workbenchTier) });
  if (facts.isResource) rows.push({ label: "Resource", value: "Yes" });
  if (trades.buy.length > 0) {
    const cheapest = Math.min(...trades.buy.map((b) => b.unitPrice));
    rows.push({ label: "Buyable", value: `${formatCrowns(cheapest)} ◈ / unit` });
  }
  if (trades.sell.length > 0) {
    const best = Math.max(...trades.sell.map((s) => s.unitPrice));
    rows.push({ label: "Sellable", value: `${formatCrowns(best)} ◈ / unit` });
  }
  return rows;
}

export type TabId = "crafted-by" | "used-in" | "buy" | "sell" | "loot";
export interface TabDef { id: TabId; label: string }

/** Available relationship tabs in fixed order, only those with data. */
export function availableTabs(trades: ItemTrades): TabDef[] {
  const tabs: TabDef[] = [];
  if (trades.crafts.length > 0) tabs.push({ id: "crafted-by", label: "Crafted by" });
  if (trades.usedInCrafts.length > 0) tabs.push({ id: "used-in", label: "Used in" });
  if (trades.buy.length > 0) tabs.push({ id: "buy", label: "Buy" });
  if (trades.sell.length > 0) tabs.push({ id: "sell", label: "Sell" });
  return tabs;
}
