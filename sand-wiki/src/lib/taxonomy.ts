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
  { slug: "guns", label: "Guns" },
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
  WEAPON: "guns",
  WEAPON_BELT: "guns",
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
