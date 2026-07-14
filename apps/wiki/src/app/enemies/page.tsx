import { getSection, isEnemyCategory } from "@/lib/taxonomy";
import { listEnemies, enemyCategoryCounts } from "@/lib/queries";
import { sessionIsAdmin } from "@/lib/auth";
import { EntityCard } from "@/components/EntityCard";
import { SectionBanner } from "@/components/SectionBanner";
import { CategoryQuickNav } from "@/components/CategoryQuickNav";
import { CategoryEntryCard, type CategoryEntry } from "@/components/CategoryEntryCard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const metadata = {
  title: "Enemies",
  description: "Enemy NPCs — creatures and enemy tramplers — in SAND: Raiders of Sophie.",
};

export default async function EnemiesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = str(sp.category);
  const category = raw && isEnemyCategory(raw) ? raw : undefined;
  const section = getSection("enemies");
  const categories = section?.categories ?? [];
  const labelOf = (slug: string) => categories.find((c) => c.slug === slug)?.label ?? slug;
  const counts = await enemyCategoryCounts();

  if (!category) {
    const entries: CategoryEntry[] = categories.map((c) => {
      const n = counts[c.slug] ?? 0;
      return {
        icon: c.slug,
        title: c.label,
        wip: c.wip,
        href: c.wip ? undefined : `/enemies?category=${c.slug}`,
        meta: c.wip ? undefined : n > 0 ? `${n} entr${n === 1 ? "y" : "ies"}` : "Coming soon",
      };
    });
    return (
      <section className="pb-2">
        <SectionBanner
          eyebrow="Database"
          title="Enemies"
          tagline="Creatures and enemy tramplers roaming the islands — their stats and drops."
          art="azure-island"
          focal="center 38%"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <CategoryEntryCard key={e.title} entry={e} />
          ))}
        </div>
      </section>
    );
  }

  const admin = await sessionIsAdmin();
  const entities = await listEnemies(category, admin);
  return (
    <section className="py-2">
      <div className="grid items-start gap-6 lg:grid-cols-[212px_1fr]">
        <aside className="order-1">
          <CategoryQuickNav
            categories={categories}
            current={category}
            basePath="/enemies"
            label="Enemy categories"
            counts={counts}
          />
        </aside>

        <div className="order-2 min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">{labelOf(category)}</h1>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {entities.length} result{entities.length === 1 ? "" : "s"}
            </span>
          </div>

          {entities.length === 0 ? (
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
              {entities.map((e) => (
                <EntityCard
                  key={e.id}
                  entity={{ slug: e.slug, name: e.name, href: `/enemies/${e.slug}`, icon: e.icon, categorySlug: category, disabled: e.disabled }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
