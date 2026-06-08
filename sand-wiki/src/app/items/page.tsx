import { listItems, listItemTypes, listResources } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { ItemFilters } from "@/components/ItemFilters";
import type { ItemFilter } from "@/lib/item-filter";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = str(sp.q);
  const type = str(sp.type);
  const resource = str(sp.resource);
  const sortParam = str(sp.sort);
  const sort: ItemFilter["sort"] = sortParam === "workbench" ? "workbench" : "name";

  const filter: ItemFilter = {
    query: q || undefined,
    type: type || undefined,
    requiredResourceId: resource || undefined,
    sort,
  };

  const [items, types, resources] = await Promise.all([
    listItems(filter), listItemTypes(), listResources(),
  ]);

  return (
    <section className="py-6">
      <h1 className="text-2xl font-bold mb-4">Items</h1>
      <ItemFilters
        types={types}
        resources={resources.map((r) => ({ id: r.id, name: r.name }))}
        current={{ q, type, resource, sort }}
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
