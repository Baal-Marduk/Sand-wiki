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

  it("resolves _Melee/_Ranged loc variants via the canonical id (slug map is keyed by canonical id)", () => {
    const locVar: Localization = {
      locales: ["en", "fr"],
      items: {
        item_smokeGrenade_Melee: { locales: { en: { name: "Smoke Grenade", desc: null }, fr: { name: "Grenade fumigène", desc: null } } },
        item_smokeGrenade_Ranged: { locales: { en: { name: "Smoke Grenade", desc: null }, fr: { name: "Grenade fumigène", desc: null } } },
      },
      compartments: {}, factions: [],
    };
    // reconcile keys by canonical id (enumerate.ts), so the slug map has the canonical id only.
    const m = buildItemI18n(locVar, new Map([["item_smokeGrenade", "smoke-grenade"]]));
    expect(m.get("smoke-grenade")).toEqual({ fr: { name: "Grenade fumigène", description: null } });
  });
});
