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

// --- Tech tree v2 (prisma/tech-tree-extracted.json → tech-node entities + EntityLink rows) ---

export interface RawTechCost { name: string; amount: number }

export interface RawTechNode {
  faction: string; tier: number; letter: string; name: string; variant?: string;
  kind: "part" | "item" | "gate";
  unlocks: string[]; unlockCost: RawTechCost[]; prereqs: string[]; note?: string;
}

/** Deterministic slug. Includes variant.
 *  Format: tech-<faction>-t<tier>-<kebab(name[+ " " + variant])> */
export function techNodeSlug(n: { faction: string; tier: number; name: string; variant?: string }): string {
  const base = n.variant ? n.name + " " + n.variant : n.name;
  const kebab = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `tech-${n.faction}-t${n.tier}-${kebab}`;
}

/** Roman numeral to integer. Only handles I-IV (the only tiers in the tech tree). */
function romanToInt(r: string): number | null {
  const map: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };
  return map[r] ?? null;
}

/** Parse a prereq label like "III(b) Great Chassis" → { tier: 3, letter: "b", name: "Great Chassis" }.
 *  Returns null if the label does not match the expected pattern. */
export function parsePrereqLabel(label: string): { tier: number; letter: string; name: string } | null {
  const m = label.match(/^([IVX]+)\(([a-z])\)\s+(.*)$/);
  if (!m) return null;
  const tier = romanToInt(m[1]);
  if (tier === null) return null;
  return { tier, letter: m[2], name: m[3] };
}

export interface TechTreeIssue { node: string; kind: "error" | "warning"; message: string }

/** Structural validation. Checks faction, tier range, duplicate slugs, and parseable prereq labels.
 *  Resolution of prereq→actual node and name→slug happens in the seed, not here. */
export function validateTechTreeV2(
  nodes: RawTechNode[],
  opts: { factionOk: (f: string) => boolean },
): TechTreeIssue[] {
  const issues: TechTreeIssue[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    const slug = techNodeSlug(n);
    if (seen.has(slug)) {
      issues.push({ node: slug, kind: "error", message: `duplicate slug "${slug}"` });
    }
    seen.add(slug);
    if (!opts.factionOk(n.faction)) {
      issues.push({ node: slug, kind: "error", message: `invalid faction "${n.faction}"` });
    }
    if (!Number.isInteger(n.tier) || n.tier < 1 || n.tier > 4) {
      issues.push({ node: slug, kind: "error", message: `tier out of range: ${n.tier}` });
    }
    for (const label of n.prereqs) {
      if (parsePrereqLabel(label) === null) {
        issues.push({ node: slug, kind: "error", message: `unparseable prereq label "${label}"` });
      }
    }
  }
  return issues;
}
