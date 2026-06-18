import { rarityGradient } from "@/lib/rarity";
import { categoryColor } from "@/lib/taxonomy";
import { CategoryIcon } from "@/components/CategoryIcon";

/** Neutral inventory slot for icons with no rarity (trampler parts, env entities). */
const NEUTRAL_SLOT = "linear-gradient(135deg, #2A2E37 0%, #181B22 45%, #11131A 100%)";

/** Placeholder glyph size paired with each tile size (~45% of the tile). */
const GLYPH_PX = { sm: "size-3", recipe: "size-7", md: "size-6", card: "size-9", lg: "size-24" } as const;

/** Item image on a rarity-tinted tile. When `icon` is set, render the sprite floated
 *  inside the tile; otherwise a placeholder glyph. Single change point for item imagery.
 *  Pass `decorative` when the name is already shown as adjacent text. Pass `rarity` to
 *  paint the rarity gradient (decorative — the rarity name is shown as text elsewhere);
 *  absent/unknown rarity falls back to the neutral slot. When `icon` is missing, pass
 *  `categorySlug` to fall back to that category's glyph (e.g. a chest for loot containers)
 *  instead of the generic ▦. */
export function ItemIcon({
  name,
  icon,
  size = "md",
  decorative = false,
  rarity,
  categorySlug,
}: {
  name: string;
  icon?: string | null;
  size?: "sm" | "recipe" | "md" | "card" | "lg";
  decorative?: boolean;
  rarity?: string | null;
  categorySlug?: string | null;
}) {
  const px = { sm: "size-5", recipe: "size-14", md: "size-12", card: "size-18", lg: "size-54" }[size];
  const gradient = rarityGradient(rarity);
  const tile = `item-sprite ${px} rounded-box shrink-0 overflow-hidden inline-flex items-center justify-center`;
  const style = { background: gradient ?? NEUTRAL_SLOT };

  if (icon) {
    return (
      <span style={style} className={tile}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icon}
          alt={decorative ? "" : name}
          aria-hidden={decorative || undefined}
          // `lg` is the detail-page hero (above the fold) — keep it eager so it
          // doesn't delay LCP. Smaller sizes appear in lists/recipes — lazy them.
          loading={size === "lg" ? "eager" : "lazy"}
          decoding="async"
          className="size-[80%] object-contain [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.45))]"
        />
      </span>
    );
  }
  return (
    <span
      style={style}
      className={`${tile} ${gradient ? "text-background" : "text-dim"}`}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name, title: name })}
    >
      {categorySlug ? (
        <span aria-hidden style={gradient ? undefined : { color: categoryColor(categorySlug) }}>
          <CategoryIcon slug={categorySlug} className={GLYPH_PX[size]} />
        </span>
      ) : (
        <span aria-hidden="true">▦</span>
      )}
    </span>
  );
}
