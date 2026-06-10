# Search autocomplete: landmarks & loot containers — design

TODO #11: "Add landmarks and loot containers to search auto fill."

## Goal

The search box autocomplete suggests item categories and items. Extend it to also suggest
**landmarks** and **loot containers** (their detail pages live at `/environment/{slug}`),
shown as two separate groups in the dropdown. Scope is exactly those two `EnvEntity`
categories — not game-modes or NPCs.

## Current state

- `/api/search-index` returns an array of all items: `{ slug, name, category, derivedName }`.
- `src/lib/search.ts`: `searchSuggestions(query, index)` → `{ categories, items }` (categories
  from `ITEM_CATEGORIES` label match; items from name/derivedName substring, cap 8).
- `SearchBox.tsx`: loads the index once, flattens `{ categories, items }`, renders a
  **Categories** group then an **Items** group via ad-hoc `isFirstCat`/`isFirstItem`
  header detection, and navigates category → `/items?category={slug}`, item → `/items/{slug}`.
- `EnvEntity` rows have `{ slug, name, category }`; categories include `loot-containers`
  and `landmarks`; detail pages are `/environment/{slug}`; each category has a `CategoryIcon`.

## Design

### 1. Index API (`src/app/api/search-index/route.ts`)

Return an object instead of a bare array:

```ts
const [items, places] = await Promise.all([
  prisma.item.findMany({ select: { slug: true, name: true, category: true, derivedName: true }, orderBy: { name: "asc" } }),
  prisma.envEntity.findMany({
    where: { category: { in: ["loot-containers", "landmarks"] } },
    select: { slug: true, name: true, category: true },
    orderBy: { name: "asc" },
  }),
]);
return NextResponse.json({ items, places }, { headers: { "cache-control": "public, max-age=3600" } });
```

### 2. Search lib (`src/lib/search.ts`)

```ts
export interface IndexItem { slug: string; name: string; category: string; derivedName?: string | null }
export interface IndexPlace { slug: string; name: string; category: string } // category: "loot-containers" | "landmarks"
export interface SearchIndex { items: IndexItem[]; places: IndexPlace[] }
export interface Suggestions { categories: Category[]; items: IndexItem[]; places: IndexPlace[] }

const ITEM_CAP = 8;
const PLACE_CAP = 6;

export function searchSuggestions(query: string, items: IndexItem[], places: IndexPlace[] = []): Suggestions {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return { categories: [], items: [], places: [] };
  const categories = ITEM_CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
  const matchedItems = items
    .filter((i) => i.name.toLowerCase().includes(q) || (i.derivedName ?? "").toLowerCase().includes(q))
    .slice(0, ITEM_CAP);
  const matchedPlaces = places.filter((p) => p.name.toLowerCase().includes(q)).slice(0, PLACE_CAP);
  return { categories, items: matchedItems, places: matchedPlaces };
}
```

Items/categories behavior is unchanged; `places` is additive.

### 3. SearchBox (`src/components/SearchBox.tsx`)

- `loadIndex()` fetches the `{ items, places }` object (default `{ items: [], places: [] }` on
  error); component state holds a `SearchIndex`.
- Call `searchSuggestions(query, index.items, index.places)`.
- Replace the ad-hoc header logic with an ordered **groups** model:

```ts
interface Flat { kind: "category" | "item" | "place"; slug: string; label: string; category: string }
interface Group { header: string; options: Flat[] }
```

Built in order, each included only when non-empty:
1. **Categories** — `kind: "category"`, navigates `/items?category={slug}`.
2. **Items** — `kind: "item"`, navigates `/items/{slug}`.
3. **Loot Containers** — places with `category === "loot-containers"`, `kind: "place"`, navigates `/environment/{slug}`.
4. **Landmarks** — places with `category === "landmarks"`, `kind: "place"`, navigates `/environment/{slug}`.

Render: iterate groups, emit a `role="presentation"` header `<li>` then the group's
options, assigning each option a running global index for `aria-activedescendant` and the
existing keyboard navigation (which operates on the flattened option list — unchanged in
behavior). Each row keeps `CategoryIcon slug={option.category}`; the right-aligned tag is
"filter" for categories, "page" for items and places.

`navigate(f)`: `category` → `/items?category=${f.slug}`; `item` → `/items/${f.slug}`;
`place` → `/environment/${f.slug}`.

## Testing

- **Vitest (`src/lib/search.test.ts`)**: update the two empty-query assertions to expect
  `{ categories: [], items: [], places: [] }`. Add a `places` fixture and tests: a place
  matches by name; results partition correctly (loot-containers vs landmarks consumed by the
  component, but `searchSuggestions` returns them in one `places` array filtered by query);
  `places` respects `PLACE_CAP`; an empty `places` arg (default) yields `places: []`.
- **E2E (`tests/e2e/wiki.spec.ts`)**: on `/items`, type "Weapon Crate" in the navbar search;
  assert a "Loot Containers" group header and a "Weapon Crate" option appear; click it and
  assert navigation to `/environment/weapon-crate`.
- The both-theme axe gate continues to guard the dropdown (roles, `aria-activedescendant`,
  `aria-expanded` unchanged).

## Out of scope

- Game-modes and NPCs (not requested).
- No change to free-text submit (still `/items?q=`), item/category matching, or caps for items.
