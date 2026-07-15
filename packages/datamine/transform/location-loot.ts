import type { Entity, EntityLink } from "@sandlabs/data";

/** Per-location NOTABLE (location-exclusive) loot from build_location_loot.py. */
export interface LocationLootRow { slug: string; name: string; chance: number | null; tier: string; count: string | null }
export interface LocationLoot {
  slug: string;
  name: string;
  mint: boolean;         // true -> the location entity doesn't exist yet and must be created
  category: string;
  loot: LocationLootRow[];
}
export interface LocationLootData { locations: LocationLoot[] }

/** Tier label used for datamined location-exclusive loot — also the key applyLocationLoot uses to
 *  replace ONLY these links on re-run, leaving any existing (wiki-authored) location loot intact. */
export const NOTABLE_TIER = "Notable loot";

/** Mint location entities flagged mint:true (e.g. Ship Graveyard); existing ones (Dreadnought) are
 *  left untouched — we only add loot links to them. Idempotent. */
export function mergeLocationEntities(entities: Entity[], data: LocationLootData | null): Entity[] {
  if (!data) return entities;
  const existing = new Set(entities.map((e) => e.slug));
  const toMint = data.locations.filter((l) => l.mint && !existing.has(l.slug));
  const rows: Entity[] = toMint.map((l) => ({
    id: l.slug, slug: l.slug, kind: "environment", name: l.name,
    description: null, category: l.category, rarity: null, icon: null,
    imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
    itemStats: null, tramplerStats: null, techNodeStats: null,
  }));
  return entities.concat(rows);
}

export interface LocationLootLinks { covered: Set<string>; links: EntityLink[] }

/** role:"loot" links (tier = NOTABLE_TIER, chance in value1, count in value2) from each location. */
export function buildLocationLootLinks(data: LocationLootData | null): LocationLootLinks {
  const covered = new Set<string>();
  const links: EntityLink[] = [];
  if (!data) return { covered, links };
  for (const l of data.locations) {
    covered.add(l.slug);
    let sort = 0;
    for (const r of l.loot) {
      if (!r.slug) continue;
      links.push({
        sourceSlug: l.slug, targetSlug: r.slug, role: "loot", name: r.name,
        amount: null, tier: r.tier, value1: r.chance == null ? null : String(r.chance),
        value2: r.count ?? null, value3: null, sortOrder: sort++, buyGroup: null,
      });
    }
  }
  return { covered, links };
}

/** Replace ONLY the prior NOTABLE_TIER loot links from covered locations, then add the new ones —
 *  preserves any other (wiki-authored) loot already on those location pages. Idempotent. */
export function applyLocationLoot(baseLinks: EntityLink[], result: LocationLootLinks): EntityLink[] {
  const kept = baseLinks.filter(
    (l) => !(l.role === "loot" && l.tier === NOTABLE_TIER && result.covered.has(l.sourceSlug)),
  );
  return kept.concat(result.links);
}
