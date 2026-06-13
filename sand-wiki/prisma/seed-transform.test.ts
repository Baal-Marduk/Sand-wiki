import { describe, it, expect } from "vitest";
import { flattenStats, lootToTiers, costToRows, mergeItems } from "./seed-transform";

describe("flattenStats", () => {
  it("maps wiki stat keys to flat column names", () => {
    expect(
      flattenStats({
        type: "Revolver", value: 25, damage: 15, pDamage: 1, tDamage: 2,
        sDamage: 3, magazine: 6, ammoSlug: "pistol-ammo", ammoName: "8x21 mm Ammo",
      }),
    ).toEqual({
      statType: "Revolver", statValue: 25, damage: 15, playerDamage: 1, tramplerDamage: 2,
      splashDamage: 3, magazine: 6, ammoName: "8x21 mm Ammo",
    });
  });

  it("returns all-null when there are no stats", () => {
    expect(flattenStats(undefined)).toEqual({
      statType: null, statValue: null, damage: null, playerDamage: null, tramplerDamage: null,
      splashDamage: null, magazine: null, ammoName: null,
    });
  });
});

describe("lootToTiers", () => {
  const loot = {
    tiers: [
      {
        tier: "Normal",
        columns: ["Lesser", "Normal", "Greater"],
        entries: [
          { slug: "canned-food", name: "Canned Food", values: ["4-5", "5-6"] }, // short row (real data)
          { name: "Crowns", values: [] },                                       // synthetic: slug is optional in the type; real loot entries all have slugs
        ],
      },
      { tier: "Rare", columns: ["Count", "Chance"], entries: [] },
    ],
  };

  it("flattens tiers with column labels and array-index sort order", () => {
    const tiers = lootToTiers(loot);
    expect(tiers).toHaveLength(2);
    expect(tiers[0]).toMatchObject({
      tier: "Normal", col1Label: "Lesser", col2Label: "Normal", col3Label: "Greater", sortOrder: 0,
    });
    expect(tiers[1]).toMatchObject({
      tier: "Rare", col1Label: "Count", col2Label: "Chance", col3Label: null, sortOrder: 1,
    });
  });

  it("pads short value rows with null and keeps slug-less entries", () => {
    const [t] = lootToTiers(loot);
    expect(t.entries[0]).toEqual({
      itemSlug: "canned-food", name: "Canned Food", value1: "4-5", value2: "5-6", value3: null, sortOrder: 0,
    });
    expect(t.entries[1]).toEqual({
      itemSlug: null, name: "Crowns", value1: null, value2: null, value3: null, sortOrder: 1,
    });
  });

  it("returns [] when there is no loot", () => {
    expect(lootToTiers(undefined)).toEqual([]);
    expect(lootToTiers({})).toEqual([]);
  });

  it("throws when columns are outside 1-3", () => {
    expect(() =>
      lootToTiers({ tiers: [{ tier: "X", columns: ["a", "b", "c", "d"], entries: [] }] }),
    ).toThrow(/expected 1-3/);
    expect(() =>
      lootToTiers({ tiers: [{ tier: "X", columns: [], entries: [] }] }),
    ).toThrow(/expected 1-3/);
  });
});

describe("costToRows", () => {
  it("maps cost lines, keeping slug-less currency lines", () => {
    expect(
      costToRows([
        { name: "Crowns", amount: 500 },
        { slug: "resource-metal-t1", name: "Mechanical Parts", amount: 20 },
      ]),
    ).toEqual([
      { itemSlug: null, name: "Crowns", amount: 500, sortOrder: 0 },
      { itemSlug: "resource-metal-t1", name: "Mechanical Parts", amount: 20, sortOrder: 1 },
    ]);
  });

  it("returns [] when there is no cost", () => {
    expect(costToRows(undefined)).toEqual([]);
  });
});

describe("mergeItems", () => {
  it("concatenates gear after scraped items", () => {
    const scraped = [{ slug: "a" }, { slug: "b" }];
    const gear = [{ slug: "c" }];
    expect(mergeItems(scraped, gear).map((i) => i.slug)).toEqual(["a", "b", "c"]);
  });

  it("throws when a gear slug collides with a scraped slug", () => {
    expect(() => mergeItems([{ slug: "a" }], [{ slug: "a" }]))
      .toThrow(/collides/);
  });

  it("throws when two gear items share a slug", () => {
    expect(() => mergeItems([], [{ slug: "a" }, { slug: "a" }]))
      .toThrow(/collides/);
  });
});

import {
  techNodeSlug, parsePrereqLabel, validateTechTreeV2,
  type RawTechNode,
} from "./seed-transform";

const makeNode = (over: Partial<RawTechNode> = {}): RawTechNode => ({
  faction: "godlewski", tier: 1, letter: "a", name: "Crew Room",
  kind: "part", unlocks: [], unlockCost: [], prereqs: [], ...over,
});

describe("techNodeSlug", () => {
  it("builds tech-<faction>-t<tier>-<kebab> without variant", () => {
    expect(techNodeSlug({ faction: "godlewski", tier: 1, name: "Energy Rod" }))
      .toBe("tech-godlewski-t1-energy-rod");
  });

  it("appends variant to the kebab when present", () => {
    expect(techNodeSlug({ faction: "godlewski", tier: 3, name: "Great Chassis", variant: "79H-L" }))
      .toBe("tech-godlewski-t3-great-chassis-79h-l");
  });

  it("lowercases and collapses non-alphanumeric runs to single dashes", () => {
    expect(techNodeSlug({ faction: "kaiser", tier: 2, name: "Wooden Decks (multiple)" }))
      .toBe("tech-kaiser-t2-wooden-decks-multiple");
  });
});

describe("parsePrereqLabel", () => {
  it("parses a valid label into tier, letter, name", () => {
    expect(parsePrereqLabel("III(b) Great Chassis"))
      .toEqual({ tier: 3, letter: "b", name: "Great Chassis" });
  });

  it("handles roman numeral I and IV", () => {
    expect(parsePrereqLabel("I(a) Energy Rod")).toEqual({ tier: 1, letter: "a", name: "Energy Rod" });
    expect(parsePrereqLabel("IV(c) Shotgun Cannon")).toEqual({ tier: 4, letter: "c", name: "Shotgun Cannon" });
  });

  it("returns null for an unparseable label", () => {
    expect(parsePrereqLabel("Crew Room")).toBeNull();
    expect(parsePrereqLabel("")).toBeNull();
    expect(parsePrereqLabel("3(b) Name")).toBeNull(); // arabic numeral not allowed
  });
});

describe("validateTechTreeV2", () => {
  const factionOk = (f: string) => ["godlewski", "kaiser", "landwehr"].includes(f);

  it("passes a clean tree", () => {
    expect(validateTechTreeV2([makeNode()], { factionOk })).toEqual([]);
  });

  it("errors on invalid faction", () => {
    const issues = validateTechTreeV2([makeNode({ faction: "bogus" })], { factionOk });
    const errs = issues.filter((i) => i.kind === "error");
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some((e) => e.message.includes("invalid faction"))).toBe(true);
  });

  it("errors on tier out of range", () => {
    const issues = validateTechTreeV2([makeNode({ tier: 9 })], { factionOk });
    const errs = issues.filter((i) => i.kind === "error");
    expect(errs.some((e) => e.message.includes("tier out of range"))).toBe(true);
  });

  it("errors on duplicate slug (two nodes with same slug)", () => {
    const issues = validateTechTreeV2([makeNode(), makeNode()], { factionOk });
    const errs = issues.filter((i) => i.kind === "error");
    expect(errs.some((e) => e.message.includes("duplicate slug"))).toBe(true);
  });

  it("errors on unparseable prereq label", () => {
    const issues = validateTechTreeV2([makeNode({ prereqs: ["Crew Room"] })], { factionOk });
    const errs = issues.filter((i) => i.kind === "error");
    expect(errs.some((e) => e.message.includes("unparseable prereq label"))).toBe(true);
  });

  it("passes when prereq labels are well-formed", () => {
    const issues = validateTechTreeV2([
      makeNode({ letter: "b", prereqs: ["I(a) Crew Room"] }),
    ], { factionOk });
    expect(issues).toEqual([]);
  });
});
