/** A loaded EntityLink row participating in buy options, target resolved to slug/kind. */
export interface BuyLinkRow {
  role: string; // "buy-cost" | "buy-yield" | "buy-unlock"
  buyGroup: number | null;
  amount: number | null;
  name: string;
  target: { slug: string; kind: string | null; icon: string | null; rarity: string | null } | null;
}

export interface BuyCostView {
  slug: string | null;
  name: string;
  icon: string | null;
  rarity: string | null;
  amount: number;
}

/** One buy option, ready to render. `yield` = quantity received (default 1). */
export interface BuyOptionView {
  group: number;
  costs: BuyCostView[];
  yield: number;
  unlock: { slug: string; name: string } | null;
}

/** Group flat buy links into options by `buyGroup` (ascending). Rows with a null
 *  buyGroup are ignored. Within a group: buy-cost rows are the price (in arrival
 *  order), the buy-yield row's amount is the quantity received (absent => 1), and the
 *  optional buy-unlock row (target = tech node) is the gate. */
export function groupBuyOptions(rows: BuyLinkRow[]): BuyOptionView[] {
  const byGroup = new Map<number, BuyLinkRow[]>();
  for (const r of rows) {
    if (r.buyGroup === null) continue;
    (byGroup.get(r.buyGroup) ?? byGroup.set(r.buyGroup, []).get(r.buyGroup)!).push(r);
  }
  return [...byGroup.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([group, rs]) => {
      const costs: BuyCostView[] = rs
        .filter((r) => r.role === "buy-cost")
        .map((r) => ({
          slug: r.target?.slug ?? null,
          name: r.name,
          icon: r.target?.icon ?? null,
          rarity: r.target?.rarity ?? null,
          amount: r.amount ?? 1,
        }));
      const yieldRow = rs.find((r) => r.role === "buy-yield");
      const unlockRow = rs.find((r) => r.role === "buy-unlock" && r.target);
      return {
        group,
        costs,
        yield: yieldRow?.amount ?? 1,
        unlock: unlockRow?.target ? { slug: unlockRow.target.slug, name: unlockRow.name } : null,
      };
    });
}
