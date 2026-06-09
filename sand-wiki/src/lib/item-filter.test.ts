import { describe, it, expect } from "vitest";
import { buildItemQuery } from "./item-filter";

describe("buildItemQuery", () => {
  it("defaults to no filters and name-ascending sort", () => {
    expect(buildItemQuery({})).toEqual({
      where: {},
      orderBy: { name: "asc" },
    });
  });

  it("adds a case-insensitive name contains filter", () => {
    const q = buildItemQuery({ query: "rifle" });
    expect(q.where).toEqual({ name: { contains: "rifle", mode: "insensitive" } });
  });

  it("filters by category and workbench level", () => {
    const q = buildItemQuery({ category: "weapons", workbenchLevel: 2 });
    expect(q.where).toEqual({ category: "weapons", workbenchLevel: 2 });
  });

  it("filters by required resource via the recipe relation", () => {
    const q = buildItemQuery({ requiredResourceId: "iron" });
    expect(q.where).toEqual({ recipe: { some: { ingredientId: "iron" } } });
  });

  it("sorts by workbench level when requested", () => {
    expect(buildItemQuery({ sort: "workbench" }).orderBy).toEqual({ workbenchLevel: "asc" });
  });

  it("combines multiple filters", () => {
    const q = buildItemQuery({ query: "axe", category: "tools" });
    expect(q.where).toEqual({
      name: { contains: "axe", mode: "insensitive" },
      category: "tools",
    });
  });
});
