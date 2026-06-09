import Link from "next/link";
import { SECTIONS } from "@/lib/taxonomy";
import { ThemeToggle } from "@/components/ThemeToggle";

export function MainNav() {
  return (
    <nav aria-label="Primary" className="navbar max-w-5xl mx-auto px-4">
      <div className="flex-1 items-center gap-2">
        <Link href="/" className="font-display text-xl font-bold text-primary tracking-wide">
          SAND
        </Link>
        <ul className="menu menu-horizontal items-center gap-1 px-2">
          {SECTIONS.map((section) => {
            if (section.kind === "data" && section.categories.length > 0) {
              return (
                <li key={section.slug}>
                  <details>
                    <summary>{section.label}</summary>
                    <ul className="bg-base-200 rounded-box z-10 w-48 p-2 shadow">
                      <li>
                        <Link href={`/${section.slug}`}>All {section.label}</Link>
                      </li>
                      {section.categories.map((c) => (
                        <li key={c.slug}>
                          <Link href={`/${section.slug}?category=${c.slug}`}>{c.label}</Link>
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
                <Link href={href}>{section.label}</Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex-none items-center gap-1">
        <Link href="/about" className="btn btn-ghost btn-sm">About</Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
