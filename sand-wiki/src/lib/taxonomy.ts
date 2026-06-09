export type SectionKind = "data" | "placeholder" | "link" | "tools";

export interface Category {
  slug: string;
  label: string;
}

export interface Section {
  slug: string;
  label: string;
  kind: SectionKind;
  href?: string;
  categories: Category[];
}

const itemCategories: Category[] = [
  { slug: "weapons", label: "Weapons" },
  { slug: "artillery", label: "Artillery" },
  { slug: "resources", label: "Resources" },
  { slug: "attire", label: "Attire" },
  { slug: "tools", label: "Tools" },
  { slug: "medical", label: "Medical" },
  { slug: "ammo", label: "Ammo" },
  { slug: "misc", label: "Misc" },
];

export const SECTIONS: Section[] = [
  { slug: "items", label: "Items", kind: "data", categories: itemCategories },
  {
    slug: "environment",
    label: "Environment",
    kind: "placeholder",
    categories: [
      { slug: "loot-containers", label: "Loot Containers" },
      { slug: "npcs", label: "NPCs" },
      { slug: "outposts", label: "Outposts" },
      { slug: "game-modes", label: "Game Modes" },
    ],
  },
  { slug: "tramplers", label: "Tramplers", kind: "placeholder", categories: [] },
  { slug: "tech", label: "Tech Tree", kind: "placeholder", categories: [] },
  { slug: "tools", label: "Tools", kind: "placeholder", categories: [] },
];

export const ITEM_CATEGORIES = itemCategories;
export const ITEM_CATEGORY_SLUGS = itemCategories.map((c) => c.slug);

export function isItemCategory(slug: string): boolean {
  return ITEM_CATEGORY_SLUGS.includes(slug);
}

export function categoryLabel(slug: string): string {
  return itemCategories.find((c) => c.slug === slug)?.label ?? slug;
}

export function getSection(slug: string): Section | undefined {
  return SECTIONS.find((s) => s.slug === slug);
}

/** Maps the scraper's game `type` enum to a wiki item category slug. Unknown/null -> "misc". */
const TYPE_TO_CATEGORY: Record<string, string> = {
  WEAPON: "weapons",
  WEAPON_BELT: "weapons",
  AMMO: "ammo",
  TURRET_AMMO: "ammo",
  RESOURCE_T1: "resources",
  RESOURCE_T2: "resources",
  RESOURCE_T3: "resources",
  ENERGY: "resources",
  ARMOR: "attire",
  BACKPACK: "attire",
  ATTACK_CONSUMABLE: "weapons",
  RAID_EXPLOSIVES: "weapons",
  UTILITY_CONSUMABLE: "tools",
  FOOD: "medical",
  KEY: "misc",
  MONEY: "misc",
  LARGE_VALUABLE: "misc",
  SMALL_VALUABLE: "misc",
};

export function categoryForType(type: string | null | undefined): string {
  if (!type) return "misc";
  return TYPE_TO_CATEGORY[type] ?? "misc";
}

/** Name-aware category. Weapon types whose name contains a number followed by "mm"
 *  (e.g. "40mm", "85 mm") are artillery; everything else uses the type mapping.
 *  This is the single source of the guns→weapons/artillery split — applied at seed time. */
export function categoryForItem(type: string | null | undefined, name: string): string {
  const base = categoryForType(type);
  if (base === "weapons" && /\d+\s?mm/i.test(name)) return "artillery";
  return base;
}

/** Per-category accent color (hex). Decorative dot only — the text label carries meaning. */
export const CATEGORY_COLORS: Record<string, string> = {
  weapons: "#d4654f",
  artillery: "#8b94a6",
  guns: "#8b94a6", // legacy fallback — not a current category
  ammo: "#e0a341",
  resources: "#7fb069",
  tools: "#4fb3a6",
  attire: "#6aa9c9",
  medical: "#d56a8c",
  misc: "#9b8b73",
};

export function categoryColor(slug: string): string {
  return CATEGORY_COLORS[slug] ?? CATEGORY_COLORS.misc;
}
