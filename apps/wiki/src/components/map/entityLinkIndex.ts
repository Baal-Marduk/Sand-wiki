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

export interface EntityLink {
  href: string;
}

let INDEX: Map<string, EntityLink> | null = null;

/** Build once: normalized-name -> {href}. Higher-priority kinds are inserted
 *  first; lower-priority kinds must not overwrite an existing key. */
function getIndex(): Map<string, EntityLink> {
  if (INDEX) return INDEX;
  const m = new Map<string, EntityLink>();
  for (const { kind, base } of KIND_ROUTE) {
    for (const e of listByKind(kind)) {
      const key = __normalize(e.name);
      if (!m.has(key)) m.set(key, { href: `${base}/${e.slug}` });
    }
  }
  INDEX = m;
  return m;
}

/** Route for a loot/container display name, or null if no enabled entity matches. */
export function slugForName(name: string): EntityLink | null {
  if (!name) return null;
  return getIndex().get(__normalize(name)) ?? null;
}
