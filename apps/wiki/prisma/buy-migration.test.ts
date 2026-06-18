import { describe, it, expect } from "vitest";
import { classifyCoinRecipe, buyOptionFromRecipe, boughtItemSlug, type MigRecipe } from "./buy-migration";

const CUR = "coin-crown";
const r = (inputs: [string, number][], outputs: [string, number][]): MigRecipe => ({
  id: "r", slug: "r",
  inputs: inputs.map(([slug, amount]) => ({ slug, amount })),
  outputs: outputs.map(([slug, amount]) => ({ slug, amount })),
});

describe("classifyCoinRecipe", () => {
  it("coins in, item out -> buy", () => {
    expect(classifyCoinRecipe(r([[CUR, 500]], [["cannon", 1]]), CUR)).toBe("buy");
  });
  it("item in, coins out -> sell", () => {
    expect(classifyCoinRecipe(r([["cannon", 1]], [[CUR, 300]]), CUR)).toBe("sell");
  });
  it("no currency -> keep", () => {
    expect(classifyCoinRecipe(r([["wood", 2]], [["plank", 1]]), CUR)).toBe("keep");
  });
  it("currency on both sides -> keep (not a trade)", () => {
    expect(classifyCoinRecipe(r([[CUR, 1]], [[CUR, 2]]), CUR)).toBe("keep");
  });
});

describe("buyOptionFromRecipe", () => {
  it("extracts cost components (non-currency excluded) and yield from the item output", () => {
    const opt = buyOptionFromRecipe(r([[CUR, 500], ["wine-crate", 1]], [["cannon", 2]]), "cannon");
    expect(opt.costs).toEqual([
      { slug: CUR, amount: 500 },
      { slug: "wine-crate", amount: 1 },
    ]);
    expect(opt.yield).toBe(2);
  });
});

describe("boughtItemSlug", () => {
  it("returns the first non-currency output slug", () => {
    expect(boughtItemSlug(r([[CUR, 500]], [["cannon", 1]]), CUR)).toBe("cannon");
  });
  it("returns null when every output is the currency", () => {
    expect(boughtItemSlug(r([["cannon", 1]], [[CUR, 300]]), CUR)).toBeNull();
  });
});
