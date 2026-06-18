import { isItemCategory } from "../src/lib/taxonomy";
import { KNOWN_RARITY_NAMES, DEFAULT_RARITY } from "../src/lib/rarity";

/** A hand-added item that has NO entry in the scraped catalog (data.json / icons.json) —
 *  e.g. an ammo whose icon ships with the game but whose item never made it into the
 *  catalog dump. Distinct from `new-ammo` (which bridges catalog ammo missing from the
 *  wiki and asserts a caliber + fresh-seed parity). These rows are created `curated` so
 *  the seed never prunes them; by design they are absent from a fresh seed and live only
 *  in the DB, exactly like an admin-added entity. Items only for now. */
export interface CuratedExtraItem {
  /** kebab-case page slug. */
  slug: string;
  /** Entity.name — the title shown on the page. */
  name: string;
  /** must be a valid item category. */
  category: string;
  description?: string;
  /** defaults to DEFAULT_RARITY; validated against the known rarity names. */
  rarity?: string;
  /** optional alternate/internal name → Entity.derivedName. */
  derivedName?: string;
  /** bare PNG filename under public/icons/. */
  iconFile: string;
}

/** Curated Entity identity fields written when creating a hand-added extra item. */
export interface CuratedItemRow {
  kind: "item";
  name: string;
  derivedName: string | null;
  description: string | null;
  category: string;
  rarity: string;
  icon: string;
  curated: true;
  lootCurated: true;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validate + shape a CuratedExtraItem into the Entity identity fields. Throws on a bad
 *  slug, an invalid item category, or an unknown rarity. */
export function curatedExtraRow(e: CuratedExtraItem): CuratedItemRow {
  if (!SLUG_RE.test(e.slug)) {
    throw new Error(`${e.slug}: slug must be lowercase letters, digits, and single hyphens`);
  }
  if (!isItemCategory(e.category)) {
    throw new Error(`${e.slug}: "${e.category}" is not a valid item category`);
  }
  const rarity = e.rarity ?? DEFAULT_RARITY;
  if (!KNOWN_RARITY_NAMES.includes(rarity)) {
    throw new Error(`${e.slug}: unknown rarity "${rarity}"`);
  }
  return {
    kind: "item",
    name: e.name,
    derivedName: e.derivedName ?? null,
    description: e.description ?? null,
    category: e.category,
    rarity,
    icon: `/icons/${e.iconFile}`,
    curated: true,
    lootCurated: true,
  };
}
