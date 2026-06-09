import Link from "next/link";
import { SECTIONS, ITEM_CATEGORIES } from "@/lib/taxonomy";
import { CategoryTag } from "@/components/CategoryTag";

export default function HomePage() {
  return (
    <div className="space-y-10 py-6">
      <section className="hero rounded-box bg-base-200 py-12">
        <div className="hero-content text-center">
          <div className="max-w-xl">
            <h1 className="font-display text-4xl font-bold tracking-wide text-base-content">
              Unofficial SAND Wiki
            </h1>
            <p className="py-3 text-base-content/70">
              Crafting recipes, items, and the tech tree for{" "}
              <em>SAND: Raiders of Sophie</em>.
            </p>
            <form action="/items" method="get" role="search" className="join w-full max-w-md mx-auto">
              <label htmlFor="q" className="sr-only">Search items by name</label>
              <input
                id="q"
                name="q"
                type="search"
                placeholder="Search items by name…"
                className="input input-bordered join-item w-full"
              />
              <button type="submit" className="btn btn-primary join-item">Search</button>
            </form>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {ITEM_CATEGORIES.map((c) => (
                <Link key={c.slug} href={`/items?category=${c.slug}`} className="hover:opacity-80 transition-opacity">
                  <CategoryTag slug={c.slug} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold mb-3">Browse by section</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((section) => (
            <Link
              key={section.slug}
              href={section.href ?? `/${section.slug}`}
              className="card bg-base-200 hover:bg-base-300 transition-colors"
            >
              <div className="card-body">
                <h3 className="card-title font-display">{section.label}</h3>
                <p className="text-sm text-base-content/70">
                  {section.categories.length > 0
                    ? section.categories.map((c) => c.label).join(", ")
                    : "Explore"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
