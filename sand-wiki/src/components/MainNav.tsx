import Link from "next/link";
import { SECTIONS } from "@/lib/taxonomy";

export function MainNav() {
  return (
    <nav aria-label="Primary" className="max-w-5xl mx-auto flex flex-wrap gap-4 items-center p-4">
      <Link href="/" className="font-bold">SAND Wiki</Link>

      {SECTIONS.map((section) => {
        // Data section (Items): dropdown of category links.
        if (section.kind === "data" && section.categories.length > 0) {
          return (
            <details key={section.slug} className="relative">
              <summary className="cursor-pointer list-none underline-offset-4 hover:underline">
                {section.label}
              </summary>
              <ul className="absolute z-10 mt-2 min-w-44 rounded border border-neutral-700 bg-neutral-900 p-2 space-y-1">
                <li>
                  <Link href={`/${section.slug}`} className="block px-2 py-1 rounded hover:bg-neutral-800">
                    All {section.label}
                  </Link>
                </li>
                {section.categories.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/${section.slug}?category=${c.slug}`}
                      className="block px-2 py-1 rounded hover:bg-neutral-800"
                    >
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          );
        }
        // Link / tools / placeholder sections: a single top-level link to their page.
        const href = section.href ?? `/${section.slug}`;
        return (
          <Link key={section.slug} href={href} className="underline-offset-4 hover:underline">
            {section.label}
          </Link>
        );
      })}

      <Link href="/about" className="underline-offset-4 hover:underline ml-auto">About</Link>
    </nav>
  );
}
