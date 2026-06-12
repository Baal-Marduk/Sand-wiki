import Link from "next/link";
import { rarityColor } from "@/lib/rarity";

/** Inline item link inside prose: app `link` style, tinted by the item's rarity
 *  color (theme link color when the rarity is unknown/absent). */
export function ItemTextLink({ slug, label, rarity }: { slug: string; label: string; rarity: string | null }) {
  return (
    <Link href={`/items/${slug}`} className="link" style={{ color: rarityColor(rarity) ?? undefined }}>
      {label}
    </Link>
  );
}
