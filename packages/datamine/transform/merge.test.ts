import { describe, it, expect } from "vitest";
import { mergeItems } from "./merge";
import type { Entity, LocalizedText } from "@sandlabs/data";
import type { SekItem } from "./sek";

const baseEntity = (slug: string, name: string, over: Partial<Entity> = {}): Entity => ({
  id: slug, slug, kind: "item", name, description: "base desc", category: "weapons",
  rarity: "Common", icon: "/icons/base.png", imageAlt: null, derivedName: null,
  sourceUrl: null, disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null, ...over,
});
const sek = (o: Partial<SekItem>): SekItem => ({
  id: "x", name: "X", icon: null, rarity: null, type: null, pawnValue: null, short: null, desc: null, ...o,
});

describe("mergeItems", () => {
  const baseline: Entity[] = [baseEntity("rifle", "Rifle"), baseEntity("legacy-item", "Legacy Item")];
  const sekItems: SekItem[] = [
    sek({ id: "item_rifle", name: "Rifle", rarity: "RARE", icon: "/icons/rifle.png" }), // matches baseline
    sek({ id: "item_emp", name: "EMP Shell", rarity: "COMMON", desc: "Boom." }),         // new
  ];
  const bySekId = new Map([
    ["item_rifle", { slug: "rifle", status: "matched" as const }],
    ["item_emp", { slug: "emp-shell", status: "new" as const }],
  ]);
  const i18n = new Map<string, Record<string, LocalizedText>>([["rifle", { fr: { name: "Fusil", description: null } }]]);

  const { entities, missing } = mergeItems(baseline, sekItems, bySekId, i18n);

  it("refreshes matched items with datamine fields, keeps baseline elsewhere", () => {
    const rifle = entities.find((e) => e.slug === "rifle")!;
    expect(rifle.rarity).toBe("Rare");          // datamine refreshed
    expect(rifle.icon).toBe("/icons/rifle.png"); // datamine refreshed
    expect(rifle.description).toBe("base desc"); // datamine had none -> baseline kept
    expect(rifle.category).toBe("weapons");      // not datamine-owned -> baseline kept
    expect(rifle.i18n).toEqual({ fr: { name: "Fusil", description: null } });
  });

  it("adds new SEK items", () => {
    const emp = entities.find((e) => e.slug === "emp-shell")!;
    expect(emp.name).toBe("EMP Shell");
    expect(emp.rarity).toBe("Common");
  });

  it("preserves baseline-only items and reports them as missing-from-datamine", () => {
    expect(entities.find((e) => e.slug === "legacy-item")).toBeTruthy();
    expect(missing).toEqual([{ slug: "legacy-item", name: "Legacy Item", kind: "item" }]);
  });
});
