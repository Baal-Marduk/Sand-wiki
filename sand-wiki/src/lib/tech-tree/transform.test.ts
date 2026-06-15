import { describe, it, expect } from "vitest";
import { toTechTree, parseLetter, FACTION_ROOT_PART } from "./transform";
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
    expect(n.crownsIcon).toBe("/icons/coin.png");
    expect(n.costs).toEqual([
      { name: "Crowns", amount: 1500, icon: "/icons/coin.png" },
      { name: "Weird Coral", amount: 15, icon: "/icons/coral.png" },
    ]);
    expect(n.glyphIcon).toBe("/icons/rod.png");
    expect(n.unlocks[0]).toEqual({ name: "NZ Mk2 Energy Rod", slug: "nz-mk2-energy-rod", icon: "/icons/rod.png", href: null });
    expect(n.prereqs).toEqual([]);
    expect(tree.defaultUnlocked).toEqual([]); // fresh start: nothing researched
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
    expect(great.crownsIcon).toBeNull();
    expect(tree.defaultUnlocked).not.toContain("tech-kaiser-t3b-great-chassis");
  });
});

describe("toTechTree — hrefs and root parts", () => {
  it("computes an href for each unlock from the target kind", () => {
    const rows: RawTechRow[] = [
      {
        slug: "tech-godlewski-t1a-weapons", name: "Weapons",
        techNodeStats: { faction: "godlewski", tier: 1, sortOrder: null },
        outgoingLinks: [
          { role: "tech-unlocks", name: "Rifle", amount: null, sortOrder: 0,
            target: { slug: "rifle-musket", name: "Rifle", icon: "/r.png", kind: "item", techNodeStats: null } },
          { role: "tech-unlocks", name: "Deck", amount: null, sortOrder: 1,
            target: { slug: "s-h-cargo-deck", name: "Deck", icon: "/d.png", kind: "trampler-part", techNodeStats: null } },
        ],
      },
    ];
    const tree = toTechTree(rows);
    expect(tree.nodes[0].unlocks).toEqual([
      { name: "Rifle", slug: "rifle-musket", icon: "/r.png", href: "/items/rifle-musket" },
      { name: "Deck", slug: "s-h-cargo-deck", icon: "/d.png", href: "/tramplers/s-h-cargo-deck" },
    ]);
  });

  it("exposes the faction → starting-part slug map", () => {
    expect(FACTION_ROOT_PART).toEqual({
      godlewski: "s-h-atm-fs-77b-l-small-chassis",
      kaiser: "s-h-cargo-deck",
      landwehr: "s-h-fortified-entrance-area",
    });
  });

  it("attaches a faction rootPart when rootParts are provided", () => {
    const rows: RawTechRow[] = [
      { slug: "tech-kaiser-t1a-x", name: "X", techNodeStats: { faction: "kaiser", tier: 1, sortOrder: null }, outgoingLinks: [] },
    ];
    const tree = toTechTree(rows, {
      "s-h-cargo-deck": { name: "S&H Cargo Deck", icon: "/c.png", kind: "trampler-part" },
    });
    const kaiser = tree.factions.find((f) => f.id === "kaiser")!;
    expect(kaiser.rootPart).toEqual({
      slug: "s-h-cargo-deck", name: "S&H Cargo Deck", icon: "/c.png", href: "/tramplers/s-h-cargo-deck",
    });
  });

  it("leaves rootPart null when the slug is not resolved", () => {
    const rows: RawTechRow[] = [
      { slug: "tech-kaiser-t1a-x", name: "X", techNodeStats: { faction: "kaiser", tier: 1, sortOrder: null }, outgoingLinks: [] },
    ];
    const tree = toTechTree(rows);
    expect(tree.factions.find((f) => f.id === "kaiser")!.rootPart ?? null).toBeNull();
  });
});
