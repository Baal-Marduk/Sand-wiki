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
      <header>
        <h1 className="text-2xl font-bold">{item.name}</h1>
        <p className="text-neutral-400">{categoryLabel(item.category)}</p>
        {item.description && <p className="mt-2">{item.description}</p>}
      </header>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        {item.workbenchLevel !== null && (
          <><dt className="text-neutral-400">Workbench level</dt><dd>{item.workbenchLevel}</dd></>
        )}
        {item.craftTimeSeconds !== null && (
          <><dt className="text-neutral-400">Craft time</dt><dd>{item.craftTimeSeconds}s</dd></>
        )}
        {item.unlockConditions && (
          <><dt className="text-neutral-400">Unlock</dt><dd>{item.unlockConditions}</dd></>
        )}
        {item.unlockedBy && (
          <><dt className="text-neutral-400">Unlocked by tech</dt>
            <dd><Link className="underline" href="/tech">{item.unlockedBy.name}</Link></dd></>
        )}
      </dl>

      {item.recipe.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-2">Recipe</h2>
          <ul className="space-y-1">
            {item.recipe.map((r) => (
              <li key={r.id}>
                {r.quantity} ×{" "}
                <Link className="underline" href={`/items/${r.ingredient.slug}`}>{r.ingredient.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.usedIn.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-2">Used in</h2>
          <ul className="space-y-1">
            {item.usedIn.map((u) => (
              <li key={u.id}>
                <Link className="underline" href={`/items/${u.item.slug}`}>{u.item.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p><Link href="/items" className="underline">← Back to items</Link></p>
    </article>
  );
}
