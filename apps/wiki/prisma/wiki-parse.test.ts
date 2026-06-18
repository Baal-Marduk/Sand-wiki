import { describe, it, expect } from "vitest";
import { parseWeaponInfoboxes, parseInfoboxes, extractAmmoName } from "./wiki-parse.mjs";

const TABBER = `Intro text [[9x42mm Ammo]].
<tabber>
A=
{{Weapons
 |Name = '''M1866/9 "Einzel" Breechloader'''
 |Rarity = Common
 |Type = Single-Shot Rifle
 |Mag = 1
 |Damage = 50
 |Ammo = {{Icon|9x42mm|3=9x42mm Ammo|4=right}}
 |Value = 25
}}
|-|
B=
{{Weapons
 |Name = '''KF866/9R "Mehrzel" Repeater'''
 |Rarity = Noteworthy
 |Mag = 6
 |Damage = 50
 |Ammo = [[9x42mm Ammo]]
}}
</tabber>`;

describe("parseWeaponInfoboxes", () => {
  it("extracts every infobox on a tabber page with correct fields", () => {
    const r = parseWeaponInfoboxes(TABBER);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      name: 'M1866/9 "Einzel" Breechloader',
      rarity: "Common",
      type: "Single-Shot Rifle",
      magazine: 1,
      damage: 50,
      value: 25,
      ammoName: "9x42mm Ammo",
    });
    expect(r[1]).toMatchObject({
      name: 'KF866/9R "Mehrzel" Repeater',
      rarity: "Noteworthy",
      magazine: 6,
      ammoName: "9x42mm Ammo",
    });
    expect(r[1].value).toBeNull();
    expect(r[1].type).toBeNull();
  });
});

const AMMO = `<tabber>
A=
{{Ammo
 |Name = '''11x54mm Ammo'''
 |Rarity = Rare
 |Type = Ammunition
 |Value = 3
 |PDamage = 12
 |TDamage = 0
 |SDamage = 0
}}
</tabber>`;

const ITEM = `{{Items
 |name = '''Fabric'''
 |rarity = Common
 |type = Crafting Component
 |value = 5
}}`;

describe("parseInfoboxes", () => {
  it("parses an {{Ammo}} infobox with player/trampler/splash damage (incl. zeros)", () => {
    const r = parseInfoboxes(AMMO);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      template: "ammo",
      name: "11x54mm Ammo",
      rarity: "Rare",
      type: "Ammunition",
      value: 3,
      pDamage: 12,
      tDamage: 0,
      sDamage: 0,
    });
    expect(r[0].magazine).toBeNull();
  });

  it("parses a {{Items}} infobox (lowercase keys) with rarity/type/value", () => {
    const r = parseInfoboxes(ITEM);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      template: "items",
      name: "Fabric",
      rarity: "Common",
      type: "Crafting Component",
      value: 5,
    });
    expect(r[0].damage).toBeNull();
    expect(r[0].pDamage).toBeNull();
  });

  it("finds all three template types in one document", () => {
    const doc = `${ITEM}\n${AMMO}\n{{Weapons|Name='''Gun'''|Damage=9}}`;
    const r = parseInfoboxes(doc);
    expect(r.map((e) => e.template)).toEqual(["items", "ammo", "weapons"]);
  });
});

describe("extractAmmoName", () => {
  it("handles Icon template, plain link, and piped link", () => {
    expect(extractAmmoName("{{Icon|9x42mm|3=9x42mm Ammo|4=right}}")).toBe("9x42mm Ammo");
    expect(extractAmmoName("[[11x54mm Ammo]]")).toBe("11x54mm Ammo");
    expect(extractAmmoName("[[Shell|80mm Shell]]")).toBe("80mm Shell");
    expect(extractAmmoName("")).toBeNull();
  });
});
