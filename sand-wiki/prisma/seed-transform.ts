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

// --- Tech tree (prisma/tech-tree.json → tech-node entities + EntityLink rows) ---

export interface RawTechCostItem { slug?: string; name: string; amount: number }

export interface RawTechNode {
  slug: string;
  name: string;
  faction: string; // "godlewski" | "kaiser" | "landwehr"
  tier: number; // 1-4
  category: string;
  researchCost?: number;
  sortOrder?: number;
  unlocks?: string[]; // resolved item/part slugs the node grants
  unlocksRaw?: string[]; // verbatim OCR names — review aid only, never seeded
  prereqs?: string[]; // prerequisite tech-node slugs
  researchCostItems?: RawTechCostItem[];
}

export interface TechLinkRow { targetSlug: string | null; name: string; amount: number | null; sortOrder: number }

/** Deterministic node slug: tech-<faction>-t<tier>-<kebab name>. */
export function techNodeSlug(faction: string, tier: number, name: string): string {
  const kebab = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `tech-${faction}-t${tier}-${kebab}`;
}

/** tech-unlocks rows (node → granted entity), ordered by array position. */
export function unlockRows(node: RawTechNode): TechLinkRow[] {
  return (node.unlocks ?? []).map((slug, i) => ({ targetSlug: slug, name: slug, amount: null, sortOrder: i }));
}

/** tech-prereq rows (node → prerequisite node), ordered by array position. */
export function prereqRows(node: RawTechNode): TechLinkRow[] {
  return (node.prereqs ?? []).map((slug, i) => ({ targetSlug: slug, name: slug, amount: null, sortOrder: i }));
}

/** tech-research-cost rows (node → item required to research), ordered by array position. */
export function researchCostRows(node: RawTechNode): TechLinkRow[] {
  return (node.researchCostItems ?? []).map((c, i) => ({ targetSlug: c.slug ?? null, name: c.name, amount: c.amount, sortOrder: i }));
}

export interface TechTreeIssue { node: string; kind: "error" | "warning"; message: string }

/** Structural validation against the set of known entity slugs (items + trampler-parts).
 *  Errors block ingest; warnings are surfaced for review. */
export function validateTechTree(nodes: RawTechNode[], knownEntitySlugs: Set<string>): TechTreeIssue[] {
  const issues: TechTreeIssue[] = [];
  const nodeSlugs = new Set(nodes.map((n) => n.slug));
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.slug)) issues.push({ node: n.slug, kind: "error", message: "duplicate node slug" });
    seen.add(n.slug);
    if (!["godlewski", "kaiser", "landwehr"].includes(n.faction)) {
      issues.push({ node: n.slug, kind: "error", message: `invalid faction "${n.faction}"` });
    }
    if (!Number.isInteger(n.tier) || n.tier < 1 || n.tier > 4) {
      issues.push({ node: n.slug, kind: "error", message: `tier out of range: ${n.tier}` });
    }
    for (const p of n.prereqs ?? []) {
      if (!nodeSlugs.has(p)) issues.push({ node: n.slug, kind: "error", message: `prereq "${p}" is not a known node` });
    }
    for (const u of n.unlocks ?? []) {
      if (!knownEntitySlugs.has(u)) issues.push({ node: n.slug, kind: "warning", message: `unlock "${u}" has no matching item/part entity` });
    }
    for (const c of n.researchCostItems ?? []) {
      if (c.slug && !knownEntitySlugs.has(c.slug)) issues.push({ node: n.slug, kind: "warning", message: `research-cost item "${c.slug}" has no matching entity` });
    }
  }
  return issues;
}
