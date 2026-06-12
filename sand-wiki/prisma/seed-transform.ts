/** Pure transforms from the committed JSON snapshot shapes (wiki-enrichment.json,
 *  env-content.json, tramplers.json) to the flat relational shapes seeded into
 *  Postgres. No Prisma imports — unit-testable without a DB. */

export interface RawStats {
  type?: string; value?: number; damage?: number; pDamage?: number; tDamage?: number;
  sDamage?: number; magazine?: number; ammoSlug?: string; ammoName?: string;
}

export interface FlatStats {
  statType: string | null; statValue: number | null; damage: number | null;
  playerDamage: number | null; tramplerDamage: number | null; splashDamage: number | null;
  magazine: number | null; ammoName: string | null;
}

export function flattenStats(stats: RawStats | null | undefined): FlatStats {
  return {
    statType: stats?.type ?? null,
    statValue: stats?.value ?? null,
    damage: stats?.damage ?? null,
    playerDamage: stats?.pDamage ?? null,
    tramplerDamage: stats?.tDamage ?? null,
    splashDamage: stats?.sDamage ?? null,
    magazine: stats?.magazine ?? null,
    ammoName: stats?.ammoName ?? null,
  };
}

export interface RawLootEntry { slug?: string; name: string; values: string[] }
export interface RawLootTier { tier: string; columns: string[]; entries: RawLootEntry[] }

export interface RawLoot {
  tiers?: RawLootTier[];
}

export interface FlatLootEntry {
  itemSlug: string | null; name: string;
  value1: string | null; value2: string | null; value3: string | null; sortOrder: number;
}

export interface FlatLootTier {
  tier: string; col1Label: string; col2Label: string | null; col3Label: string | null;
  sortOrder: number; entries: FlatLootEntry[];
}

export function lootToTiers(loot: RawLoot | null | undefined): FlatLootTier[] {
  return (loot?.tiers ?? []).map((t, ti) => {
    if (t.columns.length < 1 || t.columns.length > 3)
      throw new Error(`Loot tier "${t.tier}" has ${t.columns.length} columns — expected 1-3`);
    return {
      tier: t.tier,
      col1Label: t.columns[0],
      col2Label: t.columns[1] ?? null,
      col3Label: t.columns[2] ?? null,
      sortOrder: ti,
      entries: t.entries.map((e, ei) => ({
        itemSlug: e.slug ?? null,
        name: e.name,
        value1: e.values[0] ?? null,
        value2: e.values[1] ?? null,
        value3: e.values[2] ?? null,
        sortOrder: ei,
      })),
    };
  });
}

export interface RawCostLine { slug?: string; name: string; amount: number }
export interface FlatCostRow { itemSlug: string | null; name: string; amount: number; sortOrder: number }

export function costToRows(cost: RawCostLine[] | null | undefined): FlatCostRow[] {
  return (cost ?? []).map((c, i) => ({
    itemSlug: c.slug ?? null, name: c.name, amount: c.amount, sortOrder: i,
  }));
}

/** Merge wiki-authored gear items after the scraped items. Throws if a gear slug duplicates a scraped slug or another gear slug, so a duplicate can't silently shadow another item. */
export function mergeItems<T extends { slug: string }>(scraped: T[], gear: T[]): T[] {
  const seen = new Set(scraped.map((i) => i.slug));
  for (const g of gear) {
    if (seen.has(g.slug)) throw new Error(`Gear item slug "${g.slug}" collides with an existing item`);
    seen.add(g.slug);
  }
  return [...scraped, ...gear];
}
