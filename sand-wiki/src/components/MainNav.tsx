import Link from "next/link";
import { SECTIONS } from "@/lib/taxonomy";
import { ThemeToggle } from "@/components/ThemeToggle";

// Explicit full-contrast text (not DaisyUI's dimmed .menu links) so the nav
// meets WCAG AA contrast in both the dark and light themes.
const linkCls = "text-base-content hover:text-primary px-2 py-1 rounded transition-colors";
const dropdownItemCls = "block px-2 py-1 rounded text-base-content hover:bg-base-300";

export function MainNav() {
  return (
    <nav aria-label="Primary" className="navbar max-w-5xl mx-auto px-4">
      <div className="flex-1 flex flex-wrap items-center gap-2">
        <Link href="/" className="font-display text-xl font-bold text-primary tracking-wide">
          SAND
        </Link>
        <ul className="flex flex-wrap items-center gap-1">
          {SECTIONS.map((section) => {
            if (section.kind === "data" && section.categories.length > 0) {
              return (
                <li key={section.slug} className="relative">
                  <details>
                    <summary className={`${linkCls} cursor-pointer list-none`}>{section.label}</summary>
                    <ul className="absolute z-10 mt-2 w-48 rounded-box border border-base-300 bg-base-200 p-2 shadow space-y-1">
                      <li>
                        <Link href={`/${section.slug}`} className={dropdownItemCls}>All {section.label}</Link>
                      </li>
                      {section.categories.map((c) => (
                        <li key={c.slug}>
                          <Link href={`/${section.slug}?category=${c.slug}`} className={dropdownItemCls}>{c.label}</Link>
                        </li>
                      ))}
                    </ul>
                  </details>
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
      <div className="flex-none items-center gap-1">
        <Link href="/about" className={linkCls}>About</Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
