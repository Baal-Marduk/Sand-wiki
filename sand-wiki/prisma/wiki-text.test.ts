import { describe, it, expect } from "vitest";
import { stripWikiMarkup, titleToSlug, parseLootTable, parseModule, parseResearch, parseCost } from "./wiki-text.mjs";

const WT = `The Weapon Crate is a [[Loot Containers|Loot Container]] which stores [[:Category:Player Weapons|Player Weapons]] and [[Ammunition]]. '''Bold''' across [[Sophie]]. {{SomeTemplate|x=1}}
===Loot Table===
<tabber>junk {| wikitable |}</tabber>`;

describe("stripWikiMarkup", () => {
  it("returns the lead section as clean text with links/templates/emphasis removed", () => {
    expect(stripWikiMarkup(WT)).toBe(
      "The Weapon Crate is a Loot Container which stores Player Weapons and Ammunition. Bold across Sophie.",
    );
  });

  it("handles empty / heading-only input", () => {
    expect(stripWikiMarkup("==Top==\nx")).toBe("");
    expect(stripWikiMarkup("")).toBe("");
  });

  it("drops bare Category/File tags but keeps inline category links' labels", () => {
    expect(stripWikiMarkup("[[Category:Landmarks]]")).toBe("");
    expect(stripWikiMarkup("[[File:x.png|256px]] Fort text.")).toBe("Fort text.");
    expect(stripWikiMarkup("Stores [[:Category:Player Weapons|Player Weapons]] here.")).toBe(
      "Stores Player Weapons here.",
    );
  });
});

describe("titleToSlug", () => {
  it("kebab-cases titles", () => {
    expect(titleToSlug("Weapon Crate")).toBe("weapon-crate");
    expect(titleToSlug("Suspicious Pile of Sand")).toBe("suspicious-pile-of-sand");
    expect(titleToSlug("Crate of Shells")).toBe("crate-of-shells");
  });
});

const LOOT = `Intro prose.
===Loot Table===
<tabber>Normal Crate of Shells=
{| class="wikitable sortable"
|-
! colspan="2" |Item
! class="unsortable" |Shipwreck Amount
! class="unsortable" |Landmark Amount
|-
| rowspan="3" | One of either:
|{{Icon|40mmShell|3=40mm Shell|4=right}}
|'''10-20'''
|'''10-20'''
|-
|{{Icon|Item 70m shell|3=70mm Shell|4=right}}
|'''10-20'''
|'''10-20'''
|-
| colspan="2" | {{Icon|FabricScraps|3=Fabric Scraps|4=right}}
|'''5'''
|'''5'''
|}
|-|
Rare Crate of Shells=
{| class="wikitable"
|-
! colspan="2" |Item
! |Count
|-
| {{Icon|Crowns|4=right}}
|'''100'''
|}
</tabber>`;

describe("parseLootTable", () => {
  it("parses tabber tiers with dynamic columns and item rows", () => {
    const tiers = parseLootTable(LOOT, "Crate of Shells");
    expect(tiers.map((t) => t.tier)).toEqual(["Normal", "Rare"]);
    expect(tiers[0].columns).toEqual(["Shipwreck Amount", "Landmark Amount"]);
    expect(tiers[0].entries).toEqual([
      { name: "40mm Shell", values: ["10-20", "10-20"] },
      { name: "70mm Shell", values: ["10-20", "10-20"] },
      { name: "Fabric Scraps", values: ["5", "5"] },
    ]);
    expect(tiers[1].columns).toEqual(["Count"]);
    expect(tiers[1].entries).toEqual([{ name: "Crowns", values: ["100"] }]);
  });

  it("returns [] when there is no loot table", () => {
    expect(parseLootTable("Just prose, no table.", "X")).toEqual([]);
  });
});

const MODULE_WT = `{{Module
| name = KF-B "Hole" Middling Chassis
| image = KF-B "Hole" Middling Chassis.png
| dimensions = 4x3
| research = II(b). Middling Chassis {{Tag Tier2}}
| weight_capacity = 25000
| weight = 1200
| energy_consumption = 5
| cost 1 = 75
| cost 2 = 200
| cost 3 = 0
| cost 4 = 0
}}
<blockquote>Flavor text here.</blockquote>
[[Category:Trampler Components]]`;

describe("parseModule", () => {
  it("extracts every | key = value field of the {{Module}} block", () => {
    const m = parseModule(MODULE_WT);
    expect(m.name).toBe(`KF-B "Hole" Middling Chassis`);
    expect(m.image).toBe(`KF-B "Hole" Middling Chassis.png`);
    expect(m.dimensions).toBe("4x3");
    expect(m.research).toBe("II(b). Middling Chassis {{Tag Tier2}}");
    expect(m.weight_capacity).toBe("25000");
    expect(m.weight).toBe("1200");
    expect(m.energy_consumption).toBe("5");
    expect(m["cost 1"]).toBe("75");
    expect(m["cost 4"]).toBe("0");
  });

  it("returns {} when there is no Module block", () => {
    expect(parseModule("Just prose.")).toEqual({});
  });
});

describe("parseResearch", () => {
  it("splits a node-prefixed research label into node / name / tier", () => {
    expect(parseResearch("II(b). Middling Chassis {{Tag Tier2}}")).toEqual({
      node: "II(b)", name: "Middling Chassis", tier: 2,
    });
  });

  it("keeps dotted root names whole when there is no node prefix", () => {
    expect(parseResearch("K.K. Landwehr {{Tag Tier1}}")).toEqual({
      node: null, name: "K.K. Landwehr", tier: 1,
    });
  });

  it("returns nulls for empty input", () => {
    expect(parseResearch("")).toEqual({ node: null, name: null, tier: null });
  });

  it("parses a node prefix with no tier tag", () => {
    expect(parseResearch("II. Some Node")).toEqual({ node: "II", name: "Some Node", tier: null });
  });
});

describe("parseCost", () => {
  it("maps cost 1..4 to resolved item slugs, dropping zeros", () => {
    const fields = { "cost 1": "75", "cost 2": "200", "cost 3": "0", "cost 4": "0" };
    const resolve = (name: string): string | undefined =>
      name === "Mechanical Parts" ? "resource-metal-t1" : undefined;
    expect(parseCost(fields, resolve)).toEqual([
      { name: "Crowns", amount: 75 },
      { slug: "resource-metal-t1", name: "Mechanical Parts", amount: 200 },
    ]);
  });

  it("keeps a non-Crowns cost slug-less when resolve returns undefined", () => {
    expect(parseCost({ "cost 2": "50" }, () => undefined)).toEqual([
      { name: "Mechanical Parts", amount: 50 },
    ]);
  });
});
