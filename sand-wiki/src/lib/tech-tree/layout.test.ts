import { describe, it, expect } from "vitest";
import { computeLayout, ancestors, descendants, pathCost } from "./layout";
import type { TechTree, TechNode } from "./types";

function node(p: Partial<TechNode> & { slug: string; faction: string; tier: number; letter: string }): TechNode {
  return {
    slug: p.slug, name: p.name ?? p.slug, faction: p.faction, tier: p.tier, letter: p.letter,
    crowns: p.crowns ?? 0, costs: p.costs ?? [], unlocks: p.unlocks ?? [],
    glyphIcon: p.glyphIcon ?? null, prereqs: p.prereqs ?? [],
  };
}

const tree: TechTree = {
  factions: [{ id: "godlewski", name: "G", accent: "#4493f8" }],
  defaultUnlocked: ["g1a-small"],
  nodes: [
    node({ slug: "g1a-small", faction: "godlewski", tier: 1, letter: "a", crowns: 100, costs: [{ name: "Crowns", amount: 100, icon: null }] }),
    node({ slug: "g1a-energy", faction: "godlewski", tier: 1, letter: "a", crowns: 150, costs: [{ name: "Crowns", amount: 150, icon: null }, { name: "Coral", amount: 5, icon: "/c.png" }] }),
    node({ slug: "g2a-mid", faction: "godlewski", tier: 2, letter: "a", crowns: 500, costs: [{ name: "Crowns", amount: 500, icon: null }, { name: "Coral", amount: 10, icon: "/c.png" }], prereqs: ["g1a-small"] }),
  ],
};

describe("computeLayout", () => {
  it("assigns one column per (tier,letter) and groups columns under tiers", () => {
    const L = computeLayout(tree);
    expect(L.cols["1a"]).toBe(0);
    expect(L.cols["2a"]).toBe(1);
    expect(L.tiers.map((t) => t.tier)).toEqual([1, 2]);
    expect(L.tiers[0].cols).toEqual([0]);
  });
  it("stacks same-column nodes into increasing lanes", () => {
    const L = computeLayout(tree);
    const lanes = L.positions.filter((p) => p.col === 0).map((p) => p.lane).sort();
    expect(lanes).toEqual([0, 1]);
  });
  it("creates a root edge for prereq-less nodes and prereq edges otherwise", () => {
    const L = computeLayout(tree);
    expect(L.edges.some((e) => e.from === null && e.to === "g1a-small")).toBe(true);
    expect(L.edges.some((e) => e.from === "g1a-small" && e.to === "g2a-mid")).toBe(true);
  });
});

describe("graph helpers", () => {
  it("ancestors walks the prereq chain", () => {
    expect(ancestors(tree.nodes, "g2a-mid")).toEqual(["g1a-small"]);
  });
  it("descendants walks forward", () => {
    expect(descendants(tree.nodes, "g1a-small")).toEqual(["g2a-mid"]);
  });
});

describe("pathCost", () => {
  it("sums crowns + materials for un-unlocked nodes on the path only", () => {
    const r = pathCost(tree.nodes, ["g2a-mid"], new Set(["g1a-small"]));
    expect(r.remainingCrowns).toBe(500);
    expect(r.fullCrowns).toBe(600);
    expect(r.techsLeft).toBe(1);
    expect(r.materials).toEqual([{ name: "Coral", amount: 10, icon: "/c.png" }]);
  });
});
