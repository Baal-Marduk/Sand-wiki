import { describe, it, expect } from "vitest";
import {
  SECTIONS, ITEM_CATEGORIES, ITEM_CATEGORY_SLUGS,
  isItemCategory, categoryLabel, getSection,
} from "./taxonomy";

describe("taxonomy", () => {
  it("exposes the five top-level sections in order", () => {
    expect(SECTIONS.map((s) => s.slug)).toEqual([
      "items", "environment", "tramplers", "tech", "tools",
    ]);
  });

  it("has unique section slugs", () => {
    expect(new Set(SECTIONS.map((s) => s.slug)).size).toBe(SECTIONS.length);
  });

  it("has unique category slugs within each section", () => {
    for (const s of SECTIONS) {
      const slugs = s.categories.map((c) => c.slug);
      expect(new Set(slugs).size, `duplicate in ${s.slug}`).toBe(slugs.length);
    }
  });

  it("defines the eight item categories", () => {
    expect(ITEM_CATEGORY_SLUGS).toEqual([
      "weapons", "guns", "resources", "attire", "tools", "medical", "ammo", "misc",
    ]);
    expect(ITEM_CATEGORIES.every((c) => c.label.length > 0)).toBe(true);
  });

  it("validates item categories", () => {
    expect(isItemCategory("weapons")).toBe(true);
    expect(isItemCategory("npcs")).toBe(false);
    expect(isItemCategory("nope")).toBe(false);
  });

  it("maps a category slug to its label, falling back to the slug", () => {
    expect(categoryLabel("weapons")).toBe("Weapons");
    expect(categoryLabel("unknown")).toBe("unknown");
  });

  it("looks up a section by slug", () => {
    expect(getSection("environment")?.label).toBe("Environment");
    expect(getSection("missing")).toBeUndefined();
  });
});
