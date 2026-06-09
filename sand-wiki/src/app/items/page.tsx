import { listItems, listResources } from "@/lib/queries";
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
  // Ignore unknown categories so a bad ?category= shows all items (and the select resets to "All").
  const category = rawCategory && isItemCategory(rawCategory) ? rawCategory : undefined;
  const resource = str(sp.resource);
  const workbench = str(sp.workbench);
  const sortParam = str(sp.sort);
  const sort: ItemFilter["sort"] = sortParam === "workbench" ? "workbench" : "name";

  const workbenchLevel =
    workbench && Number.isInteger(Number(workbench)) ? Number(workbench) : undefined;

  const filter: ItemFilter = {
    query: q || undefined,
    category: category || undefined,
    workbenchLevel,
    requiredResourceId: resource || undefined,
    sort,
  };

  const [items, resources] = await Promise.all([listItems(filter), listResources()]);

  return (
    <section className="py-6">
      <h1 className="text-2xl font-bold mb-4">Items</h1>
      <ItemFilters
        categories={ITEM_CATEGORIES}
        resources={resources.map((r) => ({ id: r.id, name: r.name }))}
        current={{ q, category, workbench, resource, sort }}
      />
      <p className="text-sm text-neutral-400 mb-2" aria-live="polite">{items.length} result(s)</p>
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
