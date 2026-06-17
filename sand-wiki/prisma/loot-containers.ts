export interface LootEntry {
  slug: string | null;
  name: string;
  chance: number | null;
  voyage: string | null;
  storm: string | null;
  stormBonus: number | null;
  moreInStorm: boolean | null;
  resolved: boolean;
}
export interface LootTier { tier: string; rollSets: number | null; loot: LootEntry[] }
export interface Container { name: string; icon?: string | null; category: string; tiers: LootTier[] }
export interface LootContainersFile { meta: { source: string; containers: number }; containers: Record<string, Container> }

export interface LootLinkRow {
  tier: string;
  slug: string | null;
  name: string;
  value1: string | null; // chance (%)
  value2: string | null; // voyage qty
  value3: string | null; // storm qty
  sortOrder: number;
}

/** Flatten a container's tiers into loot link rows. Global sortOrder keeps tiers
 *  grouped and ordered: tierIndex * 1000 + entryIndex (mirrors seed.ts). */
export function lootLinkRows(c: Container): LootLinkRow[] {
  const rows: LootLinkRow[] = [];
  c.tiers.forEach((t, ti) => {
    t.loot.forEach((e, ei) => {
      rows.push({
        tier: t.tier,
        slug: e.slug,
        name: e.name,
        value1: e.chance == null ? null : String(e.chance),
        value2: e.voyage,
        value3: e.storm,
        sortOrder: ti * 1000 + ei,
      });
    });
  });
  return rows;
}
