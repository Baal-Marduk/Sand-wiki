import Link from "next/link";
import { rarityColor } from "@/lib/rarity";

/** Inline link to a wiki entity (item / environment / trampler) inside prose:
 *  app `link` style, tinted by rarity color when present (items), else the theme
 *  link color. The href is precomputed by the caller (routes per entity type). */
export function WikiLink({ href, label, rarity }: { href: string; label: string; rarity: string | null }) {
  return (
    <Link
      href={href}
      className="text-primary underline decoration-1 underline-offset-2 transition-opacity hover:opacity-80"
      style={{ color: rarityColor(rarity) ?? undefined }}
    >
      {label}
    </Link>
  );
}
