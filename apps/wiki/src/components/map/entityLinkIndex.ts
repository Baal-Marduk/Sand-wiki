import { listByKind } from "@sandlabs/data";

/** Kinds that have a wiki detail route, in collision-priority order. */
const KIND_ROUTE: { kind: string; base: string }[] = [
  { kind: "item", base: "/items" },
  { kind: "environment", base: "/environment" },
  { kind: "trampler-part", base: "/tramplers" },
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
  INDEX = m;
  return m;
}

/** Route for a loot/container display name, or null if no enabled entity matches. */
export function slugForName(name: string): EntityRoute | null {
  if (!name) return null;
  return getIndex().get(__normalize(name)) ?? null;
}
