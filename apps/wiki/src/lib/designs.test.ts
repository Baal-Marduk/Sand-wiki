import { describe, it, expect } from "vitest";
import { slugifyName, makeSlug, validateBuildCode } from "@/lib/designs";

describe("slugifyName", () => {
  it("lowercases, strips punctuation, hyphenates", () => {
    expect(slugifyName('The Rustgut "Reaper"!')).toBe("the-rustgut-reaper");
  });
  it("falls back for empty/garbage names", () => {
    expect(slugifyName("!!!")).toBe("rig");
  });
});

describe("makeSlug", () => {
  it("appends a short random suffix to keep slugs unique", () => {
    const s = makeSlug("Dustline Hauler");
    expect(s).toMatch(/^dustline-hauler-[a-z0-9]{6}$/);
  });
});

describe("validateBuildCode", () => {
  it("rejects codes without the SANDBP2 prefix", () => {
    expect(() => validateBuildCode("nope")).toThrow();
  });
});
