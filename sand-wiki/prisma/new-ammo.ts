import { ammoCaliber } from "../src/lib/ammo";
import { DEFAULT_RARITY } from "../src/lib/rarity";

/** One missing ammo variant, sourced from its icon (no in-game text yet — stub). */
export interface NewAmmo {
  /** kebab-case page slug, derived from the icon suffix. */
  slug: string;
  /** data.json id = icons.json key; never becomes the Entity uuid. */
  id: string;
  /** data.json `name` form → stored as Entity.derivedName. */
  name: string;
  /** display form → stored as Entity.name; MUST contain the caliber token. */
  displayName: string;
  description: string;
  /** bare PNG filename under public/icons/. */
  iconFile: string;
  /** expected caliber family; asserted against displayName. */
  caliber: string;
}

/** Build the curated Entity identity for one ammo entry, asserting the caliber invariant
 *  that the whole family-grouping relies on (ammoCaliber(name) must equal the declared caliber). */
export function ammoRowIdentity(e: NewAmmo) {
  const derived = ammoCaliber(e.displayName);
  if (derived !== e.caliber) {
    throw new Error(
      `${e.slug}: name "${e.displayName}" yields caliber "${derived}", expected "${e.caliber}"`,
    );
  }
  return {
    name: e.displayName,
    derivedName: e.name,
    description: e.description,
    category: "ammo",
    rarity: DEFAULT_RARITY,
    icon: `/icons/${e.iconFile}`,
    curated: true,
    lootCurated: true,
  };
}
