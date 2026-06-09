import { describe, it, expect } from "vitest";
import { parseWeaponInfoboxes, extractAmmoName } from "./wiki-parse.mjs";

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

describe("extractAmmoName", () => {
  it("handles Icon template, plain link, and piped link", () => {
    expect(extractAmmoName("{{Icon|9x42mm|3=9x42mm Ammo|4=right}}")).toBe("9x42mm Ammo");
    expect(extractAmmoName("[[11x54mm Ammo]]")).toBe("11x54mm Ammo");
    expect(extractAmmoName("[[Shell|80mm Shell]]")).toBe("80mm Shell");
    expect(extractAmmoName("")).toBeNull();
  });
});
