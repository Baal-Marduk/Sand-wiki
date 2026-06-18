import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile";
import type { Entity } from "@sandlabs/data";

const baseEntity = (slug: string, name: string): Entity => ({
  id: slug, slug, kind: "item", name, description: null, category: "misc",
  rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
});

describe("reconcile", () => {
  const baseline = [baseEntity("anti-reactor-gun", "The Great Silence"), baseEntity("artefact-crystal", "Crystal")];

  it("matches by exact name (case-insensitive) -> baseline slug", () => {
    const r = reconcile(
      [{ id: "ArtefactCrystal", name: "crystal" }],
      baseline, {});
    expect(r.bySekId.get("ArtefactCrystal")).toEqual({ slug: "artefact-crystal", status: "matched" });
  });

  it("uses the override map when name doesn't match", () => {
    const r = reconcile(
      [{ id: "item_oddName", name: "Totally Different" }],
      baseline, { item_oddName: "anti-reactor-gun" });
    expect(r.bySekId.get("item_oddName")).toEqual({ slug: "anti-reactor-gun", status: "override" });
  });

  it("creates a new slug for unmatched ids and dedupes collisions", () => {
    const r = reconcile(
      [{ id: "item_emp", name: "80 mm EMP Shell" }, { id: "item_emp2", name: "80 mm EMP Shell" }],
      baseline, {});
    expect(r.bySekId.get("item_emp")).toEqual({ slug: "80-mm-emp-shell", status: "new" });
    expect(r.bySekId.get("item_emp2")).toEqual({ slug: "80-mm-emp-shell-2", status: "new" });
  });
});
