import { describe, it, expect } from "vitest";
import { sekItemPatch, newItemEntity } from "./items";
import type { SekItem } from "./sek";

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
    expect(e.category).toBe("misc"); // default; refined by overrides/later mapping
  });
});
