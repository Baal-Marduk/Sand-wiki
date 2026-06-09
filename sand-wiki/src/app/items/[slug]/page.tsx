import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemBySlug } from "@/lib/queries";
import { categoryLabel } from "@/lib/taxonomy";

type Params = Promise<{ slug: string }>;

export default async function ItemDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  return (
    <article className="py-6 space-y-6 max-w-2xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold">{item.name}</h1>
        <div className="flex flex-wrap gap-2">
          <span className="badge badge-primary">{categoryLabel(item.category)}</span>
          {item.workbenchLevel !== null && (
            <span className="badge badge-outline">Workbench {item.workbenchLevel}</span>
          )}
          {item.craftTimeSeconds !== null && (
            <span className="badge badge-ghost">{item.craftTimeSeconds}s craft</span>
          )}
        </div>
        {item.description && <p className="text-base-content/80">{item.description}</p>}
      </header>

      {(item.unlockConditions || item.unlockedBy) && (
        <div className="card bg-base-200">
          <div className="card-body p-4 text-sm space-y-1">
            {item.unlockConditions && <p><span className="text-base-content/60">Unlock:</span> {item.unlockConditions}</p>}
            {item.unlockedBy && (
              <p>
                <span className="text-base-content/60">Unlocked by tech:</span>{" "}
                <Link className="link link-primary" href="/tech">{item.unlockedBy.name}</Link>
              </p>
            )}
          </div>
        </div>
      )}

      {item.recipe.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold mb-2">Recipe</h2>
          <ul className="space-y-1">
            {item.recipe.map((r) => (
              <li key={r.id}>
                <span className="badge badge-ghost badge-sm mr-2">{r.quantity}×</span>
                <Link className="link" href={`/items/${r.ingredient.slug}`}>{r.ingredient.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.usedIn.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold mb-2">Used in</h2>
          <ul className="space-y-1">
            {item.usedIn.map((u) => (
              <li key={u.id}><Link className="link" href={`/items/${u.item.slug}`}>{u.item.name}</Link></li>
            ))}
          </ul>
        </section>
      )}

      <p><Link href="/items" className="btn btn-ghost btn-sm">← Back to items</Link></p>
    </article>
  );
}
