/** Placeholder for the (not-yet-available) item image. Swap the inner glyph for an
 *  <img> when item images land — this is the single change point. */
export function ItemIcon({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const px = { sm: "size-5", md: "size-12", lg: "size-28" }[size];
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
