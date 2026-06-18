import { describe, it, expect } from "vitest";
import { buildItemI18n } from "./i18n";
import type { Localization } from "./sek";

const loc: Localization = {
  locales: ["en", "fr"],
  items: {
    item_fab: { locales: { en: { name: "Fabric", desc: "Cloth." }, fr: { name: "Tissu", desc: "Toile." } } },
    item_en_only: { locales: { en: { name: "Iron", desc: null } } },
  },
  compartments: {}, factions: [],
};

describe("buildItemI18n", () => {
  // reconcile result: sekId -> slug
  const bySlug = new Map([["item_fab", "fabric"], ["item_en_only", "iron"]]);

  it("maps non-EN locales onto the reconciled slug; omits EN (it's the primary)", () => {
    const m = buildItemI18n(loc, bySlug);
    expect(m.get("fabric")).toEqual({ fr: { name: "Tissu", description: "Toile." } });
  });

  it("omits entries with only EN (no extra locales to carry)", () => {
    const m = buildItemI18n(loc, bySlug);
    expect(m.has("iron")).toBe(false);
  });
});
