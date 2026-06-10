import Link from "next/link";
import { getSection, isEnvCategory } from "@/lib/taxonomy";
import { CategoryIcon } from "@/components/CategoryIcon";
import { listEnvEntities, envCategoryCounts } from "@/lib/queries";
import { EnvCard } from "@/components/EnvCard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EnvironmentPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = str(sp.category);
  const category = raw && isEnvCategory(raw) ? raw : undefined;
  const section = getSection("environment");
  const labelOf = (slug: string) => section?.categories.find((c) => c.slug === slug)?.label ?? slug;

  if (!category) {
    const counts = await envCategoryCounts();
    return (
      <section className="py-6">
        <h1 className="font-display text-2xl font-bold mb-4">Environment</h1>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {section?.categories.map((c) => {
            const n = counts[c.slug] ?? 0;
            return (
              <li key={c.slug} className="list-none">
                <Link
                  href={`/environment?category=${c.slug}`}
                  className="card bg-base-200 hover:bg-base-300 transition-colors p-4 flex flex-row items-center gap-3"
                >
                  <CategoryIcon slug={c.slug} className="size-5 shrink-0" />
                  <span className="font-medium flex-1">{c.label}</span>
                  <span className="badge badge-ghost badge-sm">{n > 0 ? n : "coming soon"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const entities = await listEnvEntities(category);
  return (
    <section className="py-6">
      <p className="mb-2"><Link href="/environment" className="btn btn-ghost btn-sm">← Environment</Link></p>
      <h1 className="font-display text-2xl font-bold mb-4">{labelOf(category)}</h1>
      {entities.length === 0 ? (
        <div role="alert" className="alert alert-warning max-w-2xl">
          <span>Coming soon — no entries yet for this category.</span>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((e) => (
            <EnvCard key={e.id} entity={{ slug: e.slug, name: e.name, icon: e.icon }} />
          ))}
        </ul>
      )}
    </section>
  );
}
