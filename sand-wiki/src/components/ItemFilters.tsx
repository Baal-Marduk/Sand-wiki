import type { Category } from "@/lib/taxonomy";

export interface FilterOptions {
  categories: Category[];
  resources: { id: string; name: string }[];
  current: { q?: string; category?: string; workbench?: string; resource?: string; sort?: string };
}

export function ItemFilters({ categories, resources, current }: FilterOptions) {
  return (
    <form action="/items" method="get" className="card bg-base-200 mb-6">
      <div className="card-body grid gap-3 sm:grid-cols-6 items-end">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="label text-sm">Name</label>
          <input id="q" name="q" type="search" defaultValue={current.q ?? ""} className="input input-bordered w-full" />
        </div>
        <div>
          <label htmlFor="category" className="label text-sm">Category</label>
          <select id="category" name="category" defaultValue={current.category ?? ""} className="select select-bordered w-full">
            <option value="">All</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="workbench" className="label text-sm">Workbench level</label>
          <input id="workbench" name="workbench" type="number" min={1} inputMode="numeric"
            defaultValue={current.workbench ?? ""} placeholder="Any" className="input input-bordered w-full" />
        </div>
        <div>
          <label htmlFor="resource" className="label text-sm">Uses resource</label>
          <select id="resource" name="resource" defaultValue={current.resource ?? ""} className="select select-bordered w-full">
            <option value="">Any</option>
            {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="label text-sm">Sort by</label>
          <select id="sort" name="sort" defaultValue={current.sort ?? "name"} className="select select-bordered w-full">
            <option value="name">Name</option>
            <option value="workbench">Workbench level</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary sm:col-span-6 sm:w-32">Apply</button>
      </div>
    </form>
  );
}
