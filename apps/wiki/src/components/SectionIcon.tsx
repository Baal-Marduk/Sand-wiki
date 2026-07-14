import type { IconType } from "react-icons";
import {
  GiCardboardBox, GiIsland, GiTank, GiChemicalDrop, GiWrench,
  GiPhotoCamera, GiDeathSkull, GiDatabase,
} from "react-icons/gi";

/** Monochrome glyph for a top-level nav SECTION (keyed by section slug — a different
 *  keyspace than CategoryIcon's category slugs). Decorative: the section label text
 *  always sits beside it. Falls back to a neutral box for unmapped slugs. */
const SECTION_ICONS: Record<string, IconType> = {
  items: GiCardboardBox,
  environment: GiIsland,
  tramplers: GiTank,
  enemies: GiDeathSkull,
  tech: GiChemicalDrop,
  builder: GiWrench,
  gallery: GiPhotoCamera,
  admin: GiDatabase,
};

export function SectionIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = SECTION_ICONS[slug] ?? GiCardboardBox;
  return <Icon aria-hidden className={className ?? "size-4 shrink-0"} />;
}
