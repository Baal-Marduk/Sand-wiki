import { describe, it, expect } from "vitest";
import { enumerateItems } from "./enumerate";
import type { SekItem, Localization } from "./sek";

const sek = (o: Partial<SekItem>): SekItem => ({
  id: "x", name: "X", icon: null, rarity: null, type: null,
  pawnValue: null, short: null, desc: null, ...o,
});

const loc = (items: Record<string, { name: string; short?: string | null; desc?: string | null }>): Localization => ({
  locales: ["en"],
  items: Object.fromEntries(
    Object.entries(items).map(([id, en]) => [id, { locales: { en: { name: en.name, short: en.short ?? null, desc: en.desc ?? null } } }]),
  ),
  compartments: {},
  factions: [],
});

describe("enumerateItems", () => {
  it("adds localization-only ids as stubs (null icon/rarity, desc from loc)", () => {
    const out = enumerateItems(loc({ game_keyIslandDoorRed: { name: "Red Key", desc: "Opens red doors." } }), []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "game_keyIslandDoorRed", name: "Red Key", icon: null, rarity: null, desc: "Opens red doors." });
  });

  it("real SEK items win over loc stubs of the same canonical id", () => {
    const out = enumerateItems(
      loc({ item_pistolAmmo: { name: "Loc Name", desc: "loc desc" } }),
      [sek({ id: "item_pistolAmmo", name: "Sek Name", icon: "/icons/a.png", rarity: "COMMON" })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "item_pistolAmmo", name: "Sek Name", icon: "/icons/a.png", rarity: "COMMON" });
  });

  it("collapses _Melee/_Ranged loc variants to one canonical id", () => {
    const out = enumerateItems(loc({
      item_smokeGrenade_Melee: { name: "Smoke Grenade" },
      item_smokeGrenade_Ranged: { name: "Smoke Grenade" },
    }), []);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("item_smokeGrenade");
  });

  it("keeps element variants as separate items", () => {
    const out = enumerateItems(loc({
      item_pistolAmmo_Fire: { name: "Incendiary" },
      item_pistolAmmo_Toxic: { name: "Toxic" },
    }), []);
    expect(out.map((i) => i.id).sort()).toEqual(["item_pistolAmmo_Fire", "item_pistolAmmo_Toxic"]);
  });

  it("skips loc entries with no EN name", () => {
    const l = loc({}); l.items["item_blank"] = { locales: {} } as never;
    expect(enumerateItems(l, [])).toHaveLength(0);
  });
});
