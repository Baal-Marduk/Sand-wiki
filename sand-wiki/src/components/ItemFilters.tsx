export interface FilterOptions {
  types: string[];
  resources: { id: string; name: string }[];
  current: { q?: string; type?: string; workbench?: string; resource?: string; sort?: string };
}

export function ItemFilters({ types, resources, current }: FilterOptions) {
  return (
    <form action="/items" method="get" className="grid gap-3 sm:grid-cols-6 items-end mb-6">
      <div className="sm:col-span-2">
        <label htmlFor="q" className="block text-sm">Name</label>
        <input id="q" name="q" type="search" defaultValue={current.q ?? ""}
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1" />
      </div>
      <div>
        <label htmlFor="type" className="block text-sm">Type</label>
        <select id="type" name="type" defaultValue={current.type ?? ""}
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1">
          <option value="">All</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="workbench" className="block text-sm">Workbench level</label>
        <input id="workbench" name="workbench" type="number" min={1} inputMode="numeric"
          defaultValue={current.workbench ?? ""} placeholder="Any"
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1" />
      </div>
      <div>
        <label htmlFor="resource" className="block text-sm">Uses resource</label>
        <select id="resource" name="resource" defaultValue={current.resource ?? ""}
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1">
          <option value="">Any</option>
          {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="sort" className="block text-sm">Sort by</label>
        <select id="sort" name="sort" defaultValue={current.sort ?? "name"}
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1">
          <option value="name">Name</option>
          <option value="workbench">Workbench level</option>
        </select>
      </div>
      <button type="submit" className="rounded bg-amber-600 text-neutral-950 font-medium px-4 py-2 sm:col-span-6 sm:w-32">
        Apply
      </button>
    </form>
  );
}
