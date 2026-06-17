import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LootTable } from "./LootTable";

describe("LootTable", () => {
  it("renders chance and both quantities", () => {
    const html = renderToStaticMarkup(
      <LootTable entries={[{ name: "Med Kit", icon: null, rarity: null, href: "/items/med-kit",
        chance: "50%", voyage: "1-2", storm: "3-4", stormBonus: 2.33, moreInStorm: true }]} />,
    );
    expect(html).toContain("50%");
    expect(html).toContain("1-2");
    expect(html).toContain("3-4");
    // storm bonus shown as a relative percentage (×2.33 -> +133%), not a multiplier
    expect(html).toContain("+133%");
    expect(html).not.toContain("×2.33");
  });

  it("renders legacy rows with no chance/qty without crashing", () => {
    const html = renderToStaticMarkup(
      <LootTable entries={[{ name: "Scrap", icon: null, rarity: null, href: null,
        chance: null, voyage: null, storm: null, stormBonus: null, moreInStorm: false }]} />,
    );
    expect(html).toContain("Scrap");
  });
});
