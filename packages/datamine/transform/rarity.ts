const RARITY: Record<string, string> = {
  COMMON: "Common",
  NOTEWORTHY: "Noteworthy",
  RARE: "Rare",
  EPIC: "Epic",
  LEGENDARY: "Legendary",
  EXPERIMENTAL: "Experimental",
};

/** SEK rarity enum -> wiki rarity name; null/unknown -> null (merge keeps baseline rarity). */
export function mapRarity(sek: string | null): string | null {
  if (!sek) return null;
  return RARITY[sek.toUpperCase()] ?? null;
}
