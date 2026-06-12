import { describe, it, expect } from "vitest";
import {
  recipeToSnapshot,
  parseRecipeLines,
  snapshotsEqual,
  buildLineCreates,
  diffRecipeLines,
  type RecipeSnapshot,
} from "./recipe-proposal";

const names = new Map([["iron", "Iron"], ["bolt", "Bolt"], ["screw", "Screw"]]);

describe("recipeToSnapshot", () => {
  it("flattens a recipe row with included items into a snapshot", () => {
    const snap = recipeToSnapshot({
      workbench: "Forge",
      tier: 1,
      craftTimeSeconds: 5,
      inputs: [{ amount: 2, item: { slug: "iron", name: "Iron" } }],
      outputs: [{ amount: 1, item: { slug: "bolt", name: "Bolt" } }],
    });
    expect(snap).toEqual({
      workbench: "Forge",
      tier: 1,
      craftTimeSeconds: 5,
      inputs: [{ slug: "iron", name: "Iron", amount: 2 }],
      outputs: [{ slug: "bolt", name: "Bolt", amount: 1 }],
    });
  });

  it("preserves null meta fields", () => {
    const snap = recipeToSnapshot({ workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] });
    expect(snap).toEqual({ workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] });
  });
});

describe("parseRecipeLines", () => {
  it("pairs slugs/amounts, drops blank rows, resolves names", () => {
    const r = parseRecipeLines(["iron", "", "bolt"], ["2", "9", "1"], names);
    expect(r.error).toBeNull();
    expect(r.lines).toEqual([
      { slug: "iron", name: "Iron", amount: 2 },
      { slug: "bolt", name: "Bolt", amount: 1 },
    ]);
  });

  it("rejects an unknown slug", () => {
    const r = parseRecipeLines(["mystery"], ["1"], names);
    expect(r.lines).toEqual([]);
    expect(r.error).toMatch(/unknown item/i);
  });

  it("rejects a non-positive or non-integer amount", () => {
    expect(parseRecipeLines(["iron"], ["0"], names).error).toMatch(/positive whole number/i);
    expect(parseRecipeLines(["iron"], ["1.5"], names).error).toMatch(/positive whole number/i);
    expect(parseRecipeLines(["iron"], [""], names).error).toMatch(/positive whole number/i);
  });

  it("rejects the same slug listed twice", () => {
    const r = parseRecipeLines(["iron", "iron"], ["1", "2"], names);
    expect(r.lines).toEqual([]);
    expect(r.error).toMatch(/twice/i);
  });
});

describe("snapshotsEqual", () => {
  const base: RecipeSnapshot = {
    workbench: "Forge", tier: 1, craftTimeSeconds: 5,
    inputs: [{ slug: "iron", name: "Iron", amount: 2 }],
    outputs: [{ slug: "bolt", name: "Bolt", amount: 1 }],
  };
  it("is true for identical snapshots", () => {
    expect(snapshotsEqual(base, JSON.parse(JSON.stringify(base)))).toBe(true);
  });
  it("is false when an amount changes", () => {
    const b = JSON.parse(JSON.stringify(base)) as RecipeSnapshot;
    b.inputs[0].amount = 3;
    expect(snapshotsEqual(base, b)).toBe(false);
  });
  it("is false when meta changes", () => {
    const b = JSON.parse(JSON.stringify(base)) as RecipeSnapshot;
    b.tier = 2;
    expect(snapshotsEqual(base, b)).toBe(false);
  });

  it("is false when only line order differs", () => {
    const twoIn: RecipeSnapshot = { ...base, inputs: [
      { slug: "iron", name: "Iron", amount: 2 },
      { slug: "bolt", name: "Bolt", amount: 1 },
    ] };
    const reordered: RecipeSnapshot = { ...twoIn, inputs: [twoIn.inputs[1], twoIn.inputs[0]] };
    expect(snapshotsEqual(twoIn, reordered)).toBe(false);
  });
});

describe("buildLineCreates", () => {
  const ids = new Map([["iron", "id-iron"], ["bolt", "id-bolt"]]);
  it("resolves slugs to itemId create rows", () => {
    expect(buildLineCreates([{ slug: "iron", name: "Iron", amount: 2 }], ids)).toEqual([
      { itemId: "id-iron", amount: 2 },
    ]);
  });
  it("throws when a slug cannot be resolved", () => {
    expect(() => buildLineCreates([{ slug: "ghost", name: "Ghost", amount: 1 }], ids)).toThrow();
  });
});

describe("diffRecipeLines", () => {
  it("classifies added / removed / changed / same lines", () => {
    const oldL = [
      { slug: "iron", name: "Iron", amount: 2 },
      { slug: "bolt", name: "Bolt", amount: 1 },
    ];
    const newL = [
      { slug: "iron", name: "Iron", amount: 3 },
      { slug: "screw", name: "Screw", amount: 4 },
    ];
    const rows = diffRecipeLines(oldL, newL);
    expect(rows).toEqual([
      { slug: "iron", name: "Iron", oldAmount: 2, newAmount: 3, status: "changed" },
      { slug: "bolt", name: "Bolt", oldAmount: 1, newAmount: null, status: "removed" },
      { slug: "screw", name: "Screw", oldAmount: null, newAmount: 4, status: "added" },
    ]);
  });
});
