import { entityHref, type LinkRow } from "./entity-links";

/** Display-ready loot entry: identity + drop chance and voyage/storm quantities. */
export interface LootEntryView {
  name: string;
  icon: string | null;
  rarity: string | null;
  href: string | null;
  chance: string | null;   // e.g. "50%"
  voyage: string | null;   // e.g. "1-2"
  storm: string | null;    // e.g. "3-4"
  stormBonus: number | null; // avg storm / avg voyage
  moreInStorm: boolean;
}

/** Average of a "min-max" or "n" range string; null if unparseable. */
function rangeAvg(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const lo = Number(m[1]); const hi = m[2] ? Number(m[2]) : lo;
  return (lo + hi) / 2;
}

export function lootEntryView(e: LinkRow): LootEntryView {
  const href = e.targetSlug ? entityHref(e.targetKind, e.targetSlug) : null;
  const v = rangeAvg(e.value2); const s = rangeAvg(e.value3);
  const stormBonus = v && s && v > 0 ? Math.round((s / v) * 100) / 100 : null;
  return {
    name: e.name, icon: e.icon, rarity: e.rarity, href,
    chance: e.value1 == null ? null : `${e.value1}%`,
    voyage: e.value2, storm: e.value3,
    stormBonus,
    moreInStorm: v != null && s != null && s > v,
  };
}
