import { describe, it, expect } from "vitest";
import { applyableUpdate, detectStale } from "./proposal-apply";
import type { Diff } from "./proposal-diff";

const diff: Diff = {
  rarity: { old: "Common", new: "Rare" },
  statValue: { old: 10, new: 25 },
};

describe("applyableUpdate", () => {
  it("builds an update of only whitelisted new values", () => {
    expect(applyableUpdate("item", diff)).toEqual({ rarity: "Rare", statValue: 25 });
  });

  it("drops non-whitelisted fields defensively", () => {
    const tainted: Diff = { ...diff, icon: { old: "a", new: "b" } };
    expect(applyableUpdate("item", tainted)).toEqual({ rarity: "Rare", statValue: 25 });
  });

  it("includes ammoType as an applyable item field routed to the stat extension", () => {
    const diff = { ammoType: { old: null, new: "11x54 mm" } } as unknown as Diff;
    const update = applyableUpdate("item", diff);
    expect(update).toEqual({ ammoType: "11x54 mm" });
  });
});

describe("detectStale", () => {
  it("flags fields whose current value no longer matches the proposed old value", () => {
    const current = { rarity: "Uncommon", statValue: 10 };
    expect(detectStale(diff, current)).toEqual(["rarity"]);
  });

  it("returns empty when the base is unchanged", () => {
    const current = { rarity: "Common", statValue: 10 };
    expect(detectStale(diff, current)).toEqual([]);
  });

  it("treats a current empty string as equal to a null old (no false stale flag)", () => {
    const d: Diff = { ammoName: { old: null, new: "7.62" } };
    expect(detectStale(d, { ammoName: "" })).toEqual([]);
  });
});
