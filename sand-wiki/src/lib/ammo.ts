/** Caliber-family helpers. A "caliber" string (e.g. "11x54 mm", "12 GA", "40 mm",
 *  "Rocket") is the family key that makes same-caliber ammo variants interchangeable
 *  across the weapons/turrets that fire them. Derived at runtime — there is no stored field. */

/** Extract the caliber family token from an AMMO item name. NxN mm is matched before the
 *  plain "N mm" rule so "11x54 mm" is not truncated to "54 mm". */
export function ammoCaliber(name: string): string | null {
  const cross = name.match(/\b(\d+)x(\d+)\s?mm\b/i);
  if (cross) return `${cross[1]}x${cross[2]} mm`;
  const ga = name.match(/\b(\d+)\s?GA\b/i);
  if (ga) return `${ga[1]} GA`;
  const mm = name.match(/\b(\d+)\s?mm\b/i);
  if (mm) return `${mm[1]} mm`;
  if (/rocket/i.test(name)) return "Rocket";
  return null;
}

/** slug-prefix → caliber, for items that carry no ammoName (turrets, rocket launcher).
 *  Ordered most-specific first. */
export const SLUG_CALIBER_OVERRIDES: { prefix: string; caliber: string }[] = [
  { prefix: "game-packed-auto-turret", caliber: "40 mm" },
  { prefix: "game-packed-shotgun-turret", caliber: "70 mm" },
  { prefix: "game-packed-turret", caliber: "80 mm" },
  { prefix: "rocket-launcher", caliber: "Rocket" },
];

/** Caliber a weapon/artillery item fires: from its ammoName when present, else a slug override. */
export function weaponCaliber(slug: string, ammoName?: string | null): string | null {
  if (ammoName) return ammoCaliber(ammoName);
  for (const o of SLUG_CALIBER_OVERRIDES) if (slug.startsWith(o.prefix)) return o.caliber;
  return null;
}

const LABELS: Record<string, string> = {
  "8x21 mm": "Pistol",
  "9x42 mm": "Rifle",
  "11x54 mm": "Sniper",
  "12 GA": "Shotgun",
  "40 mm": "Autocannon",
  "70 mm": "Shotgun",
  "80 mm": "Naval",
  Rocket: "Rocket",
};

/** Human class label for a caliber family (shown as an ammo item's "type"). */
export function caliberLabel(caliber: string | null): string | null {
  return caliber ? LABELS[caliber] ?? null : null;
}

/** Canonical display order of caliber-class labels (every value caliberLabel can return). */
export const CLASS_ORDER = ["Pistol", "Rifle", "Sniper", "Shotgun", "Autocannon", "Naval", "Rocket"];

/** The caliber-class label for an item. Weapons/turrets derive from ammoName/slug; ammo items
 *  fall back to their own name. Null when no caliber can be derived. Single source used by both
 *  the class filter and the class option list. */
export function itemClass(slug: string, name: string, stats: unknown): string | null {
  const ammoName = (stats as { ammoName?: string } | null)?.ammoName;
  return caliberLabel(weaponCaliber(slug, ammoName) ?? ammoCaliber(name));
}

/** Distinct caliber-class labels present in the given rows, in CLASS_ORDER. */
export function itemClasses(rows: { slug: string; name: string; stats: unknown }[]): string[] {
  const present = new Set<string>();
  for (const r of rows) {
    const c = itemClass(r.slug, r.name, r.stats);
    if (c) present.add(c);
  }
  return CLASS_ORDER.filter((c) => present.has(c));
}
