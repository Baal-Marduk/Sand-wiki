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
  value2: string | null;
  value3: string | null;
  sortOrder: number;
}

/** Fixed catalog of tab roles. Adding a tab TYPE = add an entry here + a renderer in the page.
 *  `fields` lists the editable columns the contributor row-editor shows for the role. */
export const LINK_ROLES = {
  loot: { label: "Loot", fields: ["tier", "value1"] },
  cost: { label: "Build Cost", fields: ["amount"] },
  // Key-progression roles: a location requires a key to open (`requires-key`) and
  // rewards a key when opened (`rewards-key`). Target is the key item; no extra columns.
  // Deliberately NOT folded into `loot` — fresh roles stay outside the seed's
  // role-scoped delete+recreate (seed.ts only touches loot/cost/tech-*), so a re-seed
  // can never wipe a hand-edited key chain.
  "requires-key": { label: "Requires Key", fields: [] },
  "rewards-key": { label: "Key Reward", fields: [] },
  // Buy options: an item can be purchased in several ways. All rows for one option
  // share a `buyGroup` (see EntityLink.buyGroup). `buy-cost` = one price component,
  // `buy-yield` = a self-row whose amount is how many of the item you receive,
  // `buy-unlock` = an optional tech-node that gates the option. These are NOT edited
  // via the generic LinkEditForm — they use the grouped BuyOptionsEditor. `buy-cost`/
  // `buy-yield` are seed-managed + lock-map protected (like loot/cost); `buy-unlock`
  // is contributor-only and seed-immune (like the key roles).
  "buy-cost": { label: "Buy Cost", fields: ["amount"] },
  "buy-yield": { label: "Buy Yield", fields: ["amount"] },
  "buy-unlock": { label: "Buy Unlock", fields: [] },
} as const;
export type LinkRole = keyof typeof LINK_ROLES;
export type LinkField = "amount" | "tier" | "value1";

/** Editable columns for a role (empty for an unknown role, or one with no extra columns). */
export function linkFields(role: string): readonly LinkField[] {
  return (LINK_ROLES as Record<string, { fields: readonly LinkField[] }>)[role]?.fields ?? [];
}

/** True iff `role` is a registered editable link role. Use this — not
 *  `linkFields(role).length === 0` — to validate a role, since the key-progression
 *  roles legitimately have zero extra columns. */
export function isLinkRole(role: string): role is LinkRole {
  return Object.prototype.hasOwnProperty.call(LINK_ROLES, role);
}

export const TIER_ORDER = ["Normal", "Rare", "Very Rare"];

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
