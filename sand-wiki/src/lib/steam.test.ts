import { describe, it, expect } from "vitest";
import { steamProfileUrl, editorDisplayName } from "./steam";

describe("steamProfileUrl", () => {
  it("builds the community profiles URL from a steamId", () => {
    expect(steamProfileUrl("76561198000000000")).toBe(
      "https://steamcommunity.com/profiles/76561198000000000",
    );
  });
});

describe("editorDisplayName", () => {
  it("returns the persona name when present", () => {
    expect(editorDisplayName("Neo")).toBe("Neo");
  });

  it("trims surrounding whitespace", () => {
    expect(editorDisplayName("  Neo  ")).toBe("Neo");
  });

  it("falls back when the name is null or blank", () => {
    expect(editorDisplayName(null)).toBe("Anonymous contributor");
    expect(editorDisplayName("   ")).toBe("Anonymous contributor");
  });
});
