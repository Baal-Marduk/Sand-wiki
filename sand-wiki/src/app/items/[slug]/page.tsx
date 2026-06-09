import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemBySlug } from "@/lib/queries";
import { CategoryTag } from "@/components/CategoryTag";
import { RecipeCardView } from "@/components/RecipeCardView";

type Params = Promise<{ slug: string }>;

export default async function ItemDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  return (
    <article className="py-6 space-y-6 max-w-3xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold">{item.name}</h1>
        <div className="flex flex-wrap gap-2">
          <CategoryTag slug={item.category} />
          {item.isResource && <span className="badge badge-secondary">Resource</span>}
          {item.workbenchTier !== null && (
            <span className="badge badge-outline">Workbench tier {item.workbenchTier}</span>
          )}
          {item.storageStack !== null && (
            <span className="badge badge-ghost">Stacks to {item.storageStack}</span>
          )}
        </div>
        {item.description && <p className="text-base-content/80">{item.description}</p>}
      </header>

      <section>
        <h2 className="font-display text-xl font-semibold mb-2">Crafted by</h2>
        {item.craftedBy.length === 0 ? (
          <p className="text-base-content/70">No known recipe produces this item.</p>
        ) : (
          <div className="space-y-3">
            {item.craftedBy.map((r) => <RecipeCardView key={r.slug} recipe={r} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold mb-2">Used in</h2>
        {item.usedIn.length === 0 ? (
          <p className="text-base-content/70">Not used as an ingredient in any known recipe.</p>
        ) : (
          <div className="space-y-3">
            {item.usedIn.map((r) => <RecipeCardView key={r.slug} recipe={r} />)}
          </div>
        )}
      </section>

      <p><Link href="/items" className="btn btn-ghost btn-sm">← Back to items</Link></p>
    </article>
  );
}
