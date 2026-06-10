import Link from "next/link";
import { SECTIONS } from "@/lib/taxonomy";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchBox } from "@/components/SearchBox";
import { CategoryIcon } from "@/components/CategoryIcon";

// Explicit full-contrast text (not DaisyUI's dimmed .menu links) so the nav
// meets WCAG AA contrast in both the dark and light themes.
const linkCls = "nav-link text-base-content px-2 py-1 rounded";
const dropdownItemCls = "flex items-center gap-2 px-2 py-1 rounded text-base-content hover:bg-base-300";

export function MainNav() {
  return (
    <nav aria-label="Primary" className="navbar max-w-6xl mx-auto px-4">
      <div className="flex-1 flex flex-wrap items-center gap-2">
        <Link href="/" className="font-display text-xl font-bold text-primary tracking-wide">
          SAND
        </Link>
        <ul className="flex flex-wrap items-center gap-1">
          {SECTIONS.map((section) => {
            if (section.kind === "data" && section.categories.length > 0) {
              return (
                <li key={section.slug} className="relative group">
                  <button type="button" className={`${linkCls} cursor-pointer`} aria-haspopup="true">
                    {section.label} ▾
                  </button>
                  <ul
                    className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute left-0 top-full z-20 pt-2 w-48 space-y-1"
                  >
                    <li className="rounded-box border border-base-300 bg-base-200 p-2 shadow space-y-1 list-none">
                      <ul className="space-y-1">
                        {section.categories.map((c) => (
                          <li key={c.slug}>
                            <Link href={`/${section.slug}?category=${c.slug}`} className={dropdownItemCls}>
                              <CategoryIcon slug={c.slug} className="size-4 shrink-0" />
                              {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  </ul>
                </li>
              );
            }
            const href = section.href ?? `/${section.slug}`;
            return (
              <li key={section.slug}>
                <Link href={href} className={linkCls}>{section.label}</Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex-none flex items-center gap-2">
        <SearchBox variant="navbar" />
        <Link href="/about" className={linkCls}>About</Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
