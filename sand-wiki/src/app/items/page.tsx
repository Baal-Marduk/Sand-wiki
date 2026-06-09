import { listItems, getTradeFlags } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { CategoryQuickNav } from "@/components/CategoryQuickNav";
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
  const filter: ItemFilter = {
    query: q || undefined,
    category: category || undefined,
  };

  const [items, tradeFlags] = await Promise.all([listItems(filter), getTradeFlags()]);

  return (
    <section className="py-6">
      <h1 className="font-display text-2xl font-bold mb-4">Items</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_220px] items-start">
        <div className="min-w-0 order-2 lg:order-1">
          <p className="text-sm text-base-content/70 mb-3" aria-live="polite">
            <span className="badge badge-ghost">{items.length} result(s)</span>
          </p>
          {items.length === 0 ? (
            <p>No items match your filters.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((i) => (
                <ItemCard
                  key={i.id}
                  item={{
                    slug: i.slug, name: i.name, icon: i.icon, category: i.category, workbenchTier: i.workbenchTier,
                    buyable: tradeFlags.buyable.has(i.slug),
                    sellable: tradeFlags.sellable.has(i.slug),
                  }}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="order-1 lg:order-2">
          <CategoryQuickNav categories={ITEM_CATEGORIES} current={category} query={q} />
        </div>
      </div>
    </section>
  );
}
