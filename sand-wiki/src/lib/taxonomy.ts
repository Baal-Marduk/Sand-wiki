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
  { slug: "tech", label: "Tech Tree", kind: "link", href: "/tech", categories: [] },
  { slug: "tools", label: "Tools", kind: "tools", href: "/tools", categories: [] },
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
