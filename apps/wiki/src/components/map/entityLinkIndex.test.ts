import { describe, it, expect } from "vitest";
import { slugForName, __normalize } from "./entityLinkIndex";

describe("__normalize", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(__normalize("  Crate   of  Shells ")).toBe("crate of shells");
  });
});

describe("slugForName", () => {
  it("returns null for an unknown name", () => {
    expect(slugForName("definitely not a real entity xyzzy")).toBeNull();
  });

  it("resolves a known item name to its /items route (case-insensitive)", () => {
    expect(slugForName("Binoculars")).toEqual({ href: "/items/binoculars" });
    expect(slugForName("  BINOCULARS  ")).toEqual({ href: "/items/binoculars" });
  });

  it("resolves another known item name", () => {
    expect(slugForName("Black Box")).toEqual({ href: "/items/black-box" });
  });

  it("resolves a known environment name to its /environment route", () => {
    expect(slugForName("Crate of Shells")).toEqual({ href: "/environment/crate-of-shells" });
  });

  it("returns null for empty input", () => {
    expect(slugForName("")).toBeNull();
  });
});
