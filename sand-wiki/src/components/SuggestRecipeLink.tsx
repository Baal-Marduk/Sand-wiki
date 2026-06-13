import Link from "next/link";

export function SuggestRecipeLink({ slug }: { slug: string }) {
  return (
    <Link
      href={`/contribute/edit-recipe?slug=${slug}`}
      className="inline-flex items-center whitespace-nowrap border border-border-strong px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.05em] text-foreground transition-colors hover:border-primary hover:bg-card-elevated hover:text-primary-hover"
    >
      Suggest a correction
    </Link>
  );
}
