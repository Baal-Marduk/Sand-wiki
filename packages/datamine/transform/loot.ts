import type { Entity, EntityLink } from "@sandlabs/data";
import type { ContainerLoot } from "./sek";

export interface LootOverrides {
  containerSlugMap: Record<string, string>;
  excludeContainers: string[];
}

export interface LootResult { covered: Set<string>; links: EntityLink[] }

/** Roles this module owns end-to-end; both are fully overwritten for covered containers. */
export const LOOT_ROLES = ["loot", "loot-set"] as const;

const CONTAINER_DESCRIPTION =
  "A loot container found out in the world. Opening it grants every item from exactly one " +
  "of its possible sets, chosen at random by weight.";

/** Upsert environment entities for datamined containers that have loot but no wiki page yet,
 *  so their links are never dangling. Mirrors mergeLockboxEntities; existing entities keep
 *  their curated name/description/icon and only gain the category if it was missing. */
export function mergeContainerEntities(
  entities: Entity[], cl: ContainerLoot, ov: LootOverrides,
): Entity[] {
  const exclude = new Set(ov.excludeContainers ?? []);
  const map = ov.containerSlugMap ?? {};
  const existing = new Set(entities.map((e) => e.slug));
  const added: Entity[] = [];
  for (const [sekSlug, c] of Object.entries(cl)) {
    if (exclude.has(sekSlug)) continue;
    const slug = map[sekSlug] ?? sekSlug;
    if (existing.has(slug)) continue;
    existing.add(slug);
    added.push({
      id: slug, slug, kind: "environment", name: c.name,
      description: CONTAINER_DESCRIPTION, category: c.category ?? "loot-containers",
      rarity: null, icon: c.icon ?? null, imageAlt: null, derivedName: null,
      sourceUrl: null, disabled: false,
      itemStats: null, tramplerStats: null, techNodeStats: null,
    });
  }
  return entities.concat(added);
}

/** Build loot EntityLink rows from SEK container_loot, mapping each SEK container slug to
 *  its wiki env slug (containerSlugMap; identity if unmapped) and skipping excludeContainers.
 *
 *  Two roles, because a container grants ONE whole set rather than a sample of its union:
 *   - role "loot"     — the per-item rollup: "chance any single open yields this item".
 *                       chance -> value1, voyage -> value2, storm -> value3, tier label -> tier.
 *                       value1 gains a trailing "~" when the quantity span is stitched from
 *                       sets with different amounts (no open can produce the whole range).
 *   - role "loot-set" — one row per (set, item). The set is the real unit of contents.
 *                       set label -> tier, set chance -> value1, quantities -> value2/value3.
 *                       sortOrder groups a set's items together: setIndex*1000 + itemIndex. */
export function buildLootLinks(cl: ContainerLoot, ov: LootOverrides): LootResult {
  const exclude = new Set(ov.excludeContainers ?? []);
  const map = ov.containerSlugMap ?? {};
  const covered = new Set<string>();
  const links: EntityLink[] = [];
  for (const [sekSlug, c] of Object.entries(cl)) {
    if (exclude.has(sekSlug)) continue;
    const envSlug = map[sekSlug] ?? sekSlug;
    covered.add(envSlug);
    let sort = 0;
    let setIndex = 0;
    for (const t of c.tiers) {
      for (const e of t.loot) {
        links.push({
          sourceSlug: envSlug, targetSlug: e.slug, role: "loot", name: e.name,
          amount: null, tier: t.tier, value1: String(e.chance),
          value2: e.mergedRange && e.voyage ? `${e.voyage}~` : e.voyage ?? null,
          value3: e.mergedRange && e.storm ? `${e.storm}~` : e.storm ?? null,
          sortOrder: sort++, buyGroup: null,
        });
      }
      for (const s of t.sets ?? []) {
        const base = setIndex++ * 1000;
        s.items.forEach((it, i) => {
          links.push({
            sourceSlug: envSlug, targetSlug: it.slug, role: "loot-set", name: it.name,
            // amount carries the set's item count so the UI can say "one open = N items"
            // without re-deriving it from the row group.
            amount: s.items.length,
            // "<group> - <label>", always. The group prefix is what lets a consumer pick
            // exactly one roll pool's sets (the 3D map does this from a blueprint id);
            // display strips it back off.
            tier: `${s.group} - ${s.label}`,
            value1: String(s.chance), value2: it.voyage ?? null, value3: it.storm ?? null,
            sortOrder: base + i, buyGroup: null,
          });
        });
      }
    }
  }
  return { covered, links };
}

/** Full-overwrite loot links for covered containers; keep every other link unchanged. */
export function applyLoot(baseLinks: EntityLink[], result: LootResult): EntityLink[] {
  const owned = new Set<string>(LOOT_ROLES);
  const kept = baseLinks.filter((l) => !(owned.has(l.role) && result.covered.has(l.sourceSlug)));
  return kept.concat(result.links);
}
