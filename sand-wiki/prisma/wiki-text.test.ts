import { describe, it, expect } from "vitest";
import { stripWikiMarkup, titleToSlug, parseLootTable } from "./wiki-text.mjs";

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
