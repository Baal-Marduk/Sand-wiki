import { describe, it, expect } from "vitest";
import { categoryNavHref } from "./CategoryQuickNav";

describe("categoryNavHref", () => {
  it("defaults to a bare category link", () => {
    expect(categoryNavHref("/items", "weapons")).toBe("/items?category=weapons");
  });

  it("appends q and sort when provided", () => {
    expect(categoryNavHref("/items", "weapons", { query: "rifle scope", sort: "name" }))
      .toBe("/items?category=weapons&q=rifle+scope&sort=name");
  });

  it("supports an alternate base path", () => {
    expect(categoryNavHref("/tramplers", "chassis")).toBe("/tramplers?category=chassis");
  });
});
