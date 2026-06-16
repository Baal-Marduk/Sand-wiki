import Link from "next/link";
import { listItems, listRarities, listWorkbenchTiers, listItemClasses, itemCategoryCounts } from "@/lib/queries";
import { EntityCard } from "@/components/EntityCard";
import { CategoryQuickNav } from "@/components/CategoryQuickNav";
import { FilterSelect } from "@/components/FilterSelect";
import { RarityChips } from "@/components/RarityChips";
import { ITEM_CATEGORIES, isItemCategory, isWeaponClassCategory, categoryLabel } from "@/lib/taxonomy";
import { isRarity, rarityTier } from "@/lib/rarity";
import { caliberLabel } from "@/lib/ammo";
import type { ItemFilter } from "@/lib/item-filter";
import { sessionIsAdmin } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export const metadata = {
  title: "Items",
  description: "Browse every weapon, resource, tool, and item in SAND: Raiders of Sophie.",
};

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
  const [rarities, classes, tiers, catCounts] = await Promise.all([
    listRarities(scope),
    weaponClassMode ? listItemClasses(scope) : Promise.resolve<string[]>([]),
    weaponClassMode ? Promise.resolve<number[]>([]) : listWorkbenchTiers(scope),
    itemCategoryCounts(),
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

  const admin = await sessionIsAdmin();
  const items = await listItems(filter, admin);
  const title = category ? categoryLabel(category) : "Items";
  const clearHref = category ? `/items?category=${category}` : "/items";

  return (
    <section className="py-2">
      <div className="grid items-start gap-6 lg:grid-cols-[212px_1fr]">
        <aside className="order-1">
          <CategoryQuickNav
            categories={ITEM_CATEGORIES}
            current={category}
            query={q}
            sort={sortParam}
            label="Item categories"
            counts={catCounts}
          />
        </aside>

        <div className="order-2 min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">{title}</h1>
            <span className="shrink-0 font-mono text-xs text-muted-foreground" aria-live="polite">
              {items.length} result{items.length === 1 ? "" : "s"}
            </span>
          </div>

          {rarities.length > 0 && (
            <div className="mb-3">
              <RarityChips rarities={raritiesSorted} current={rarity} />
            </div>
          )}

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <FilterSelect
                name="sort"
                label="Sort"
                allLabel="Rarity"
                value={sortParam}
                options={[{ value: "name", label: "Name (A–Z)" }]}
              />
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
            <div className="flex flex-col items-center justify-center gap-3 border border-border bg-card py-14 text-center text-muted-foreground">
              <span className="grid size-14 place-items-center border border-border bg-card-elevated text-2xl text-border-strong">
                ▦
              </span>
              <span className="font-display text-base uppercase tracking-[0.04em] text-foreground">
                No items match
              </span>
              <span className="max-w-xs text-sm">
                No items match the selected filters. Try removing a rarity or clearing the filters.
              </span>
              <Link
                href={clearHref}
                className="border border-border-strong px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.05em] text-foreground transition-colors hover:border-primary hover:text-primary-hover"
              >
                Clear all filters
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((i) => (
                <EntityCard
                  key={i.id}
                  entity={{
                    slug: i.slug,
                    name: i.name,
                    href: `/items/${i.slug}`,
                    icon: i.icon,
                    rarity: i.rarity,
                    typeLabel: caliberLabel(i.ammoType),
                    disabled: i.disabled,
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
