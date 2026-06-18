import { categoryLabel } from "@/lib/taxonomy";
import { CategoryIcon } from "@/components/CategoryIcon";

/** Neutral outline tag with a category icon. The text label is the meaningful
 *  signal; the icon is decorative (aria-hidden). */
export function CategoryTag({ slug, size }: { slug: string; size?: "sm" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-border-strong bg-card-elevated font-mono font-semibold uppercase tracking-[0.04em] text-muted-foreground ${
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      <CategoryIcon slug={slug} className="size-3.5 shrink-0" />
      {categoryLabel(slug)}
    </span>
  );
}
