import { describe, it, expect } from "vitest";
import { buildLockMap, omitLocked, lockedHits } from "./seed-curation";

describe("buildLockMap", () => {
  it("folds applied-edit proposal change-keys into a slug -> field-set map", () => {
    const m = buildLockMap([
      { targetSlug: "rocket-ammo", changes: { rarity: { old: "Rare", new: "Noteworthy" } } },
      { targetSlug: "rocket-ammo", changes: { description: { old: "a", new: "b" } } },
      { targetSlug: "health-emitter", changes: { rarity: { old: "Common", new: "Experimental" } } },
    ]);
    expect(m.get("rocket-ammo")).toEqual(new Set(["rarity", "description"]));
    expect(m.get("health-emitter")).toEqual(new Set(["rarity"]));
  });

  it("ignores rows with no slug, no changes, or empty changes", () => {
    const m = buildLockMap([
      { targetSlug: null, changes: { rarity: { old: 1, new: 2 } } },
      { targetSlug: "x", changes: null },
      { targetSlug: "y", changes: {} },
    ]);
    expect(m.size).toBe(0);
  });
});

describe("omitLocked", () => {
  it("drops locked keys and keeps the rest (returns a copy)", () => {
    const payload = { name: "N", rarity: "Common", category: "ammo" };
    const out = omitLocked(payload, new Set(["rarity"]));
    expect(out).toEqual({ name: "N", category: "ammo" });
    expect(out).not.toBe(payload);
  });

  it("is a no-op copy when locked is undefined or empty", () => {
    const payload = { rarity: "Common" };
    expect(omitLocked(payload, undefined)).toEqual({ rarity: "Common" });
    expect(omitLocked(payload, new Set())).toEqual({ rarity: "Common" });
  });
});

describe("lockedHits", () => {
  it("counts defined payload keys that are locked", () => {
    expect(lockedHits({ rarity: "Common", magazine: 5, damage: undefined }, new Set(["rarity", "damage"]))).toBe(1);
  });
  it("returns 0 when nothing is locked", () => {
    expect(lockedHits({ rarity: "Common" }, undefined)).toBe(0);
    expect(lockedHits({ rarity: "Common" }, new Set())).toBe(0);
  });
});
