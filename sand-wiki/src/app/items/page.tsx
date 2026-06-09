import { listItems, listRarities, getTradeFlags } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { CategoryQuickNav } from "@/components/CategoryQuickNav";
import { RarityFilter } from "@/components/RarityFilter";
import { ITEM_CATEGORIES, isItemCategory } from "@/lib/taxonomy";
import { isRarity } from "@/lib/rarity";
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
  const rawRarity = str(sp.rarity);
  const rarity = rawRarity && isRarity(rawRarity) ? rawRarity : undefined;
  const filter: ItemFilter = {
    query: q || undefined,
    category: category || undefined,
    rarity: rarity || undefined,
  };

  const [items, rarities, tradeFlags] = await Promise.all([
    listItems(filter),
    listRarities({ query: q || undefined, category: category || undefined }),
    getTradeFlags(),
  ]);

  return (
    <section className="py-6">
      <h1 className="font-display text-2xl font-bold mb-4">Items</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_220px] items-start">
        <div className="min-w-0 order-2 lg:order-1">
          <p className="text-sm text-base-content/70 mb-3" aria-live="polite">
            <span className="badge badge-ghost">{items.length} result(s)</span>
          </p>
          <RarityFilter rarities={rarities} current={rarity} category={category} query={q} />
          {items.length === 0 ? (
            <p>No items match your filters.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((i) => (
                <ItemCard
                  key={i.id}
                  item={{
                    slug: i.slug, name: i.name, icon: i.icon, rarity: i.rarity,
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
