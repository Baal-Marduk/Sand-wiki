import Link from "next/link";
import type { Category } from "@/lib/taxonomy";
import { categoryColor } from "@/lib/taxonomy";

/** Responsive category switcher. Sticky vertical list on lg+, horizontal scroll
 *  row of chips below lg. Highlights the active category and preserves ?q=. */
export function CategoryQuickNav({
  categories, current, query,
}: { categories: Category[]; current?: string; query?: string }) {
  const href = (slug: string) =>
    `/items?category=${slug}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  return (
    <nav aria-label="Item categories" className="lg:sticky lg:top-[4.5rem]">
      <h2 className="hidden lg:block font-display text-xs font-semibold uppercase tracking-wide text-base-content/60 mb-2">
        Jump to
      </h2>
      <ul className="flex flex-row gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {categories.map((c) => {
          const active = c.slug === current;
          return (
            <li key={c.slug} className="shrink-0">
              <Link
                href={href(c.slug)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-field px-3 py-1.5 text-sm whitespace-nowrap border lg:border-0 ${
                  active
                    ? "bg-base-300 text-base-content font-semibold border-base-300"
                    : "border-base-300 lg:border-transparent hover:bg-base-200 text-base-content"
                }`}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(c.slug) }} aria-hidden="true" />
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
