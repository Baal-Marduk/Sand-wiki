export interface Rarity { name: string; tier: number; color: string }

/** Ordered rarity scale (names from sandgame.wiki) → game-palette colors
 *  (the in-game ItemColorSchemeUIConfig bgDefault per tier). All six names are observed
 *  in the wiki data; "Experimental" is the top crafted tier (e.g. endgame turret kits). */
export const RARITIES: Rarity[] = [
  { name: "Common", tier: 1, color: "#AEAEB2" },
  { name: "Uncommon", tier: 2, color: "#7CB079" },
  { name: "Rare", tier: 3, color: "#7AA8D2" },
  { name: "Noteworthy", tier: 4, color: "#A37FC9" },
  { name: "Remarkable", tier: 5, color: "#E59A52" },
  { name: "Experimental", tier: 6, color: "#D85F64" },
];

const byName = new Map(RARITIES.map((r) => [r.name.toLowerCase(), r]));

/** Palette color for a rarity name, or null for unknown/absent (→ neutral tile). */
export function rarityColor(name?: string | null): string | null {
  return name ? byName.get(name.toLowerCase())?.color ?? null : null;
}

/** Default rarity for items with no rarity info — everything is at least Common. */
export const DEFAULT_RARITY = "Common";

/** Tier (1–6) for ordering; unknown/absent → 0. */
export function rarityTier(name?: string | null): number {
  return name ? byName.get(name.toLowerCase())?.tier ?? 0 : 0;
}

/** Array sort comparator: rarity tier ascending (Common→Experimental), unknown/absent
 *  rarity last, then name A→Z. For ordering item lists by rarity. */
export function byRarityThenName<T extends { rarity?: string | null; name: string }>(a: T, b: T): number {
  const ta = rarityTier(a.rarity) || Infinity; // unknown (tier 0) sorts last
  const tb = rarityTier(b.rarity) || Infinity;
  if (ta !== tb) return ta - tb;
  return a.name.localeCompare(b.name);
}

/** Whether a string is a known rarity name (case-insensitive). */
export function isRarity(name: string): boolean {
  return byName.has(name.toLowerCase());
}

export const KNOWN_RARITY_NAMES = RARITIES.map((r) => r.name);

/** Parse "#RRGGBB" → [r,g,b]. */
function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Blend two "#RRGGBB" colors. `t` is the weight of `b` (0 → a, 1 → b). Uppercase output. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`.toUpperCase();
}

/** CSS background for the rarity tile: a 135° gradient with a bright rarity corner
 *  fading to near-black. Concrete hex stops (no color-mix) so SSR and client match.
 *  Null for unknown/absent rarity → caller paints the neutral slot. */
export function rarityGradient(name?: string | null): string | null {
  const c = rarityColor(name);
  if (!c) return null;
  const corner = mixHex(c, "#FFFFFF", 0.05);
  const mid = mixHex(c, "#14171F", 0.65);
  return `linear-gradient(135deg, ${corner} 0%, ${mid} 38%, #11131A 100%)`;
}
