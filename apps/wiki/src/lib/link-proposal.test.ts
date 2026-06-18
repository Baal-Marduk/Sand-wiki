import { describe, it, expect } from "vitest";
import {
  linksToSnapshot,
  parseLinkRows,
  snapshotsEqual,
  diffLinkRows,
  incomingLootToDrafts,
  diffLootSources,
  CUSTOM_TARGET,
  type LinkSnapshot,
  type ExistingLootLink,
} from "./link-proposal";

const names = new Map([["iron", "Iron"], ["bolt", "Bolt"]]);

describe("linksToSnapshot", () => {
  it("maps loaded rows (target→slug) into a sorted snapshot", () => {
    const snap = linksToSnapshot("cost", [
      { target: { slug: "bolt" }, name: "Bolt", amount: 3, tier: null, value1: null, sortOrder: 1 },
      { target: { slug: "iron" }, name: "Iron", amount: 2, tier: null, value1: null, sortOrder: 0 },
    ]);
    expect(snap).toEqual({
      role: "cost",
      rows: [
        { targetSlug: "iron", name: "Iron", amount: 2, tier: null, value1: null },
        { targetSlug: "bolt", name: "Bolt", amount: 3, tier: null, value1: null },
      ],
    });
  });

  it("keeps unlinked rows (null target) with their name fallback", () => {
    const snap = linksToSnapshot("loot", [
      { target: null, name: "Mystery", amount: null, tier: "Rare", value1: "1-2", sortOrder: 0 },
    ]);
    expect(snap.rows[0]).toEqual({ targetSlug: null, name: "Mystery", amount: null, tier: "Rare", value1: "1-2" });
  });
});

describe("parseLinkRows (cost)", () => {
  it("pairs slug/amount, drops blank rows, resolves names", () => {
    const r = parseLinkRows("cost",
      { slugs: ["iron", "", "bolt"], customNames: ["", "", ""], amounts: ["2", "9", "3"], tiers: [], value1s: [] },
      names);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([
      { targetSlug: "iron", name: "Iron", amount: 2, tier: null, value1: null },
      { targetSlug: "bolt", name: "Bolt", amount: 3, tier: null, value1: null },
    ]);
  });

  it("rejects a non-positive / non-integer amount", () => {
    const bad = parseLinkRows("cost", { slugs: ["iron"], customNames: [""], amounts: ["0"], tiers: [], value1s: [] }, names);
    expect(bad.error).toMatch(/positive whole number/i);
  });

  it("rejects an unknown slug", () => {
    const r = parseLinkRows("cost", { slugs: ["ghost"], customNames: [""], amounts: ["1"], tiers: [], value1s: [] }, names);
    expect(r.error).toMatch(/unknown item/i);
  });

  it("rejects a kept cost row with a blank amount", () => {
    const r = parseLinkRows("cost", { slugs: ["iron"], customNames: [""], amounts: [""], tiers: [], value1s: [] }, names);
    expect(r.rows).toEqual([]);
    expect(r.error).toMatch(/positive whole number/i);
  });
});

describe("parseLinkRows (loot)", () => {
  it("captures tier + value1 and ignores amount for loot", () => {
    const r = parseLinkRows("loot",
      { slugs: ["iron"], customNames: [""], amounts: ["7"], tiers: ["Rare"], value1s: ["1-2"] },
      names);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ targetSlug: "iron", name: "Iron", amount: null, tier: "Rare", value1: "1-2" }]);
  });

  it("accepts a custom (unlinked) row by name", () => {
    const r = parseLinkRows("loot",
      { slugs: [CUSTOM_TARGET], customNames: ["Homemade"], amounts: [""], tiers: ["Normal"], value1s: [""] },
      names);
    expect(r.rows[0]).toEqual({ targetSlug: null, name: "Homemade", amount: null, tier: "Normal", value1: null });
  });

  it("rejects a custom row with no name", () => {
    const r = parseLinkRows("loot",
      { slugs: [CUSTOM_TARGET], customNames: ["  "], amounts: [""], tiers: ["Normal"], value1s: [""] },
      names);
    expect(r.error).toMatch(/name/i);
  });
});

describe("snapshotsEqual", () => {
  const base: LinkSnapshot = { role: "loot", rows: [{ targetSlug: "iron", name: "Iron", amount: null, tier: "Rare", value1: "1-2" }] };
  it("is order-sensitive and field-sensitive", () => {
    expect(snapshotsEqual(base, structuredClone(base))).toBe(true);
    const changed = structuredClone(base); changed.rows[0].tier = "Normal";
    expect(snapshotsEqual(base, changed)).toBe(false);
  });
});

describe("diffLinkRows", () => {
  it("classifies added / removed / changed / same, keyed by target+tier", () => {
    const oldRows = [
      { targetSlug: "iron", name: "Iron", amount: null, tier: "Rare", value1: "1-2" },
      { targetSlug: "bolt", name: "Bolt", amount: null, tier: "Normal", value1: "1" },
    ];
    const newRows = [
      { targetSlug: "iron", name: "Iron", amount: null, tier: "Rare", value1: "3-4" }, // changed
      { targetSlug: "gold", name: "Gold", amount: null, tier: "Rare", value1: "1" },   // added
    ];
    const diff = diffLinkRows(oldRows, newRows);
    const byName = Object.fromEntries(diff.map((d) => [d.name, d.status]));
    expect(byName).toEqual({ Iron: "changed", Bolt: "removed", Gold: "added" });
  });
});

describe("incomingLootToDrafts", () => {
  it("maps source slug→targetSlug and source name→name, sorted by sortOrder", () => {
    const rows = [
      { source: { slug: "ammo-crate", name: "Ammo Crate" }, tier: "Rare", value1: "1-2", sortOrder: 1 },
      { source: { slug: "supply-cache", name: "Supply Cache" }, tier: null, value1: null, sortOrder: 0 },
    ];
    expect(incomingLootToDrafts(rows)).toEqual([
      { targetSlug: "supply-cache", name: "Supply Cache", amount: null, tier: null, value1: null },
      { targetSlug: "ammo-crate", name: "Ammo Crate", amount: null, tier: "Rare", value1: "1-2" },
    ]);
  });
});

describe("diffLootSources", () => {
  const existing: ExistingLootLink[] = [
    { id: "l1", sourceSlug: "ammo-crate", tier: "Rare", value1: "1-2", sortOrder: 0 },
    { id: "l2", sourceSlug: "supply-cache", tier: null, value1: null, sortOrder: 1 },
  ];

  it("creates new (source,tier) pairs, deletes missing ones", () => {
    const newRows = [
      { targetSlug: "ammo-crate", name: "Ammo Crate", amount: null, tier: "Rare", value1: "1-2" },
      { targetSlug: "field-box", name: "Field Box", amount: null, tier: "Normal", value1: "1" },
    ];
    const w = diffLootSources(existing, newRows);
    expect(w.creates).toEqual([
      { targetSlug: "field-box", name: "Field Box", amount: null, tier: "Normal", value1: "1" },
    ]);
    expect(w.updates).toEqual([]);
    expect(w.deletes).toEqual(["l2"]);
  });

  it("treats a value1-only change as an in-place update", () => {
    const newRows = [
      { targetSlug: "ammo-crate", name: "Ammo Crate", amount: null, tier: "Rare", value1: "3-4" },
      { targetSlug: "supply-cache", name: "Supply Cache", amount: null, tier: null, value1: null },
    ];
    const w = diffLootSources(existing, newRows);
    expect(w.creates).toEqual([]);
    expect(w.updates).toEqual([{ id: "l1", value1: "3-4" }]);
    expect(w.deletes).toEqual([]);
  });

  it("treats a tier change as delete-old + create-new (tier is part of the key)", () => {
    const newRows = [
      { targetSlug: "ammo-crate", name: "Ammo Crate", amount: null, tier: "Very Rare", value1: "1-2" },
      { targetSlug: "supply-cache", name: "Supply Cache", amount: null, tier: null, value1: null },
    ];
    const w = diffLootSources(existing, newRows);
    expect(w.creates).toEqual([
      { targetSlug: "ammo-crate", name: "Ammo Crate", amount: null, tier: "Very Rare", value1: "1-2" },
    ]);
    expect(w.deletes).toEqual(["l1"]);
  });
});
