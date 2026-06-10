# Item List Filter & Sort Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rarity chip row on `/items` with three URL-driven `<select>` controls (Sort, Rarity, type-dependent Class/Tier) and default the list ordering to rarity (Common-first).

**Architecture:** DB-level filtering stays in `buildItemQuery` (where + name-asc base order). App-level concerns (rarity-tier sort, derived caliber-class filter) move into a new pure `applyItemView` and a shared `itemClass` derivation. The page renders a generic client `FilterSelect` three times; the third select's dimension is chosen by category. All state lives in URL search params.

**Tech Stack:** Next.js 16 (app router, server components), React 19, Prisma 6, Vitest, daisyui 5, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-06-10-item-list-filter-sort-controls-design.md`

---

## File Structure

- `src/lib/ammo.ts` — add `itemClass()`, `CLASS_ORDER`, `itemClasses()` (caliber-class derivation, the single source of "what class is this item").
- `src/lib/item-filter.ts` — extend `ItemFilter`; add pure `applyItemView()` (app-level filter + sort).
- `src/lib/taxonomy.ts` — add `WEAPON_CLASS_CATEGORIES` + `isWeaponClassCategory()`.
- `src/lib/queries.ts` — wire `listItems` through `applyItemView`; re-scope `listWorkbenchTiers(filter)`; add `listItemClasses(filter)`.
- `src/components/FilterSelect.tsx` — NEW generic client `<select>` → URL.
- `src/components/RarityFilter.tsx` — DELETE.
- `src/app/items/page.tsx` — parse/validate params, fetch option lists, render the three selects.
- `src/components/CategoryQuickNav.tsx` — preserve `?sort` across category switches.

---

## Task 1: Caliber-class derivation in `ammo.ts`

**Files:**
- Modify: `src/lib/ammo.ts`
- Test: `src/lib/ammo.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/ammo.test.ts`:

```ts
import { itemClass, itemClasses, CLASS_ORDER } from "./ammo";

describe("itemClass", () => {
  it("derives a weapon's class from its stats.ammoName", () => {
    expect(itemClass("some-rifle", "Service Rifle", { ammoName: "9x42 mm Ammo" })).toBe("Rifle");
  });
  it("derives an ammo item's class from its own name when stats has no ammoName", () => {
    expect(itemClass("ammo-1154", "11x54 mm AP Ammo", null)).toBe("Sniper");
  });
  it("derives a turret's class from its slug override", () => {
    expect(itemClass("game-packed-shotgun-turret-t1-container", "Packed Shotgun Turret", null)).toBe("Shotgun");
  });
  it("returns null when no caliber can be derived", () => {
    expect(itemClass("bandages", "Bandages", null)).toBeNull();
  });
});

describe("itemClasses", () => {
  it("returns distinct present classes in canonical order", () => {
    const rows = [
      { slug: "a", name: "11x54 mm Ammo", stats: null },     // Sniper
      { slug: "b", name: "Rifle", stats: { ammoName: "9x42 mm Ammo" } }, // Rifle
      { slug: "c", name: "Pistol", stats: { ammoName: "8x21 mm Ammo" } }, // Pistol
      { slug: "d", name: "Bandages", stats: null },          // none
    ];
    expect(itemClasses(rows)).toEqual(["Pistol", "Rifle", "Sniper"]);
  });
  it("CLASS_ORDER lists every label caliberLabel can return", () => {
    expect(CLASS_ORDER).toEqual(["Pistol", "Rifle", "Sniper", "Shotgun", "Autocannon", "Naval", "Rocket"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sand-wiki && npm test -- ammo`
Expected: FAIL — `itemClass`, `itemClasses`, `CLASS_ORDER` are not exported.

- [ ] **Step 3: Implement in `src/lib/ammo.ts`**

Append at the end of the file:

```ts
/** Canonical display order of caliber-class labels (every value caliberLabel can return). */
export const CLASS_ORDER = ["Pistol", "Rifle", "Sniper", "Shotgun", "Autocannon", "Naval", "Rocket"];

/** The caliber-class label for an item. Weapons/turrets derive from ammoName/slug; ammo items
 *  fall back to their own name. Null when no caliber can be derived. Single source used by both
 *  the class filter and the class option list. */
export function itemClass(slug: string, name: string, stats: unknown): string | null {
  const ammoName = (stats as { ammoName?: string } | null)?.ammoName;
  return caliberLabel(weaponCaliber(slug, ammoName) ?? ammoCaliber(name));
}

/** Distinct caliber-class labels present in the given rows, in CLASS_ORDER. */
export function itemClasses(rows: { slug: string; name: string; stats: unknown }[]): string[] {
  const present = new Set<string>();
  for (const r of rows) {
    const c = itemClass(r.slug, r.name, r.stats);
    if (c) present.add(c);
  }
  return CLASS_ORDER.filter((c) => present.has(c));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sand-wiki && npm test -- ammo`
Expected: PASS (all `ammo` describes green).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/ammo.ts sand-wiki/src/lib/ammo.test.ts
git commit -m "feat(wiki): add itemClass/itemClasses caliber-class helpers"
```

---

## Task 2: `applyItemView` + extended `ItemFilter` in `item-filter.ts`

**Files:**
- Modify: `src/lib/item-filter.ts`
- Test: `src/lib/item-filter.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/item-filter.test.ts`:

```ts
import { applyItemView } from "./item-filter";

const mk = (slug: string, name: string, rarity: string | null, ammoName?: string) => ({
  slug, name, rarity, stats: ammoName ? { ammoName } : null,
});

describe("applyItemView", () => {
  // Input is in name-asc order (the DB base ordering applyItemView relies on).
  const items = [
    mk("a", "Alpha", "Rare"),     // tier 4
    mk("b", "Bravo", "Common"),   // tier 1
    mk("c", "Charlie", "Common"), // tier 1
    mk("d", "Delta", null),       // tier 0
  ];

  it("sorts by rarity tier ascending with name as the tiebreaker by default", () => {
    expect(applyItemView(items, {}).map((i) => i.slug)).toEqual(["d", "b", "c", "a"]);
  });

  it("treats sort:'rarity' the same as the default", () => {
    expect(applyItemView(items, { sort: "rarity" }).map((i) => i.slug)).toEqual(["d", "b", "c", "a"]);
  });

  it("leaves DB name order untouched for sort:'name'", () => {
    expect(applyItemView(items, { sort: "name" }).map((i) => i.slug)).toEqual(["a", "b", "c", "d"]);
  });

  it("filters by weapon class", () => {
    const weapons = [
      mk("rifle", "Rifle", "Common", "9x42 mm Ammo"),  // Rifle
      mk("snip", "Sniper", "Rare", "11x54 mm Ammo"),   // Sniper
    ];
    expect(applyItemView(weapons, { sort: "name", weaponClass: "Rifle" }).map((i) => i.slug)).toEqual(["rifle"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sand-wiki && npm test -- item-filter`
Expected: FAIL — `applyItemView` is not exported.

- [ ] **Step 3: Implement in `src/lib/item-filter.ts`**

Add the imports at the top (after the existing `import type { Prisma }` line):

```ts
import { rarityTier } from "./rarity";
import { itemClass } from "./ammo";
```

Extend the `ItemFilter` interface — add the two new optional fields:

```ts
export interface ItemFilter {
  query?: string;
  category?: string;
  workbenchTier?: number;
  rarity?: string;
  sort?: "rarity" | "name";
  weaponClass?: string;
}
```

Leave `buildItemQuery` unchanged (it already returns `orderBy: { name: "asc" }`, the stable base for both sort modes; `sort`/`weaponClass` are app-level and intentionally not part of the DB query).

Append the new pure function:

```ts
type ViewItem = { slug: string; name: string; rarity: string | null; stats: unknown };

/** App-level view transform applied after the DB query: optional weapon-class filter, then
 *  rarity-tier ascending sort (Common→Experimental) with the DB's name-asc order as a stable
 *  tiebreaker. sort:'name' passes the DB order through unchanged. */
export function applyItemView<T extends ViewItem>(
  items: T[],
  opts: { sort?: "rarity" | "name"; weaponClass?: string },
): T[] {
  let out = items;
  if (opts.weaponClass) {
    out = out.filter((i) => itemClass(i.slug, i.name, i.stats) === opts.weaponClass);
  }
  if (opts.sort !== "name") {
    out = [...out].sort((a, b) => rarityTier(a.rarity) - rarityTier(b.rarity));
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sand-wiki && npm test -- item-filter`
Expected: PASS (Array.prototype.sort is stable, so equal-tier items keep their name-asc order).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/item-filter.ts sand-wiki/src/lib/item-filter.test.ts
git commit -m "feat(wiki): add applyItemView app-level sort/class filter"
```

---

## Task 3: `isWeaponClassCategory` in `taxonomy.ts`

**Files:**
- Modify: `src/lib/taxonomy.ts`
- Test: `src/lib/taxonomy.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/taxonomy.test.ts` (reuse the file's existing `describe`/`it`/`expect` import from vitest):

```ts
import { isWeaponClassCategory, WEAPON_CLASS_CATEGORIES } from "./taxonomy";

describe("isWeaponClassCategory", () => {
  it("is true only for caliber-bearing categories", () => {
    expect(WEAPON_CLASS_CATEGORIES).toEqual(["weapons", "artillery", "ammo"]);
    expect(isWeaponClassCategory("weapons")).toBe(true);
    expect(isWeaponClassCategory("artillery")).toBe(true);
    expect(isWeaponClassCategory("ammo")).toBe(true);
    expect(isWeaponClassCategory("tools")).toBe(false);
    expect(isWeaponClassCategory(undefined)).toBe(false);
  });
});
```

> If `taxonomy.test.ts` does not already `import { describe, it, expect } from "vitest";`, add that line at the top.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sand-wiki && npm test -- taxonomy`
Expected: FAIL — `isWeaponClassCategory`/`WEAPON_CLASS_CATEGORIES` not exported.

- [ ] **Step 3: Implement in `src/lib/taxonomy.ts`**

Add near the other item-category exports (after `isItemCategory`):

```ts
/** Categories whose items carry a caliber, so they get a "Class" filter instead of a tier filter. */
export const WEAPON_CLASS_CATEGORIES = ["weapons", "artillery", "ammo"];

export function isWeaponClassCategory(slug: string | undefined): boolean {
  return slug !== undefined && WEAPON_CLASS_CATEGORIES.includes(slug);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sand-wiki && npm test -- taxonomy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/taxonomy.ts sand-wiki/src/lib/taxonomy.test.ts
git commit -m "feat(wiki): add isWeaponClassCategory taxonomy helper"
```

---

## Task 4: Wire queries — `listItems`, `listWorkbenchTiers`, `listItemClasses`

**Files:**
- Modify: `src/lib/queries.ts`

No unit test (these hit Prisma; the repo does not unit-test the query layer). Verified via typecheck/build in Task 7 and the manual smoke test.

- [ ] **Step 1: Update imports at the top of `src/lib/queries.ts`**

Change the existing item-filter import line to also bring in `applyItemView`, and add the `itemClasses` import:

```ts
import { buildItemQuery, applyItemView, type ItemFilter } from "./item-filter";
import { itemClasses } from "./ammo";
```

- [ ] **Step 2: Route `listItems` through `applyItemView`**

Replace the current `listItems` body:

```ts
export async function listItems(filter: ItemFilter) {
  const { where, orderBy } = buildItemQuery(filter);
  const items = await prisma.item.findMany({ where, orderBy });
  return applyItemView(items, { sort: filter.sort, weaponClass: filter.weaponClass });
}
```

- [ ] **Step 3: Re-scope `listWorkbenchTiers` to a filter**

Replace the current `listWorkbenchTiers` (which takes no args) with a filter-scoped version mirroring `listRarities`:

```ts
/** Distinct non-null workbench tiers among items matching the filter (ignoring any tier
 *  constraint), ascending — for the items-list tier filter. */
export async function listWorkbenchTiers(filter: ItemFilter): Promise<number[]> {
  const rest = { ...filter };
  delete rest.workbenchTier;
  const { where } = buildItemQuery(rest);
  const rows = await prisma.item.findMany({
    where: { ...where, workbenchTier: { not: null } },
    distinct: ["workbenchTier"],
    select: { workbenchTier: true },
    orderBy: { workbenchTier: "asc" },
  });
  return rows.map((r) => r.workbenchTier).filter((t): t is number => t !== null);
}
```

- [ ] **Step 4: Add `listItemClasses`**

Add after `listWorkbenchTiers`:

```ts
/** Distinct caliber-class labels (Pistol, Rifle, …) among items matching the filter,
 *  in canonical order — for the items-list class filter. */
export async function listItemClasses(filter: ItemFilter): Promise<string[]> {
  const { where } = buildItemQuery(filter);
  const rows = await prisma.item.findMany({
    where,
    select: { slug: true, name: true, stats: true },
  });
  return itemClasses(rows);
}
```

- [ ] **Step 5: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: no errors (the old call sites of `listWorkbenchTiers()` had none; `page.tsx` is updated in Task 6).

- [ ] **Step 6: Commit**

```bash
git add sand-wiki/src/lib/queries.ts
git commit -m "feat(wiki): scope tier query + add class query; route listItems through applyItemView"
```

---

## Task 5: Generic `FilterSelect` client component

**Files:**
- Create: `src/components/FilterSelect.tsx`

- [ ] **Step 1: Create `src/components/FilterSelect.tsx`**

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface SelectOption { value: string; label: string }

/** A single URL-driven dropdown. Selecting an option writes (or clears, for the empty
 *  "all"/default option) one search param and pushes the new URL; all other params are
 *  preserved. The server re-renders and performs the actual filtering/sorting. */
export function FilterSelect({
  name, label, value, options, allLabel,
}: {
  name: string;
  label: string;
  value?: string;
  options: SelectOption[];
  allLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(searchParams.toString());
    if (e.target.value) next.set(name, e.target.value);
    else next.delete(name);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-base-content/60">{label}</span>
      <select
        className="select select-sm select-bordered"
        value={value ?? ""}
        onChange={handleChange}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add sand-wiki/src/components/FilterSelect.tsx
git commit -m "feat(wiki): add generic URL-driven FilterSelect"
```

---

## Task 6: Wire the selects into the items page; delete `RarityFilter`

**Files:**
- Modify: `src/app/items/page.tsx`
- Delete: `src/components/RarityFilter.tsx`

- [ ] **Step 1: Replace `src/app/items/page.tsx` with the wired version**

```tsx
import { listItems, listRarities, listWorkbenchTiers, listItemClasses } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { CategoryQuickNav } from "@/components/CategoryQuickNav";
import { FilterSelect } from "@/components/FilterSelect";
import { ITEM_CATEGORIES, isItemCategory, isWeaponClassCategory } from "@/lib/taxonomy";
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
  const sort: "rarity" | "name" = str(sp.sort) === "name" ? "name" : "rarity";

  // Option lists are scoped to the current category + search, independent of the
  // rarity/class/tier constraints (so they show every value available in this context).
  const scope = { query: q || undefined, category: category || undefined };
  const weaponClassMode = isWeaponClassCategory(category);
  const [rarities, classes, tiers] = await Promise.all([
    listRarities(scope),
    weaponClassMode ? listItemClasses(scope) : Promise.resolve<string[]>([]),
    weaponClassMode ? Promise.resolve<number[]>([]) : listWorkbenchTiers(scope),
  ]);

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
              value={sort === "name" ? "name" : undefined}
              options={[{ value: "name", label: "Name (A–Z)" }]}
            />
            {rarities.length > 0 && (
              <FilterSelect
                name="rarity"
                label="Rarity"
                allLabel="All rarities"
                value={rarity}
                options={rarities.map((r) => ({ value: r, label: r }))}
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
          <CategoryQuickNav categories={ITEM_CATEGORIES} current={category} query={q} sort={sort === "name" ? "name" : undefined} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Delete the obsolete chip component**

```bash
git rm sand-wiki/src/components/RarityFilter.tsx
```

Expected: file removed (it was only imported by `page.tsx`, now updated).

- [ ] **Step 3: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: one error remains — `CategoryQuickNav` does not yet accept a `sort` prop. Fixed in Task 7.

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/app/items/page.tsx
git commit -m "feat(wiki): replace rarity chips with sort/rarity/type selects"
```

---

## Task 7: Preserve `?sort` in `CategoryQuickNav` + full verification

**Files:**
- Modify: `src/components/CategoryQuickNav.tsx`

- [ ] **Step 1: Add the `sort` prop to `CategoryQuickNav`**

In `src/components/CategoryQuickNav.tsx`, update the signature and `href` so the chosen ordering survives a category switch (rarity/class/tier are intentionally dropped, being category-relative):

```tsx
export function CategoryQuickNav({
  categories, current, query, sort,
}: { categories: Category[]; current?: string; query?: string; sort?: string }) {
  const href = (slug: string) =>
    `/items?category=${slug}${query ? `&q=${encodeURIComponent(query)}` : ""}${sort ? `&sort=${sort}` : ""}`;
```

(Leave the rest of the component unchanged.)

- [ ] **Step 2: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd sand-wiki && npm run lint`
Expected: no errors.

- [ ] **Step 4: Run the full unit suite**

Run: `cd sand-wiki && npm test`
Expected: PASS — including the new `ammo`, `item-filter`, and `taxonomy` cases.

- [ ] **Step 5: Production build**

Run: `cd sand-wiki && npm run build`
Expected: build succeeds (validates the server/client component boundary and the App Router types).

- [ ] **Step 6: Manual smoke test**

Run: `cd sand-wiki && npm run dev`, then in a browser:
- `/items` — list defaults to rarity order (Common first); a **Sort** and **Rarity** select show, no chip row.
- Switch Sort to **Name (A–Z)** — list reorders alphabetically; URL gains `?sort=name`.
- `/items?category=weapons` — a **Class** select appears (Pistol/Rifle/Sniper/…); no Tier select. Pick a class — list narrows; URL gains `?class=…`.
- `/items?category=tools` (or another non-weapon category) — a **Workbench tier** select appears instead; no Class select.
- From a weapon class filter, click another category in the sidebar — `class` is dropped but `sort` persists.

- [ ] **Step 7: Commit**

```bash
git add sand-wiki/src/components/CategoryQuickNav.tsx
git commit -m "feat(wiki): preserve sort order across category switches"
```

- [ ] **Step 8: Mark TODO items done**

In `sand-wiki/TODO.md`, check off items 3, 4, and 5 (the sort/type ordering is now delivered via the selects). Commit:

```bash
git add sand-wiki/TODO.md
git commit -m "docs(wiki): mark TODO 3-5 (item list ordering) done"
```

---

## Self-Review Notes

- **Spec coverage:** rarity chips → select (Tasks 5–6); shared rarity select (Task 6); type-dependent Class/Tier select (Tasks 1, 3, 4, 6); rarity-default ordering app-side (Task 2); client-select→URL pattern (Task 5); validation/edge cases — invalid params ignored, class validated against availability, category switch drops type param (Tasks 6–7). TODO 4 & 5 (weapons/artillery by type) delivered by the Class filter.
- **Type consistency:** `applyItemView(items, { sort, weaponClass })`, `ItemFilter.weaponClass`/`.sort`, `listWorkbenchTiers(filter)`, `listItemClasses(filter)`, `itemClass(slug, name, stats)`, `FilterSelect` props, and `CategoryQuickNav` `sort` prop are used identically wherever referenced.
- **No placeholders:** every code step is complete and runnable.
