import { describe, it, expect } from "vitest";
import { stripWikiMarkup, titleToSlug } from "./wiki-text.mjs";

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
});

describe("titleToSlug", () => {
  it("kebab-cases titles", () => {
    expect(titleToSlug("Weapon Crate")).toBe("weapon-crate");
    expect(titleToSlug("Suspicious Pile of Sand")).toBe("suspicious-pile-of-sand");
    expect(titleToSlug("Crate of Shells")).toBe("crate-of-shells");
  });
});
