/** A flattened EntityLink row as the app consumes it (target resolved to slug/kind/icon). */
export interface LinkRow {
  targetSlug: string | null;
  targetKind: string | null;
  name: string;
  icon: string | null;
  rarity: string | null;
  amount: number | null;
  tier: string | null;
  value1: string | null;
  sortOrder: number;
}

/** Fixed catalog of tab roles. Adding a tab TYPE = add an entry here + a renderer in the page. */
export const LINK_ROLES = {
  loot: { label: "Loot" },
  cost: { label: "Build Cost" },
} as const;
export type LinkRole = keyof typeof LINK_ROLES;

const TIER_ORDER = ["Normal", "Rare", "Very Rare"];

export interface LootTierGroup { tier: string; rows: LinkRow[] }

/** Group loot rows by `tier` into canonical tier order; null tier -> "Other" (last). */
export function groupLootByTier(rows: LinkRow[]): LootTierGroup[] {
  const byTier = new Map<string, LinkRow[]>();
  for (const r of rows) {
    const tier = r.tier ?? "Other";
    (byTier.get(tier) ?? byTier.set(tier, []).get(tier)!).push(r);
  }
  const rank = (t: string) => {
    const i = TIER_ORDER.indexOf(t);
    return i === -1 ? TIER_ORDER.length + (t === "Other" ? 1 : 0) : i;
  };
  return [...byTier.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([tier, rs]) => ({ tier, rows: rs.sort((a, b) => a.sortOrder - b.sortOrder) }));
}

/** Map an entity `kind` to its detail-page href prefix.
 *  NOTE: distinct from `entityHref` in proposal-schema.ts, which keys on the legacy
 *  proposal *type* names ("item"|"envEntity"|"tramplerPart"). This one keys on
 *  `Entity.kind` ("item"|"environment"|"trampler-part") and returns null for unknown
 *  kinds. Do not merge them without reconciling the two input vocabularies. */
export function entityHref(kind: string | null, slug: string): string | null {
  switch (kind) {
    case "item": return `/items/${slug}`;
    case "environment": return `/environment/${slug}`;
    case "trampler-part": return `/tramplers/${slug}`;
    default: return null;
  }
}
