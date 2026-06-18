import { describe, it, expect } from "vitest";
import { buildLootLinks, applyLoot } from "./loot";
import type { ContainerLoot } from "./sek";
import type { EntityLink } from "@sandlabs/data";

const cl: ContainerLoot = {
  "weapons-crate": {
    name: "Weapons Crate", icon: "x.png", category: "loot-containers",
    tiers: [{ tier: "Tier 1", rollSets: 4, loot: [
      { slug: "pistol-ammo", name: "Pistol Ammo", chance: 50, voyage: "25-45", storm: "25-45" },
      { slug: "rifle-musket", name: "Rifle Musket", chance: 25, voyage: "1", storm: "1" },
    ] }],
  },
  "mob-drops": { name: "Mob Drops", icon: "", category: "loot-containers", tiers: [] }, // excluded
};
const ov = { containerSlugMap: { "weapons-crate": "weapon-crate" }, excludeContainers: ["mob-drops"] };

describe("loot transform", () => {
  it("maps container_loot to loot links under the mapped env slug, skipping excluded", () => {
    const { covered, links } = buildLootLinks(cl, ov);
    expect([...covered]).toEqual(["weapon-crate"]);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      sourceSlug: "weapon-crate", targetSlug: "pistol-ammo", role: "loot", name: "Pistol Ammo",
      amount: null, tier: "Tier 1", value1: "50", value2: "25-45", value3: "25-45", sortOrder: 0, buyGroup: null,
    });
    expect(links[1].sortOrder).toBe(1);
  });

  it("full-overwrites loot for covered containers, keeps other links", () => {
    const base: EntityLink[] = [
      { sourceSlug: "weapon-crate", targetSlug: "old-item", role: "loot", name: "Old", amount: null, tier: "Tier 1", value1: "10", value2: null, value3: null, sortOrder: 0, buyGroup: null },
      { sourceSlug: "weapon-crate", targetSlug: "x", role: "cost", name: "X", amount: 1, tier: null, value1: null, value2: null, value3: null, sortOrder: 0, buyGroup: null },
      { sourceSlug: "other-crate", targetSlug: "y", role: "loot", name: "Y", amount: null, tier: "Tier 1", value1: "5", value2: null, value3: null, sortOrder: 0, buyGroup: null },
    ];
    const out = applyLoot(base, buildLootLinks(cl, ov));
    // old weapon-crate loot replaced; weapon-crate cost kept; other-crate loot kept; new weapon-crate loot added
    expect(out.filter((l) => l.role === "loot" && l.sourceSlug === "weapon-crate").map((l) => l.targetSlug)).toEqual(["pistol-ammo", "rifle-musket"]);
    expect(out.find((l) => l.role === "cost" && l.sourceSlug === "weapon-crate")).toBeTruthy();
    expect(out.find((l) => l.sourceSlug === "other-crate")).toBeTruthy();
  });
});
