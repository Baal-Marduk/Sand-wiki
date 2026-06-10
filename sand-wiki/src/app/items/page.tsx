import { listItems, listRarities, listWorkbenchTiers, listItemClasses } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { CategoryQuickNav } from "@/components/CategoryQuickNav";
import { FilterSelect } from "@/components/FilterSelect";
import { ITEM_CATEGORIES, isItemCategory, isWeaponClassCategory } from "@/lib/taxonomy";
import { isRarity, rarityTier } from "@/lib/rarity";
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
  const sort: "rarity" | "name" = str(sp.sort) === "name" ? "name" : "rarity";
  const sortParam = sort === "name" ? sort : undefined;

  // Option lists are scoped to the current category + search, independent of the
  // rarity/class/tier constraints (so they show every value available in this context).
  const scope = { query: q || undefined, category: category || undefined };
  const weaponClassMode = isWeaponClassCategory(category);
  const [rarities, classes, tiers] = await Promise.all([
    listRarities(scope),
    weaponClassMode ? listItemClasses(scope) : Promise.resolve<string[]>([]),
    weaponClassMode ? Promise.resolve<number[]>([]) : listWorkbenchTiers(scope),
  ]);

  const raritiesSorted = [...rarities].sort((a, b) => rarityTier(a) - rarityTier(b));

  // Validate the type-dependent params against what's actually available.
  const rawClass = str(sp.class);
  const weaponClass = rawClass && classes.includes(rawClass) ? rawClass : undefined;
  const rawTier = str(sp.tier);
  const tier = rawTier && tiers.includes(Number(rawTier)) ? Number(rawTier) : undefined;

  const filter: ItemFilter = {
    query: q || undefined,
    category: category || undefined,
    rarity: rarity || undefined,
    sort,
    weaponClass: weaponClass || undefined,
    workbenchTier: tier,
  };

  const items = await listItems(filter);

  return (
    <section className="py-6">
      <h1 className="font-display text-2xl font-bold mb-4">Items</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_220px] items-start">
        <div className="min-w-0 order-2 lg:order-1">
          <p className="text-sm text-base-content/70 mb-3" aria-live="polite">
            <span className="badge badge-ghost">{items.length} result(s)</span>
          </p>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <FilterSelect
              name="sort"
              label="Sort"
              allLabel="Rarity"
              value={sortParam}
              options={[{ value: "name", label: "Name (A–Z)" }]}
            />
            {rarities.length > 0 && (
              <FilterSelect
                name="rarity"
                label="Rarity"
                allLabel="All rarities"
                value={rarity}
                options={raritiesSorted.map((r) => ({ value: r, label: r }))}
              />
            )}
            {weaponClassMode && classes.length > 0 && (
              <FilterSelect
                name="class"
                label="Class"
                allLabel="All classes"
                value={weaponClass}
                options={classes.map((c) => ({ value: c, label: c }))}
              />
            )}
            {!weaponClassMode && tiers.length > 0 && (
              <FilterSelect
                name="tier"
                label="Tier"
                allLabel="All tiers"
                value={tier !== undefined ? String(tier) : undefined}
                options={tiers.map((t) => ({ value: String(t), label: `Tier ${t}` }))}
              />
            )}
          </div>
          {items.length === 0 ? (
            <p>No items match your filters.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((i) => (
                <ItemCard
                  key={i.id}
                  item={{
                    slug: i.slug, name: i.name, icon: i.icon, rarity: i.rarity,
                  }}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="order-1 lg:order-2">
          <CategoryQuickNav categories={ITEM_CATEGORIES} current={category} query={q} sort={sortParam} />
        </div>
      </div>
    </section>
  );
}
