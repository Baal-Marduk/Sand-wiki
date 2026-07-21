import { listByKind, getEntity } from "@sandlabs/data";

/** Kinds that have a wiki detail route, in collision-priority order. */
const KIND_ROUTE: { kind: string; base: string }[] = [
  { kind: "item", base: "/items" },
  { kind: "environment", base: "/environment" },
  { kind: "trampler-part", base: "/tramplers" },
];

/** Curated aliases for loot labels whose in-game name diverges from the wiki entity
 *  name, so plain name-matching can't connect them. Keyed by (un-normalized) label →
 *  wiki slug; each is verified against the store when the index is built, so a stale
 *  entry degrades to plain text rather than a dead link. Extend as mismatches surface.
 *
 *  Turrets: the map spawns the "packable" walker part (walker_…Turret…_packable) while
 *  the wiki models the lootable as the packed artillery "Kit" item
 *  (game-packed-…-turret-t{N}-container). Armored / rail-gun / untiered turrets are
 *  intentionally omitted — they have no corresponding wiki kit item. */
const ALIASES: Record<string, string> = {
  "Auto Mounted Turret T1 Packable": "game-packed-auto-turret-t1-container",
  "Auto Mounted Turret T2 Packable": "game-packed-auto-turret-t2-container",
  "Auto Mounted Turret T3 Packable": "game-packed-auto-turret-t3-container",
  "Auto Mounted Turret T4 Accelerating Packable": "game-packed-auto-turret-t4-accelerating-container",
  "Shotgun Mounted Turret T1 Packable": "game-packed-shotgun-turret-t1-container",
  "Shotgun Mounted Turret T2 Packable": "game-packed-shotgun-turret-t2-container",
  "Shotgun Mounted Turret T3 Packable": "game-packed-shotgun-turret-t3-container",
  "Shotgun Mounted Turret T4 Double Barrel Packable": "game-packed-shotgun-turret-t4-double-barrel-container",
  "Mounted Turret T1 Packable": "game-packed-turret-t1-container",
  "Mounted Turret T2 Packable": "game-packed-turret-t2-container",
  "Mounted Turret T3 Packable": "game-packed-turret-t3-container",
};

/** Family fallback: loot-box labels vary by tier/effort (e.g. "Shells Box T1 Mid
 *  Effort") but the wiki models each loot type as ONE untiered container. Match the
 *  family prefix → wiki container slug; verified against the store. Ambiguous families
 *  (Army Box, Container Box, Valuable Piles) are intentionally omitted until confirmed. */
const FAMILIES: { re: RegExp; slug: string }[] = [
  { re: /^shells box\b/i, slug: "crate-of-shells" },
  { re: /^food box\b/i, slug: "food-crate" },
  { re: /^parts box\b/i, slug: "parts-crate" },
  { re: /^army box\b/i, slug: "military-box" },
  { re: /^medical cabinet\b/i, slug: "medical-cabinet" },
  { re: /^locked box military\b/i, slug: "military-box" },
  { re: /^locked box utility\b/i, slug: "utility-box" },
  { re: /^locked box valuables\b/i, slug: "valuables-box" },
  { re: /^safe\b/i, slug: "valuables-safe" },
];

/** Lowercase, trim, collapse internal whitespace. Exported for tests. */
export function __normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface EntityRoute {
  href: string;
  /** Sprite path (e.g. "/icons/…png") when the entity has one, else null. */
  icon: string | null;
}

/** Resolve a wiki slug to its route + icon, or null if the entity is missing/disabled. */
function routeFor(slug: string): EntityRoute | null {
  const e = getEntity(slug);
  if (!e || e.disabled) return null;
  const base = KIND_ROUTE.find((k) => k.kind === e.kind)?.base;
  return base ? { href: `${base}/${slug}`, icon: e.icon ?? null } : null;
}

let INDEX: Map<string, EntityRoute> | null = null;

/** Build once: normalized-name -> {href}. Higher-priority kinds are inserted
 *  first; lower-priority kinds must not overwrite an existing key. Disabled
 *  entities are skipped — the wiki's hard rule is that disabled entities are
 *  scrubbed from all cross-refs (listByKind does not filter these itself). */
function getIndex(): Map<string, EntityRoute> {
  if (INDEX) return INDEX;
  const m = new Map<string, EntityRoute>();
  for (const { kind, base } of KIND_ROUTE) {
    for (const e of listByKind(kind)) {
      if (e.disabled) continue;
      const key = __normalize(e.name);
      if (!m.has(key)) m.set(key, { href: `${base}/${e.slug}`, icon: e.icon ?? null });
    }
  }
  // curated aliases win over name matches (they correct known mismatches); each is
  // verified against the store so a missing/disabled target is skipped, never dead-linked.
  for (const [label, slug] of Object.entries(ALIASES)) {
    const r = routeFor(slug);
    if (r) m.set(__normalize(label), r);
  }
  INDEX = m;
  return m;
}

/** Route for a loot/container display name, or null if nothing matches. Tries the
 *  built index (exact name + curated aliases) first, then the loot-box family rules. */
export function slugForName(name: string): EntityRoute | null {
  if (!name) return null;
  const hit = getIndex().get(__normalize(name));
  if (hit) return hit;
  for (const f of FAMILIES) if (f.re.test(name.trim())) return routeFor(f.slug);
  return null;
}
