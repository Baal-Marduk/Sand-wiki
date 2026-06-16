import { describe, it, expect } from "vitest";
import { groupBuyOptions, type BuyLinkRow } from "./buy-options";

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
