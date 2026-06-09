import { listItems, listWorkbenchTiers } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { ItemFilters } from "@/components/ItemFilters";
import { ITEM_CATEGORIES, isItemCategory } from "@/lib/taxonomy";
import type { ItemFilter } from "@/lib/item-filter";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = str(sp.q);
  const rawCategory = str(sp.category);
  const category = rawCategory && isItemCategory(rawCategory) ? rawCategory : undefined;
  const tierParam = str(sp.tier);
  const workbenchTier =
    tierParam && Number.isInteger(Number(tierParam)) ? Number(tierParam) : undefined;
  const sortParam = str(sp.sort);
  const sort: ItemFilter["sort"] = sortParam === "workbench" ? "workbench" : "name";

  const filter: ItemFilter = {
    query: q || undefined,
    category: category || undefined,
    workbenchTier,
    sort,
  };

  const [items, tiers] = await Promise.all([listItems(filter), listWorkbenchTiers()]);

  return (
    <section className="py-6">
      <h1 className="font-display text-2xl font-bold mb-4">Items</h1>
      <ItemFilters
        categories={ITEM_CATEGORIES}
        tiers={tiers}
        current={{ q, category, tier: tierParam, sort }}
      />
      <p className="text-sm text-base-content/70 mb-3" aria-live="polite">
        <span className="badge badge-ghost">{items.length} result(s)</span>
      </p>
      {items.length === 0 ? (
        <p>No items match your filters.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => <ItemCard key={i.id} item={i} />)}
        </ul>
      )}
    </section>
  );
}
