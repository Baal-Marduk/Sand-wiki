export interface Rarity { name: string; tier: number; color: string }

/** Ordered rarity scale (names from sandgame.wiki) → game-palette colors
 *  (the in-game ItemColorSchemeUIConfig bgDefault per tier). Tier-6 "Exotic" name is
 *  provisional — no tier-6 item observed yet; the color slot is reserved. */
export const RARITIES: Rarity[] = [
  { name: "Common", tier: 1, color: "#ADADAD" },
  { name: "Uncommon", tier: 2, color: "#889F83" },
  { name: "Noteworthy", tier: 3, color: "#899FB7" },
  { name: "Rare", tier: 4, color: "#9C86B7" },
  { name: "Remarkable", tier: 5, color: "#E29554" },
  { name: "Exotic", tier: 6, color: "#D16469" },
];

const byName = new Map(RARITIES.map((r) => [r.name.toLowerCase(), r]));

/** Palette color for a rarity name, or null for unknown/absent (→ neutral tile). */
export function rarityColor(name?: string | null): string | null {
  return name ? byName.get(name.toLowerCase())?.color ?? null : null;
}

/** Tier (1–6) for ordering; unknown/absent → 0. */
export function rarityTier(name?: string | null): number {
  return name ? byName.get(name.toLowerCase())?.tier ?? 0 : 0;
}

/** Whether a string is a known rarity name (case-insensitive). */
export function isRarity(name: string): boolean {
  return byName.has(name.toLowerCase());
}

export const KNOWN_RARITY_NAMES = RARITIES.map((r) => r.name);
