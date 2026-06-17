import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lootLinkRows, type LootContainersFile } from "./loot-containers";

const load = <T>(f: string): T => JSON.parse(readFileSync(join(__dirname, f), "utf-8")) as T;

describe("loot-containers artifact", () => {
  const file = load<LootContainersFile>("loot-containers.json");
  const data = load<{ items: { slug: string }[] }>("data.json");
  const overrides = load<{ knownLiveSlugs: string[] }>(
    "../datamine/overrides/loot-overrides.json",
  );

  it("every container is a loot-containers env", () => {
    for (const c of Object.values(file.containers)) expect(c.category).toBe("loot-containers");
  });

  it("every non-null loot slug exists in data.json or knownLiveSlugs", () => {
    const known = new Set([...data.items.map((i) => i.slug), ...overrides.knownLiveSlugs]);
    const missing = new Set<string>();
    for (const c of Object.values(file.containers))
      for (const t of c.tiers) for (const e of t.loot)
        if (e.slug && !known.has(e.slug)) missing.add(e.slug);
    expect([...missing].sort()).toEqual([]);
  });

  it("lootLinkRows flattens tiers with grouped sortOrder", () => {
    const c = { name: "X", category: "loot-containers", tiers: [
      { tier: "Tier 1", rollSets: 1, loot: [
        { slug: "a", name: "A", chance: 100, voyage: "1-2", storm: "2-3", stormBonus: 1.5, moreInStorm: true, resolved: true },
      ] },
      { tier: "Tier 2", rollSets: 1, loot: [
        { slug: "b", name: "B", chance: 50, voyage: "1", storm: "1", stormBonus: 1, moreInStorm: false, resolved: true },
      ] },
    ] };
    const rows = lootLinkRows(c);
    expect(rows.map((r) => [r.tier, r.slug, r.value1, r.value2, r.value3, r.sortOrder])).toEqual([
      ["Tier 1", "a", "100", "1-2", "2-3", 0],
      ["Tier 2", "b", "50", "1", "1", 1000],
    ]);
  });
});
