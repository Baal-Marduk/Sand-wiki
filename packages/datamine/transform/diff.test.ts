import { describe, it, expect } from "vitest";
import { diffEntities } from "./diff";
import type { Entity } from "@sandlabs/data";

const e = (slug: string): Entity => ({
  id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
  rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
});

describe("diffEntities", () => {
  it("reports added and removed slugs", () => {
    const d = diffEntities([e("a"), e("b")], [e("a"), e("c")]);
    expect(d.added).toEqual(["c"]);
    expect(d.removed).toEqual(["b"]);
  });

  it("removed slugs are the slug-safety violation signal", () => {
    const d = diffEntities([e("a")], [e("a")]);
    expect(d.removed).toEqual([]); // none removed -> safe
  });
});
