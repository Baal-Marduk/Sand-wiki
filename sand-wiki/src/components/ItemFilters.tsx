import type { Category } from "@/lib/taxonomy";

export interface FilterOptions {
  categories: Category[];
  tiers: number[];
  current: { q?: string; category?: string; tier?: string; sort?: string };
}

export function ItemFilters({ categories, tiers, current }: FilterOptions) {
  return (
    <form action="/items" method="get" className="card bg-base-200 mb-6">
      <div className="card-body grid gap-3 sm:grid-cols-5 items-end">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="block text-sm font-medium mb-1">Name</label>
          <input id="q" name="q" type="search" defaultValue={current.q ?? ""} className="input input-bordered w-full" />
        </div>
        <div>
          <label htmlFor="category" className="block text-sm font-medium mb-1">Category</label>
          <select id="category" name="category" defaultValue={current.category ?? ""} className="select select-bordered w-full">
            <option value="">All</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tier" className="block text-sm font-medium mb-1">Workbench tier</label>
          <select id="tier" name="tier" defaultValue={current.tier ?? ""} className="select select-bordered w-full">
            <option value="">Any</option>
            {tiers.map((t) => <option key={t} value={t}>Tier {t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="block text-sm font-medium mb-1">Sort by</label>
          <select id="sort" name="sort" defaultValue={current.sort ?? "name"} className="select select-bordered w-full">
            <option value="name">Name</option>
            <option value="workbench">Workbench tier</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary sm:col-span-5 sm:w-32">Apply</button>
      </div>
    </form>
  );
}
