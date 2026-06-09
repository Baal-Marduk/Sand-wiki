import { categoryColor, categoryLabel } from "@/lib/taxonomy";

/** Neutral pill with a colored dot. The text label is the meaningful signal;
 *  the dot is decorative (aria-hidden) so there is no color-contrast concern. */
export function CategoryTag({ slug, size }: { slug: string; size?: "sm" }) {
  return (
    <span className={`badge badge-outline gap-1.5 ${size === "sm" ? "badge-sm" : ""}`}>
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: categoryColor(slug) }}
        aria-hidden="true"
      />
      {categoryLabel(slug)}
    </span>
  );
}
