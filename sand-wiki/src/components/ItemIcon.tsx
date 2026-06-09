/** Item image. When `icon` is set, render the sprite; otherwise a placeholder glyph.
 *  This is the single change point for item imagery.
 *  Pass `decorative` when the item name is already shown as adjacent text, so screen
 *  readers don't announce the name twice. */
export function ItemIcon({
  name,
  icon,
  size = "md",
  decorative = false,
}: {
  name: string;
  icon?: string | null;
  size?: "sm" | "recipe" | "md" | "card" | "lg";
  decorative?: boolean;
}) {
  const px = { sm: "size-5", recipe: "size-11", md: "size-12", card: "size-18", lg: "size-28" }[size];
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt={decorative ? "" : name}
        className={`${px} rounded-box bg-base-300 object-contain shrink-0`}
      />
    );
  }
  return (
    <span
      className={`${px} inline-flex items-center justify-center rounded-box bg-base-300 text-base-content/40 shrink-0`}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name, title: name })}
    >
      <span aria-hidden="true">▦</span>
    </span>
  );
}
