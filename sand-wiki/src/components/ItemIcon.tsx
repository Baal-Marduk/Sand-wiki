import { rarityColor } from "@/lib/rarity";

/** Item image. When `icon` is set, render the sprite; otherwise a placeholder glyph.
 *  This is the single change point for item imagery.
 *  Pass `decorative` when the item name is already shown as adjacent text, so screen
 *  readers don't announce the name twice. Pass `rarity` to tint the tile background with
 *  the item's rarity color (decorative — the rarity name is always shown as text elsewhere). */
export function ItemIcon({
  name,
  icon,
  size = "md",
  decorative = false,
  rarity,
}: {
  name: string;
  icon?: string | null;
  size?: "sm" | "recipe" | "md" | "card" | "lg";
  decorative?: boolean;
  rarity?: string | null;
}) {
  const px = { sm: "size-5", recipe: "size-14", md: "size-12", card: "size-18", lg: "size-28" }[size];
  const tint = rarityColor(rarity);
  const bg = tint ? "" : "bg-base-300";
  const style = tint ? { backgroundColor: tint } : undefined;
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt={decorative ? "" : name}
        style={style}
        className={`${px} rounded-box ${bg} object-contain shrink-0`}
      />
    );
  }
  return (
    <span
      style={style}
      className={`${px} inline-flex items-center justify-center rounded-box ${bg} shrink-0 ${tint ? "text-base-100" : "text-base-content/40"}`}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name, title: name })}
    >
      <span aria-hidden="true">▦</span>
    </span>
  );
}
