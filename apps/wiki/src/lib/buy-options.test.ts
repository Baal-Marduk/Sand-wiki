import { describe, it, expect } from "vitest";
import { groupBuyOptions, type BuyLinkRow } from "./buy-options";
import { parseBuyOptionsForm, type BuyOptionsForm, pricedOptions } from "./buy-options";

const row = (p: Partial<BuyLinkRow>): BuyLinkRow => ({
  role: "buy-cost", buyGroup: 0, amount: 1, name: "X",
  target: { slug: "x", kind: "item", icon: null, rarity: null }, ...p,
});

describe("groupBuyOptions", () => {
  it("bundles rows by buyGroup, ordered by group", () => {
    const rows: BuyLinkRow[] = [
      row({ role: "buy-cost", buyGroup: 1, amount: 1200, name: "Coin Crown", target: { slug: "coin-crown", kind: "item", icon: null, rarity: null } }),
      row({ role: "buy-yield", buyGroup: 1, amount: 1, name: "Cannon", target: { slug: "cannon", kind: "item", icon: null, rarity: null } }),
      row({ role: "buy-cost", buyGroup: 0, amount: 500, name: "Coin Crown", target: { slug: "coin-crown", kind: "item", icon: null, rarity: null } }),
      row({ role: "buy-cost", buyGroup: 0, amount: 1, name: "Wine Crate", target: { slug: "wine-crate", kind: "item", icon: null, rarity: null } }),
      row({ role: "buy-yield", buyGroup: 0, amount: 1, name: "Cannon", target: { slug: "cannon", kind: "item", icon: null, rarity: null } }),
      row({ role: "buy-unlock", buyGroup: 0, amount: null, name: "Heavy Ordnance", target: { slug: "heavy-ordnance", kind: "tech-node", icon: null, rarity: null } }),
    ];
    const opts = groupBuyOptions(rows);
    expect(opts.map((o) => o.group)).toEqual([0, 1]);
    expect(opts[0].costs.map((c) => c.slug)).toEqual(["coin-crown", "wine-crate"]);
    expect(opts[0].yield).toBe(1);
    expect(opts[0].unlock).toEqual({ slug: "heavy-ordnance", name: "Heavy Ordnance" });
    expect(opts[1].costs.map((c) => c.amount)).toEqual([1200]);
    expect(opts[1].unlock).toBeNull();
  });

  it("defaults yield to 1 when no buy-yield row is present", () => {
    const opts = groupBuyOptions([row({ role: "buy-cost", buyGroup: 0, amount: 5 })]);
    expect(opts[0].yield).toBe(1);
  });

  it("ignores rows with a null buyGroup", () => {
    expect(groupBuyOptions([row({ buyGroup: null })])).toEqual([]);
  });
});

describe("parseBuyOptionsForm", () => {
  const valid: BuyOptionsForm = {
    optGroups: ["0", "1"],
    optYields: ["1", "1"],
    optUnlockSlugs: ["heavy-ordnance", ""],
    costGroups: ["0", "0", "1"],
    costSlugs: ["coin-crown", "wine-crate", "coin-crown"],
    costAmounts: ["500", "1", "1200"],
  };

  it("reconstructs options grouped by index, ordered by group", () => {
    const { options, error } = parseBuyOptionsForm(valid);
    expect(error).toBeNull();
    expect(options).toHaveLength(2);
    expect(options[0]).toEqual({
      yield: 1,
      unlockSlug: "heavy-ordnance",
      costs: [{ targetSlug: "coin-crown", amount: 500 }, { targetSlug: "wine-crate", amount: 1 }],
    });
    expect(options[1]).toEqual({ yield: 1, unlockSlug: null, costs: [{ targetSlug: "coin-crown", amount: 1200 }] });
  });

  it("rejects an option with no cost components", () => {
    const { error } = parseBuyOptionsForm({ ...valid, costGroups: ["0"], costSlugs: ["coin-crown"], costAmounts: ["500"] });
    expect(error).toMatch(/at least one/i);
  });

  it("rejects a non-positive amount", () => {
    const { error } = parseBuyOptionsForm({ ...valid, costAmounts: ["0", "1", "1200"] });
    expect(error).toMatch(/positive/i);
  });

  it("rejects a non-positive yield", () => {
    const { error } = parseBuyOptionsForm({ ...valid, optYields: ["0", "1"] });
    expect(error).toMatch(/yield/i);
  });
});

describe("parseBuyOptionsForm — unlock-only options", () => {
  it("accepts an option with an unlock and no costs", () => {
    const { options, error } = parseBuyOptionsForm({
      optGroups: ["0"], optYields: ["1"], optUnlockSlugs: ["heavy-ordnance"],
      costGroups: [], costSlugs: [], costAmounts: [],
    });
    expect(error).toBeNull();
    expect(options).toEqual([{ yield: 1, unlockSlug: "heavy-ordnance", costs: [] }]);
  });

  it("rejects an option with neither cost nor unlock", () => {
    const { error } = parseBuyOptionsForm({
      optGroups: ["0"], optYields: ["1"], optUnlockSlugs: [""],
      costGroups: [], costSlugs: [], costAmounts: [],
    });
    expect(error).toMatch(/cost or .*unlock/i);
  });
});

describe("pricedOptions", () => {
  it("keeps options with costs and drops cost-less ones", () => {
    const withCost = { group: 0, costs: [{ slug: "coin-crown", name: "Coin Crown", icon: null, rarity: null, amount: 5 }], yield: 1, unlock: null };
    const unlockOnly = { group: 1, costs: [], yield: 1, unlock: { slug: "n1", name: "Node 1" } };
    expect(pricedOptions([withCost, unlockOnly])).toEqual([withCost]);
  });
});
