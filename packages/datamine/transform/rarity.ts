// SEK rarity enum -> wiki rarity name. Covers every value SEK emits
// (COMMON/UNCOMMON/NOTEWORTHY/REMARKABLE/RARE) plus EXPERIMENTAL for safety.
const RARITY: Record<string, string> = {
  COMMON: "Common",
  UNCOMMON: "Uncommon",
  NOTEWORTHY: "Noteworthy",
  REMARKABLE: "Remarkable",
  RARE: "Rare",
  EXPERIMENTAL: "Experimental",
};

/** SEK rarity enum -> wiki rarity name; null/unknown -> null (merge keeps baseline rarity). */
export function mapRarity(sek: string | null): string | null {
  if (!sek) return null;
  return RARITY[sek.toUpperCase()] ?? null;
}
