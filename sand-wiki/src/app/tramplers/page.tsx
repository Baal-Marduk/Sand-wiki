import Link from "next/link";
import { getSection, isTramplerCategory } from "@/lib/taxonomy";
import { CategoryIcon } from "@/components/CategoryIcon";
import { listTramplerParts, tramplerCategoryCounts } from "@/lib/queries";
import { TramplerCard } from "@/components/TramplerCard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TramplersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = str(sp.category);
  const category = raw && isTramplerCategory(raw) ? raw : undefined;
  const section = getSection("tramplers");
  const labelOf = (slug: string) => section?.categories.find((c) => c.slug === slug)?.label ?? slug;

  if (!category) {
    const counts = await tramplerCategoryCounts();
    return (
      <section className="py-6">
        <h1 className="font-display text-2xl font-bold mb-4">Tramplers</h1>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {section?.categories.map((c) => {
            const n = counts[c.slug] ?? 0;
            return (
              <li key={c.slug} className="list-none">
                <Link
                  href={`/tramplers?category=${c.slug}`}
                  className="card bg-base-200 p-4 flex flex-row items-center gap-3"
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

  const parts = await listTramplerParts(category);
  return (
    <section className="py-6">
      <p className="mb-2"><Link href="/tramplers" className="btn btn-ghost btn-sm">← Tramplers</Link></p>
      <h1 className="font-display text-2xl font-bold mb-4">{labelOf(category)}</h1>
      {parts.length === 0 ? (
        <div role="alert" className="alert alert-warning max-w-2xl">
          <span>Coming soon — no entries yet for this category.</span>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {parts.map((p) => (
            <TramplerCard
              key={p.id}
              part={{ slug: p.slug, name: p.name, icon: p.icon, dimensions: p.dimensions, researchTier: p.researchTier }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
