import { describe, it, expect } from "vitest";
import { createStore } from "./store";
import type { DataSet } from "./types";
import entities from "../generated/entities.json";
import recipes from "../generated/recipes.json";
import links from "../generated/links.json";

const data = { entities, recipes, links } as unknown as DataSet;

describe("generated data round-trip", () => {
  const s = createStore(data);

  it("has entities and a slug index covering all of them", () => {
    expect(s.entities.length).toBeGreaterThan(0);
    expect(s.bySlug.size).toBe(s.entities.length); // slugs are unique
  });

  it("every recipe line references a known entity slug", () => {
    for (const r of s.recipes) {
      for (const line of [...r.inputs, ...r.outputs]) {
        expect(s.bySlug.has(line.itemSlug)).toBe(true);
      }
      if (r.locationSlug) expect(s.bySlug.has(r.locationSlug)).toBe(true);
    }
  });

  it("every link source resolves; targets resolve when present", () => {
    for (const l of s.links) {
      expect(s.bySlug.has(l.sourceSlug)).toBe(true);
      if (l.targetSlug) expect(s.bySlug.has(l.targetSlug)).toBe(true);
    }
  });

  it("i18n is optional on entities", () => {
    for (const e of s.entities) {
      if (e.i18n !== undefined) {
        for (const t of Object.values(e.i18n)) expect(typeof t.name).toBe("string");
      }
    }
  });
});
