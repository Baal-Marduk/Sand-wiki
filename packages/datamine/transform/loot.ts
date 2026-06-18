import type { EntityLink } from "@sandlabs/data";
import type { ContainerLoot } from "./sek";

export interface LootOverrides {
  containerSlugMap: Record<string, string>;
  excludeContainers: string[];
}

export interface LootResult { covered: Set<string>; links: EntityLink[] }

/** Build loot-role EntityLink rows from SEK container_loot, mapping each SEK container slug to
 *  its wiki env slug (containerSlugMap; identity if unmapped) and skipping excludeContainers.
 *  chance -> value1, voyage range -> value2, storm range -> value3; tier from the tier label. */
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
    for (const t of c.tiers) {
      for (const e of t.loot) {
        links.push({
          sourceSlug: envSlug, targetSlug: e.slug, role: "loot", name: e.name,
          amount: null, tier: t.tier, value1: String(e.chance),
          value2: e.voyage ?? null, value3: e.storm ?? null, sortOrder: sort++, buyGroup: null,
        });
      }
    }
  }
  return { covered, links };
}

/** Full-overwrite loot links for covered containers; keep every other link unchanged. */
export function applyLoot(baseLinks: EntityLink[], result: LootResult): EntityLink[] {
  const kept = baseLinks.filter((l) => !(l.role === "loot" && result.covered.has(l.sourceSlug)));
  return kept.concat(result.links);
}
