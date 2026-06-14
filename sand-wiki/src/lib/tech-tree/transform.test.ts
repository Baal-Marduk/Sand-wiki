import { describe, it, expect } from "vitest";
import { toTechTree, parseLetter } from "./transform";
import type { RawTechRow } from "./types";

function row(over: Partial<RawTechRow> & { slug: string; faction: string; tier: number }): RawTechRow {
  return {
    slug: over.slug,
    name: over.name ?? over.slug,
    techNodeStats: { faction: over.faction, tier: over.tier, sortOrder: null },
    outgoingLinks: over.outgoingLinks ?? [],
  };
}

describe("parseLetter", () => {
  it("extracts the sub-column letter from a tech slug", () => {
    expect(parseLetter("tech-godlewski-t1a-energy-rod")).toBe("a");
    expect(parseLetter("tech-kaiser-t3b-great-chassis")).toBe("b");
  });
  it("returns 'a' when the slug has no parseable letter", () => {
    expect(parseLetter("weird-slug")).toBe("a");
  });
});

describe("toTechTree", () => {
  it("maps crowns, costs (with icons), unlocks, glyph and prereqs", () => {
    const rows: RawTechRow[] = [
      row({
        slug: "tech-godlewski-t1a-energy-rod", faction: "godlewski", tier: 1, name: "Energy Rod",
        outgoingLinks: [
          { role: "tech-unlock-cost", name: "Crowns", amount: 1500, sortOrder: 0,
            target: { slug: "coin-crown", name: "Crowns", icon: "/icons/coin.png", techNodeStats: null } },
          { role: "tech-unlock-cost", name: "Weird Coral", amount: 15, sortOrder: 1,
            target: { slug: "weird-coral", name: "Weird Coral", icon: "/icons/coral.png", techNodeStats: null } },
          { role: "tech-unlocks", name: "NZ Mk2 Energy Rod", amount: null, sortOrder: 0,
            target: { slug: "nz-mk2-energy-rod", name: "NZ Mk2 Energy Rod", icon: "/icons/rod.png", techNodeStats: null } },
        ],
      }),
    ];
    const tree = toTechTree(rows);
    const n = tree.nodes[0];
    expect(n.letter).toBe("a");
    expect(n.crowns).toBe(1500);
    expect(n.costs).toEqual([
      { name: "Crowns", amount: 1500, icon: "/icons/coin.png" },
      { name: "Weird Coral", amount: 15, icon: "/icons/coral.png" },
    ]);
    expect(n.glyphIcon).toBe("/icons/rod.png");
    expect(n.unlocks[0]).toEqual({ name: "NZ Mk2 Energy Rod", slug: "nz-mk2-energy-rod", icon: "/icons/rod.png" });
    expect(n.prereqs).toEqual([]);
    expect(tree.defaultUnlocked).toContain("tech-godlewski-t1a-energy-rod");
  });

  it("keeps same-faction prereqs and drops cross-faction ones", () => {
    const rows: RawTechRow[] = [
      row({ slug: "tech-kaiser-t2b-middling-chassis", faction: "kaiser", tier: 2, name: "Middling Chassis" }),
      row({
        slug: "tech-kaiser-t3b-great-chassis", faction: "kaiser", tier: 3, name: "Great Chassis",
        outgoingLinks: [
          { role: "tech-prereq", name: "II(b) Middling Chassis", amount: null, sortOrder: 0,
            target: { slug: "tech-kaiser-t2b-middling-chassis", name: "Middling Chassis", icon: null, techNodeStats: { faction: "kaiser" } } },
          { role: "tech-prereq", name: "III(a) Great Chassis", amount: null, sortOrder: 1,
            target: { slug: "tech-godlewski-t3a-great-chassis", name: "Great Chassis", icon: null, techNodeStats: { faction: "godlewski" } } },
        ],
      }),
    ];
    const tree = toTechTree(rows);
    const great = tree.nodes.find((n) => n.slug === "tech-kaiser-t3b-great-chassis")!;
    expect(great.prereqs).toEqual(["tech-kaiser-t2b-middling-chassis"]);
    expect(tree.defaultUnlocked).not.toContain("tech-kaiser-t3b-great-chassis");
  });
});
