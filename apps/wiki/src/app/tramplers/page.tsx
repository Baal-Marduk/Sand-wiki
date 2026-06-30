import { getSection, isTramplerCategory, TRAMPLER_CATEGORIES } from "@/lib/taxonomy";
import { listTramplerParts, tramplerCategoryCounts } from "@/lib/queries";
import { sessionIsAdmin } from "@/lib/auth";
import { EntityCard, type EntityStat } from "@/components/EntityCard";
import { SectionBanner } from "@/components/SectionBanner";
import { CategoryQuickNav, categoryNavHref } from "@/components/CategoryQuickNav";
import { CategoryEntryCard, type CategoryEntry } from "@/components/CategoryEntryCard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const metadata = {
  title: "Tramplers",
  description: "Trampler parts, stats, and build costs in SAND: Raiders of Sophie.",
};

export default async function TramplersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = str(sp.category);
  const category = raw && isTramplerCategory(raw) ? raw : undefined;
  const section = getSection("tramplers");
  const labelOf = (slug: string) => section?.categories.find((c) => c.slug === slug)?.label ?? slug;
  const counts = await tramplerCategoryCounts();

  // Landing: a grid of category entry cards with per-category part counts.
  if (!category) {
    const entries: CategoryEntry[] = (section?.categories ?? []).map((c) => {
      const n = counts[c.slug] ?? 0;
      return {
        icon: c.slug,
        title: c.label,
        href: categoryNavHref("/tramplers", c.slug),
        meta: n > 0 ? `${n} part${n === 1 ? "" : "s"}` : "Coming soon",
      };
    });
    return (
      <section className="pb-2">
        <SectionBanner
          eyebrow="Database"
          title="Tramplers"
          tagline="Chassis, legs, cabins, turrets and every part you can bolt onto your machine."
          art="walker"
          focal="center 40%"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <CategoryEntryCard key={e.href} entry={e} />
          ))}
        </div>
      </section>
    );
  }

  // Category view: the shared browse shell (sidebar + EntityCard grid).
  const admin = await sessionIsAdmin();
  const parts = await listTramplerParts(category, admin);
  return (
    <section className="py-2">
      <div className="grid items-start gap-6 lg:grid-cols-[212px_1fr]">
        <aside className="order-1">
          <CategoryQuickNav
            categories={TRAMPLER_CATEGORIES}
            current={category}
            basePath="/tramplers"
            label="Trampler categories"
            counts={counts}
          />
        </aside>

        <div className="order-2 min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">{labelOf(category)}</h1>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {parts.length} result{parts.length === 1 ? "" : "s"}
            </span>
          </div>

          {parts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 border border-border bg-card py-14 text-center text-muted-foreground">
              <span className="grid size-14 place-items-center border border-border bg-card-elevated text-2xl text-border-strong">
                ▦
              </span>
              <span className="font-display text-base uppercase tracking-[0.04em] text-foreground">
                Coming soon
              </span>
              <span className="max-w-xs text-sm">No entries yet for this category.</span>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {parts.map((p) => {
                const tier = p.tramplerStats?.researchTier;
                const stats: EntityStat[] | undefined =
                  tier != null ? [{ k: "tier", v: String(tier) }] : undefined;
                return (
                  <EntityCard
                    key={p.id}
                    entity={{
                      slug: p.slug,
                      name: p.name,
                      href: `/tramplers/${p.slug}`,
                      icon: p.icon,
                      typeLabel: p.tramplerStats?.dimensions ?? null,
                      stats,
                      disabled: p.disabled,
                    }}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
