import { describe, it, expect } from "vitest";
import { buildItemQuery } from "./item-filter";

describe("buildItemQuery", () => {
  it("defaults to no filters and name-ascending", () => {
    expect(buildItemQuery({})).toEqual({ where: {}, orderBy: { name: "asc" } });
  });

  it("filters by name OR derivedName (case-insensitive) and category", () => {
    expect(buildItemQuery({ query: "rifle", category: "guns" }).where).toEqual({
      OR: [
        { name: { contains: "rifle", mode: "insensitive" } },
        { derivedName: { contains: "rifle", mode: "insensitive" } },
      ],
      category: "guns",
    });
  });

  it("filters by workbench tier", () => {
    expect(buildItemQuery({ workbenchTier: 2 }).where).toEqual({ workbenchTier: 2 });
  });

});
