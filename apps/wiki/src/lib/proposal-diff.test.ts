import { describe, it, expect } from "vitest";
import { computeDiff } from "./proposal-diff";
import { editableFields } from "./proposal-schema";

const itemFields = editableFields("item");

describe("computeDiff", () => {
  it("includes only changed fields", () => {
    const current = { name: "Scrap", rarity: "Common", statValue: 10 };
    const submitted = { name: "Scrap", rarity: "Rare", statValue: 10 };
    expect(computeDiff(current, submitted, itemFields)).toEqual({
      rarity: { old: "Common", new: "Rare" },
    });
  });

  it("treats null and missing as equal", () => {
    const current = { description: null };
    const submitted = { description: null };
    expect(computeDiff(current, submitted, itemFields)).toEqual({});
  });

  it("captures clearing a value to null", () => {
    const current = { ammoName: "7.62" };
    const submitted = { ammoName: null };
    expect(computeDiff(current, submitted, itemFields)).toEqual({
      ammoName: { old: "7.62", new: null },
    });
  });

  it("ignores fields outside the whitelist", () => {
    const current = { icon: "a.png" } as Record<string, unknown>;
    const submitted = { icon: "b.png" } as Record<string, unknown>;
    expect(computeDiff(current, submitted, itemFields)).toEqual({});
  });
});
