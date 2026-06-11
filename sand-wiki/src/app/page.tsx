import Link from "next/link";
import { SECTIONS, ITEM_CATEGORIES, isWipSection } from "@/lib/taxonomy";
import { WipBadge } from "@/components/WipBadge";
import { CategoryTag } from "@/components/CategoryTag";
import { SearchBox } from "@/components/SearchBox";

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 py-6">
      <section className="hero rounded-box bg-base-200 py-12">
        <div className="hero-content text-center">
          <div className="max-w-xl">
            <h1 className="font-display text-4xl font-bold tracking-wide text-base-content">
              Unofficial SAND Wiki
            </h1>
            <p className="py-3 text-base-content/70">
              Items, crafting recipes, and trade prices for{" "}
              <em>SAND: Raiders of Sophie</em>.
            </p>
            <SearchBox variant="hero" />
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
          {SECTIONS.map((section) =>
            isWipSection(section) ? (
              <div
                key={section.slug}
                className="card bg-base-200 opacity-60 cursor-not-allowed"
                aria-disabled="true"
              >
                <div className="card-body">
                  <h3 className="card-title font-display">{section.label} <WipBadge /></h3>
                  <p className="text-sm text-base-content/70">Coming soon</p>
                </div>
              </div>
            ) : (
              <Link key={section.slug} href={section.href ?? `/${section.slug}`} className="card bg-base-200">
                <div className="card-body">
                  <h3 className="card-title font-display">{section.label}</h3>
                  <p className="text-sm text-base-content/70">
                    {section.categories.length > 0
                      ? section.categories.map((c) => c.label).join(", ")
                      : "Explore"}
                  </p>
                </div>
              </Link>
            )
          )}
        </div>
      </section>
    </div>
  );
}
