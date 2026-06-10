import { categoryLabel } from "@/lib/taxonomy";
import { CategoryIcon } from "@/components/CategoryIcon";

/** Neutral pill with a category icon. The text label is the meaningful signal;
 *  the icon is decorative (aria-hidden). */
export function CategoryTag({ slug, size }: { slug: string; size?: "sm" }) {
  return (
    <span className={`badge badge-outline gap-1.5 ${size === "sm" ? "badge-sm" : ""}`}>
      <CategoryIcon slug={slug} className="size-3.5 shrink-0" />
      {categoryLabel(slug)}
    </span>
  );
}
