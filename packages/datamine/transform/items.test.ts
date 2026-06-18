import { describe, it, expect } from "vitest";
import { sekItemPatch, newItemEntity, applyIconOverrides, applyEntityOverrides } from "./items";
import type { SekItem } from "./sek";
import type { Entity } from "@sandlabs/data";

const sek = (o: Partial<SekItem>): SekItem => ({
  id: "x", name: "X", icon: null, rarity: null, type: null, pawnValue: null, short: null, desc: null, ...o,
});

describe("items transform", () => {
  it("sekItemPatch produces only datamine-owned fields", () => {
    const p = sekItemPatch(sek({ rarity: "NOTEWORTHY", icon: "/icons/x.png", desc: "Hi." }));
    expect(p).toEqual({ rarity: "Noteworthy", icon: "/icons/x.png", description: "Hi." });
  });

  it("sekItemPatch omits fields the datamine doesn't provide", () => {
    const p = sekItemPatch(sek({ rarity: null, icon: null, desc: null }));
    expect(p).toEqual({}); // nothing to refresh -> baseline kept
  });

  it("newItemEntity builds a full Entity for an unmatched SEK item", () => {
    const e = newItemEntity("80-mm-emp-shell", sek({ id: "item_turretAmmo_EMP", name: "80 mm EMP Shell", icon: "/icons/emp.png", rarity: "COMMON", desc: "Boom." }));
    expect(e.slug).toBe("80-mm-emp-shell");
    expect(e.kind).toBe("item");
    expect(e.name).toBe("80 mm EMP Shell");
    expect(e.rarity).toBe("Common");
    expect(e.icon).toBe("/icons/emp.png");
    expect(e.description).toBe("Boom.");
    expect(e.disabled).toBe(false);
    expect(e.category).toBe("misc"); // type null -> misc default
  });

  it("newItemEntity derives category from the SEK type", () => {
    expect(newItemEntity("x", sek({ type: "WEAPON" })).category).toBe("weapons");
    expect(newItemEntity("x", sek({ type: "AMMO" })).category).toBe("ammo");
    expect(newItemEntity("x", sek({ type: "TURRET_AMMO" })).category).toBe("ammo");
    expect(newItemEntity("x", sek({ type: "RESOURCE_T2" })).category).toBe("resources");
    expect(newItemEntity("x", sek({ type: "FOOD" })).category).toBe("medical");
    expect(newItemEntity("x", sek({ type: "MONEY" })).category).toBe("misc");
    expect(newItemEntity("x", sek({ type: null })).category).toBe("misc");
  });

  it("maps the full SEK rarity enum, keeps null otherwise", () => {
    expect(sekItemPatch(sek({ rarity: "UNCOMMON" })).rarity).toBe("Uncommon");
    expect(sekItemPatch(sek({ rarity: "REMARKABLE" })).rarity).toBe("Remarkable");
    expect(sekItemPatch(sek({ rarity: "COMMON" })).rarity).toBe("Common");
  });

  it("applyIconOverrides forces the mapped icon, leaves others untouched", () => {
    const e = (slug: string, icon: string | null): Entity => ({
      id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
      rarity: null, icon, imageAlt: null, derivedName: null, sourceUrl: null,
      disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
    });
    const out = applyIconOverrides(
      [e("coin-crown", "/icons/wrong.png"), e("other", "/icons/keep.png")],
      { "coin-crown": "/icons/icon_item_coinCrown.png" },
    );
    expect(out.find((x) => x.slug === "coin-crown")?.icon).toBe("/icons/icon_item_coinCrown.png");
    expect(out.find((x) => x.slug === "other")?.icon).toBe("/icons/keep.png");
  });

  it("applyEntityOverrides forces name/disabled by slug, leaves others and unset fields untouched", () => {
    const e = (slug: string, name: string): Entity => ({
      id: slug, slug, kind: "item", name, description: null, category: "misc",
      rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null,
      disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
    });
    const out = applyEntityOverrides(
      [e("dupe", "Dupe"), e("box-black", "Box with Radio Beacon"), e("other", "Other")],
      { "dupe": { disabled: true }, "box-black": { name: "Box with Radio Beacon (Black)" } },
    );
    const dupe = out.find((x) => x.slug === "dupe")!;
    expect(dupe.disabled).toBe(true);
    expect(dupe.name).toBe("Dupe"); // name not in override -> untouched
    expect(out.find((x) => x.slug === "box-black")!.name).toBe("Box with Radio Beacon (Black)");
    expect(out.find((x) => x.slug === "box-black")!.disabled).toBe(false); // disabled untouched
    expect(out.find((x) => x.slug === "other")!.name).toBe("Other"); // unmapped -> untouched
  });
});
