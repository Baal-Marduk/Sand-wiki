/** Caliber-family helpers. A "caliber" string (e.g. "11x54 mm", "12 GA", "40 mm",
 *  "Rocket") is the family key that makes same-caliber ammo variants interchangeable
 *  across the weapons/turrets that fire them. The family key is stored on
 *  `ItemStats.ammoType` (written by `ammoTypeFor`); matching reads that column. The
 *  `ammoCaliber`/`weaponCaliber` parsers below now feed `ammoTypeFor` only (seed + backfill). */

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

/** The caliber-family value to STORE on an item (the weapon↔ammo match key), or null.
 *  Ammo derives from its own name; weapons/artillery from ammoName or a slug override.
 *  This is the only runtime consumer of ammoCaliber/weaponCaliber — matching itself
 *  reads the stored ItemStats.ammoType column. */
export function ammoTypeFor(
  category: string,
  slug: string,
  name: string,
  ammoName: string | null | undefined,
): string | null {
  if (category === "ammo") return ammoCaliber(name);
  if (category === "weapons" || category === "artillery") return weaponCaliber(slug, ammoName);
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

/** Distinct caliber-class labels present in the given rows, in CLASS_ORDER.
 *  Reads each row's stored ammoType (the match key) rather than re-parsing names. */
export function itemClasses(rows: { ammoType: string | null }[]): string[] {
  const present = new Set<string>();
  for (const r of rows) {
    const c = caliberLabel(r.ammoType);
    if (c) present.add(c);
  }
  return CLASS_ORDER.filter((c) => present.has(c));
}
