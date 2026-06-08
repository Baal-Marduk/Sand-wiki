export function SearchBar({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/items" method="get" role="search" className="flex gap-2">
      <label htmlFor="q" className="sr-only">Search items by name</label>
      <input
        id="q" name="q" type="search" defaultValue={defaultValue}
        placeholder="Search items by name…"
        className="flex-1 rounded bg-neutral-900 border border-neutral-700 px-3 py-2"
      />
      <button type="submit" className="rounded bg-amber-600 text-neutral-950 font-medium px-4 py-2">
        Search
      </button>
    </form>
  );
}
