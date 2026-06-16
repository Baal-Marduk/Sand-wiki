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

/** One cost component in an editable/stored buy option. */
export interface BuyCostDraft { targetSlug: string; amount: number }

/** One editable/stored buy option (the shape persisted in a proposal's `changes`). */
export interface BuyOptionDraft {
  yield: number;
  unlockSlug: string | null; // tech-node slug or null
  costs: BuyCostDraft[];
}

/** Stored shape of a buy_options_edit proposal's `changes` JSON. */
export interface BuyOptionsChange { old: BuyOptionDraft[]; new: BuyOptionDraft[] }

/** Flat, index-aligned arrays the BuyOptionsEditor emits. Option-level arrays are
 *  aligned to each other; cost-level arrays are aligned to each other and reference
 *  their option via `costGroups`. */
export interface BuyOptionsForm {
  optGroups: string[];
  optYields: string[];
  optUnlockSlugs: string[];
  costGroups: string[];
  costSlugs: string[];
  costAmounts: string[];
}

export interface ParsedBuyOptions { options: BuyOptionDraft[]; error: string | null }

const posInt = (s: string): number | null => {
  const n = Number((s ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Reconstruct and validate buy options from the editor's flat arrays. Options are
 *  ordered by their position in `optGroups`. Each option needs >=1 cost; amounts and
 *  yields must be positive integers; an empty unlock slug means no unlock. */
export function parseBuyOptionsForm(form: BuyOptionsForm): ParsedBuyOptions {
  const costsByGroup = new Map<string, BuyCostDraft[]>();
  for (let i = 0; i < form.costSlugs.length; i++) {
    const slug = (form.costSlugs[i] ?? "").trim();
    if (slug === "") continue;
    const amount = posInt(form.costAmounts[i] ?? "");
    if (amount === null) return { options: [], error: `Cost amount for ${slug} must be a positive whole number.` };
    const g = form.costGroups[i] ?? "";
    (costsByGroup.get(g) ?? costsByGroup.set(g, []).get(g)!).push({ targetSlug: slug, amount });
  }

  const options: BuyOptionDraft[] = [];
  for (let i = 0; i < form.optGroups.length; i++) {
    const g = form.optGroups[i] ?? "";
    const costs = costsByGroup.get(g) ?? [];
    if (costs.length === 0) return { options: [], error: "Each buy option needs at least one cost component." };
    const y = posInt(form.optYields[i] ?? "");
    if (y === null) return { options: [], error: "Buy option yield must be a positive whole number." };
    const unlockSlug = (form.optUnlockSlugs[i] ?? "").trim() || null;
    options.push({ yield: y, unlockSlug, costs });
  }
  return { options, error: null };
}

/** Order-sensitive equality of two option lists (for the no-op check). */
export function buyOptionsEqual(a: BuyOptionDraft[], b: BuyOptionDraft[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((o, i) => {
    const p = b[i];
    return o.yield === p.yield && o.unlockSlug === p.unlockSlug &&
      o.costs.length === p.costs.length &&
      o.costs.every((c, j) => c.targetSlug === p.costs[j].targetSlug && c.amount === p.costs[j].amount);
  });
}
