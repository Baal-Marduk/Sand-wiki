import Link from "next/link";
import type { Category } from "@/lib/taxonomy";
import { CategoryIcon } from "@/components/CategoryIcon";

/** Build a category-switch link. `q`/`sort` are preserved only when present. */
export function categoryNavHref(
  basePath: string,
  slug: string,
  opts: { query?: string; sort?: string } = {},
): string {
  const params = new URLSearchParams({ category: slug });
  if (opts.query) params.set("q", opts.query);
  if (opts.sort) params.set("sort", opts.sort);
  return `${basePath}?${params.toString()}`;
}

/** Responsive category switcher. Sticky vertical rail (with per-category counts) on
 *  lg+, horizontal scroll row of chips below lg. Highlights the active category and
 *  preserves ?q=. Matches the `.side-cat` design reference. */
export function CategoryQuickNav({
  categories, current, query, sort, basePath = "/items", label = "Categories", counts,
}: {
  categories: Category[];
  current?: string;
  query?: string;
  sort?: string;
  basePath?: string;
  label?: string;
  counts?: Record<string, number>;
}) {
  const href = (slug: string) => categoryNavHref(basePath, slug, { query, sort });

  return (
    <nav aria-label={label} className="lg:sticky lg:top-[4.5rem]">
      <h2 className="mb-2 hidden px-3 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:block">
        {label}
      </h2>
      <ul className="flex flex-row gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
        {categories.map((c) => {
          const active = c.slug === current;
          const count = counts?.[c.slug];
          return (
            <li key={c.slug} className="shrink-0">
              <Link
                href={href(c.slug)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 whitespace-nowrap border px-3 py-1.5 text-sm transition-colors lg:border-0 lg:border-l-2 lg:py-2 ${
                  active
                    ? "border-border-strong bg-card-elevated font-semibold text-primary lg:border-l-primary"
                    : "row-link border-border-strong text-muted-foreground hover:bg-card-elevated hover:text-foreground lg:border-l-transparent"
                }`}
              >
                <CategoryIcon slug={c.slug} className="size-4 shrink-0" />
                <span className="truncate">{c.label}</span>
                {count !== undefined && (
                  <span
                    className={`ml-auto hidden font-mono text-[11px] lg:inline ${active ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
