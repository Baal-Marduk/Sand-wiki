import type { IconType } from "react-icons";
import {
  GiPistolGun, GiFieldGun, GiWoodPile , GiArmorVest, GiFirstAidKit,
  GiAmmoBox, GiCardboardBox, GiOpenChest, GiCastle, GiGamepad, GiPerson,
} from "react-icons/gi";
import { BsTools } from "react-icons/bs";

/** Monochrome category glyph (replaces the old color dot). Decorative — the category
 *  label text always sits beside it, so meaning is never icon-only. */
const ICONS: Record<string, IconType> = {
  weapons: GiPistolGun,
  artillery: GiFieldGun,
  resources: GiWoodPile,
  attire: GiArmorVest,
  tools: BsTools,
  medical: GiFirstAidKit,
  ammo: GiAmmoBox,
  misc: GiCardboardBox,
  "loot-containers": GiOpenChest,
  landmarks: GiCastle,
  "game-modes": GiGamepad,
  npcs: GiPerson,
};

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICONS[slug] ?? GiCardboardBox;
  return <Icon aria-hidden className={className ?? "size-4 shrink-0"} />;
}
