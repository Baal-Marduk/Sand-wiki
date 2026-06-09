/** Item image. When `icon` is set, render the sprite; otherwise a placeholder glyph.
 *  This is the single change point for item imagery. */
export function ItemIcon({
  name,
  icon,
  size = "md",
}: {
  name: string;
  icon?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const px = { sm: "size-5", md: "size-12", lg: "size-28" }[size];
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt={name}
        title={name}
        className={`${px} rounded-box bg-base-300 object-contain shrink-0`}
      />
    );
  }
  return (
    <span
      className={`${px} inline-flex items-center justify-center rounded-box bg-base-300 text-base-content/40 shrink-0`}
      role="img"
      aria-label={name}
      title={name}
    >
      <span aria-hidden="true">▦</span>
    </span>
  );
}
