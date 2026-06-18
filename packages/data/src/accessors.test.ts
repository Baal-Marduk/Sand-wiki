import { describe, it, expect } from "vitest";
import { createStore } from "./store";
import { fixture } from "./fixtures";
import * as a from "./accessors";

const s = createStore(fixture);

describe("accessors", () => {
  it("getEntity / listByKind respect existence", () => {
    expect(a.getEntity(s, "rifle")?.name).toBe("Rifle");
    expect(a.getEntity(s, "missing")).toBeNull();
    expect(a.listByKind(s, "item").length).toBe(4);
  });

  it("listByCategory filters by kind+category", () => {
    expect(a.listByCategory(s, "item", "ammo").map((e) => e.slug)).toEqual(["ammo-9x42"]);
  });

  it("categoryCounts excludes disabled rows", () => {
    // 'ghost' is disabled → resources count is 1 (iron only)
    expect(a.categoryCounts(s, "item")["resources"]).toBe(1);
  });

  it("linksForRoles returns sorted matching outgoing links", () => {
    const loot = a.outgoingLinks(s, "crate", ["loot"]);
    expect(loot.map((l) => l.targetSlug)).toEqual(["iron", "ghost"]);
  });

  it("incomingLinks finds links pointing at a slug", () => {
    expect(a.incomingLinks(s, "iron", ["loot"]).map((l) => l.sourceSlug)).toEqual(["crate"]);
  });

  it("recipesProducing / recipesUsing / recipesAtLocation", () => {
    expect(a.recipesProducing(s, "rifle").map((r) => r.slug)).toEqual(["rifle-recipe"]);
    expect(a.recipesUsing(s, "iron").map((r) => r.slug)).toEqual(["rifle-recipe"]);
    expect(a.recipesAtLocation(s, "crate")).toEqual([]);
  });

  it("isEntityEnabled / targetEnabled drive visibility scrubbing", () => {
    expect(a.isEntityEnabled(s, "ghost")).toBe(false);
    expect(a.isEntityEnabled(s, "iron")).toBe(true);
  });

  it("entityPaths excludes tech-nodes and disabled rows", () => {
    const paths = a.entityPaths(s).map((p) => p.slug);
    expect(paths).not.toContain("tech-kaiser-t1a-hull"); // tech-node excluded
    expect(paths).not.toContain("ghost");                // disabled excluded
    expect(paths).toContain("rifle");
  });
});
