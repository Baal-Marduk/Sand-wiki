# Navbar Search + Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a navbar search bar with name/tag autocomplete (shared with the home hero), make the navbar section menus open on hover/focus and close on un-hover, and remove the items-list "Sort by" control.

**Architecture:** One shared client `SearchBox` component (variants `navbar`/`hero`) loads a small cached JSON search index from a new route handler and filters it client-side via a pure `searchSuggestions()` helper; selecting a suggestion navigates with the Next router. The navbar's `<details>` menus become a CSS hover/focus-within dropdown (keeping `MainNav` a server component).

**Tech Stack:** Next.js 16 (App Router, RSC + client components), Prisma 6, DaisyUI 5, vitest, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-06-09-navbar-search-autocomplete-design.md`

**Environment notes (from project memory):**
- Use the **PowerShell** tool for `npm`/`node`/`npx` — Bash has no Node on PATH. Prefix each command with `Set-Location "d:\Documents\SandLabs\sand-wiki";`.
- Deps are installed and the Prisma client is generated; **do not run `npm install`**. `sand-wiki/.env` exists with `DATABASE_URL` (gitignored).
- `next build` works without a DB (dynamic routes); `next dev`/e2e need the DB (configured).
- Branch: `build/wiki-search-autocomplete`. Commit there; do not switch branches.
- Use DaisyUI semantic classes; axe must pass in both `desertnight` and `desertday` themes.

**Behavior reference:** item-name suggestion → `/items/<slug>`; category-tag suggestion → `/items?category=<slug>`; plain Enter with nothing highlighted → `/items?q=<query>`.

---

## File Structure

**Create:**
- `src/lib/search.ts` — pure `searchSuggestions(query, index)` matcher.
- `src/lib/search.test.ts` — unit tests.
- `src/app/api/search-index/route.ts` — cached GET route returning the item index.
- `src/components/SearchBox.tsx` — client combobox used by navbar + hero.

**Modify:**
- `src/lib/item-filter.ts` — drop `sort`.
- `src/lib/item-filter.test.ts` — drop the sort assertion.
- `src/components/ItemFilters.tsx` — remove the Sort-by control.
- `src/app/items/page.tsx` — stop reading the `sort` param.
- `src/components/MainNav.tsx` — add `SearchBox`; hover/focus-within menus.
- `src/app/page.tsx` — replace hero form with `SearchBox variant="hero"`.
- `tests/e2e/wiki.spec.ts` — update the old search test; add new coverage.

All paths relative to `sand-wiki/`. Run all commands from `sand-wiki/`.

---

## Task 1: Remove "Sort by"

**Files:**
- Modify: `src/lib/item-filter.ts`
- Modify: `src/lib/item-filter.test.ts`
- Modify: `src/components/ItemFilters.tsx`
- Modify: `src/app/items/page.tsx`

- [ ] **Step 1: Update the unit test to drop sort**

In `src/lib/item-filter.test.ts`, delete the last test (`"sorts by workbench tier when requested"`, the `it(...)` block on lines ~20-22). Leave the other three tests unchanged (they already assert default name-ascending ordering).

- [ ] **Step 2: Run the test — it still passes (sort field unused now)**

Run: `npm test -- item-filter`
Expected: PASS (3 tests). (We removed the only test that exercised `sort`.)

- [ ] **Step 3: Remove `sort` from the filter module**

Replace `src/lib/item-filter.ts` entirely with:

```ts
import type { Prisma } from "@prisma/client";

export interface ItemFilter {
  query?: string;
  category?: string;
  workbenchTier?: number;
}

export interface ItemQuery {
  where: Prisma.ItemWhereInput;
  orderBy: Prisma.ItemOrderByWithRelationInput;
}

export function buildItemQuery(filter: ItemFilter): ItemQuery {
  const where: Prisma.ItemWhereInput = {};
  if (filter.query) where.name = { contains: filter.query, mode: "insensitive" };
  if (filter.category) where.category = filter.category;
  if (filter.workbenchTier !== undefined) where.workbenchTier = filter.workbenchTier;

  return { where, orderBy: { name: "asc" } };
}
```

- [ ] **Step 4: Remove the Sort-by control from the filter form**

In `src/components/ItemFilters.tsx`:
(a) In the `current` prop type, remove `sort?: string;` from the `current` object type so it reads:
```tsx
  current: { q?: string; category?: string; tier?: string };
```
(b) Delete the entire Sort-by `<div>` block (the one containing `<label htmlFor="sort">` and `<select id="sort" name="sort">`).
(c) Change the grid from 5 to 4 columns and the Apply button span from 5 to 4. The `card-body` div className becomes:
```tsx
      <div className="card-body grid gap-3 sm:grid-cols-4 items-end">
```
and the submit button becomes:
```tsx
        <button type="submit" className="btn btn-primary sm:col-span-4 sm:w-32">Apply</button>
```
(Name keeps `sm:col-span-2`; Category and Tier each take one column → 2+1+1 = 4.)

- [ ] **Step 5: Stop reading the `sort` param on the items page**

In `src/app/items/page.tsx`:
(a) Delete the two lines that compute `sortParam` and `sort`:
```tsx
  const sortParam = str(sp.sort);
  const sort: ItemFilter["sort"] = sortParam === "workbench" ? "workbench" : "name";
```
(b) Remove `sort,` from the `filter` object literal.
(c) Remove `sort` from the `current` prop passed to `<ItemFilters .../>`, so it reads:
```tsx
        current={{ q, category, tier: tierParam }}
```

- [ ] **Step 6: Verify**

Run: `npm test -- item-filter; npx tsc --noEmit; npm run build`
Expected: vitest 3 pass; no type errors; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/item-filter.ts src/lib/item-filter.test.ts src/components/ItemFilters.tsx src/app/items/page.tsx
git commit -m "feat: remove Sort-by control from items list"
```

---

## Task 2: `search.ts` suggestion matcher (TDD)

**Files:**
- Create: `src/lib/search.ts`
- Test: `src/lib/search.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/search.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { searchSuggestions, type IndexItem } from "./search";

const index: IndexItem[] = [
  { slug: "sniper-rifle", name: "Sniper Rifle", category: "guns" },
  { slug: "pistol-ammo", name: "Pistol Ammo", category: "ammo" },
  { slug: "energy-bar", name: "Energy Bar", category: "medical" },
];

describe("searchSuggestions", () => {
  it("returns nothing for an empty/whitespace query", () => {
    expect(searchSuggestions("", index)).toEqual({ categories: [], items: [] });
    expect(searchSuggestions("   ", index)).toEqual({ categories: [], items: [] });
  });

  it("matches item names case-insensitively", () => {
    const r = searchSuggestions("rifle", index);
    expect(r.items.map((i) => i.slug)).toEqual(["sniper-rifle"]);
  });

  it("matches category labels", () => {
    const r = searchSuggestions("ammo", index);
    expect(r.categories.map((c) => c.slug)).toContain("ammo");
    expect(r.items.map((i) => i.slug)).toContain("pistol-ammo");
  });

  it("caps item results at 8", () => {
    const many: IndexItem[] = Array.from({ length: 20 }, (_, n) => ({
      slug: `gun-${n}`, name: `Gun ${n}`, category: "guns",
    }));
    expect(searchSuggestions("gun", many).items).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/search`
Expected: FAIL — `./search` does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/search.ts`:

```ts
import { ITEM_CATEGORIES, type Category } from "@/lib/taxonomy";

export interface IndexItem { slug: string; name: string; category: string }
export interface Suggestions { categories: Category[]; items: IndexItem[] }

const ITEM_CAP = 8;

/** Case-insensitive substring match over category labels + item names. */
export function searchSuggestions(query: string, index: IndexItem[]): Suggestions {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return { categories: [], items: [] };
  const categories = ITEM_CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
  const items = index.filter((i) => i.name.toLowerCase().includes(q)).slice(0, ITEM_CAP);
  return { categories, items };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/search`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/search.ts src/lib/search.test.ts
git commit -m "feat: searchSuggestions matcher for item/category autocomplete"
```

---

## Task 3: `/api/search-index` route handler

**Files:**
- Create: `src/app/api/search-index/route.ts`

- [ ] **Step 1: Create the route handler**

Create `src/app/api/search-index/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Lightweight index of all items for client-side search autocomplete. */
export async function GET() {
  const items = await prisma.item.findMany({
    select: { slug: true, name: true, category: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(items, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
```

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit; npm run build`
Expected: no type errors; build succeeds and lists a `/api/search-index` route (`ƒ` dynamic).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/search-index/route.ts
git commit -m "feat: search-index route handler for autocomplete data"
```

---

## Task 4: `SearchBox` client component

**Files:**
- Create: `src/components/SearchBox.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/SearchBox.tsx`:

```tsx
"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { categoryColor } from "@/lib/taxonomy";
import { searchSuggestions, type IndexItem, type Suggestions } from "@/lib/search";

// Shared across all instances — fetch the index at most once per page load.
let indexPromise: Promise<IndexItem[]> | null = null;
function loadIndex(): Promise<IndexItem[]> {
  if (!indexPromise) {
    indexPromise = fetch("/api/search-index")
      .then((r) => (r.ok ? (r.json() as Promise<IndexItem[]>) : []))
      .catch(() => []);
  }
  return indexPromise;
}

interface Flat { kind: "category" | "item"; slug: string; label: string; category: string }

function flatten(s: Suggestions): Flat[] {
  return [
    ...s.categories.map((c) => ({ kind: "category" as const, slug: c.slug, label: c.label, category: c.slug })),
    ...s.items.map((i) => ({ kind: "item" as const, slug: i.slug, label: i.name, category: i.category })),
  ];
}

export function SearchBox({ variant }: { variant: "navbar" | "hero" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState<IndexItem[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Hide the navbar search on the homepage (the hero search covers it there).
  if (variant === "navbar" && pathname === "/") return null;

  const suggestions = query.trim() ? flatten(searchSuggestions(query, index)) : [];
  const showList = open && suggestions.length > 0;

  function ensureIndex() {
    if (index.length === 0) loadIndex().then(setIndex);
  }

  function navigate(f: Flat) {
    setOpen(false);
    setActive(-1);
    setQuery("");
    if (f.kind === "category") router.push(`/items?category=${f.slug}`);
    else router.push(`/items/${f.slug}`);
  }

  function submitFreeText() {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/items?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && active >= 0 && suggestions[active]) navigate(suggestions[active]);
      else submitFreeText();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const inputCls =
    variant === "navbar"
      ? "input input-sm input-bordered rounded-full w-44 sm:w-56"
      : "input input-bordered join-item w-full";

  return (
    <div ref={boxRef} className={`relative ${variant === "hero" ? "w-full max-w-md mx-auto" : ""}`}>
      <div className={variant === "hero" ? "join w-full" : ""}>
        <input
          type="search"
          role="combobox"
          aria-label="Search items"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          placeholder="Search items…"
          value={query}
          className={inputCls}
          onFocus={() => { ensureIndex(); setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); setActive(-1); setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        {variant === "hero" && (
          <button type="button" className="btn btn-primary join-item" onClick={submitFreeText}>
            Search
          </button>
        )}
      </div>

      {showList && (
        <ul
          role="listbox"
          id={listId}
          className="absolute left-0 top-full z-30 mt-1 w-full min-w-[16rem] rounded-box border border-base-300 bg-base-200 p-1 shadow"
        >
          {suggestions.map((f, i) => {
            const isFirstItem = f.kind === "item" && (i === 0 || suggestions[i - 1].kind === "category");
            const isFirstCat = f.kind === "category" && i === 0;
            return (
              <Fragment key={`${f.kind}-${f.slug}`}>
                {isFirstCat && (
                  <li role="presentation" className="px-2 pt-1 pb-0.5 text-xs uppercase tracking-wide text-base-content/50">
                    Categories
                  </li>
                )}
                {isFirstItem && (
                  <li role="presentation" className="px-2 pt-1 pb-0.5 text-xs uppercase tracking-wide text-base-content/50">
                    Items
                  </li>
                )}
                <li
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={active === i}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-sm cursor-pointer ${active === i ? "bg-base-300" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); navigate(f); }}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(f.category) }} aria-hidden="true" />
                  {f.label}
                  <span className="ml-auto text-xs text-base-content/50" aria-hidden="true">
                    {f.kind === "category" ? "filter" : "page"}
                  </span>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check, lint, build**

Run: `npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npm run build }`
Expected: no type errors, no lint errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchBox.tsx
git commit -m "feat: SearchBox autocomplete combobox (navbar + hero variants)"
```

---

## Task 5: Navbar — add search + hover/focus-within menus

**Files:**
- Modify: `src/components/MainNav.tsx`

- [ ] **Step 1: Replace MainNav with the hover-menu + search version**

Replace `src/components/MainNav.tsx` entirely with:

```tsx
import Link from "next/link";
import { SECTIONS, categoryColor } from "@/lib/taxonomy";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchBox } from "@/components/SearchBox";

// Explicit full-contrast text (not DaisyUI's dimmed .menu links) so the nav
// meets WCAG AA contrast in both the dark and light themes.
const linkCls = "text-base-content hover:text-primary px-2 py-1 rounded transition-colors";
const dropdownItemCls = "flex items-center gap-2 px-2 py-1 rounded text-base-content hover:bg-base-300";

export function MainNav() {
  return (
    <nav aria-label="Primary" className="navbar max-w-6xl mx-auto px-4">
      <div className="flex-1 flex flex-wrap items-center gap-2">
        <Link href="/" className="font-display text-xl font-bold text-primary tracking-wide">
          SAND
        </Link>
        <ul className="flex flex-wrap items-center gap-1">
          {SECTIONS.map((section) => {
            if (section.kind === "data" && section.categories.length > 0) {
              return (
                <li key={section.slug} className="relative group">
                  <button type="button" className={`${linkCls} cursor-pointer`} aria-haspopup="true">
                    {section.label} ▾
                  </button>
                  <ul
                    className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute left-0 top-full z-20 mt-1 w-48 rounded-box border border-base-300 bg-base-200 p-2 shadow space-y-1"
                  >
                    <li>
                      <Link href={`/${section.slug}`} className={dropdownItemCls}>All {section.label}</Link>
                    </li>
                    {section.categories.map((c) => (
                      <li key={c.slug}>
                        <Link href={`/${section.slug}?category=${c.slug}`} className={dropdownItemCls}>
                          <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(c.slug) }} aria-hidden="true" />
                          {c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            }
            const href = section.href ?? `/${section.slug}`;
            return (
              <li key={section.slug}>
                <Link href={href} className={linkCls}>{section.label}</Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex-none flex items-center gap-2">
        <SearchBox variant="navbar" />
        <Link href="/about" className={linkCls}>About</Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
```

Note: `categoryColor` is exported from `src/lib/taxonomy.ts` (added in the earlier design pass). The menu opens on hover (`group-hover`) and on keyboard focus (`group-focus-within`), and closes when the mouse leaves or focus moves away. `MainNav` stays a server component; `SearchBox` is the only client island.

- [ ] **Step 2: Type-check, lint, build**

Run: `npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npm run build }`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/components/MainNav.tsx
git commit -m "feat: navbar search + hover/focus-within section menus"
```

---

## Task 6: Home hero uses SearchBox

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace the hero search form with SearchBox**

In `src/app/page.tsx`:
(a) Add the import:
```tsx
import { SearchBox } from "@/components/SearchBox";
```
(b) Replace the hero `<form action="/items" method="get" role="search" ...>...</form>` block (the input + Search button) with:
```tsx
            <SearchBox variant="hero" />
```
Leave the surrounding hero heading, subtitle, and the `ITEM_CATEGORIES` dot chips unchanged.

- [ ] **Step 2: Type-check, lint, build**

Run: `npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npm run build }`
Expected: all green. (If `Link` is now unused in `page.tsx`, leave it — it is still used by the category chips and the section cards.)

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: home hero uses SearchBox autocomplete"
```

---

## Task 7: e2e coverage + full gate

**Files:**
- Modify: `tests/e2e/wiki.spec.ts`

- [ ] **Step 1: Update the existing home-search test**

In `tests/e2e/wiki.spec.ts`, replace the existing `test("search navigates to filtered items list", ...)` body with one that uses the new combobox + free-text Enter:

```ts
test("search navigates to filtered items list", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("combobox", { name: /search items/i });
  await box.fill("rifle");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/items\?q=rifle/);
  await expect(page.locator('a[href="/items/sniper-rifle"]')).toBeVisible();
});
```

- [ ] **Step 2: Append new autocomplete + sort-removal tests**

Append to `tests/e2e/wiki.spec.ts`:

```ts
test("navbar search is hidden on home but present elsewhere", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Primary" });
  await page.goto("/");
  await expect(nav.getByRole("combobox")).toHaveCount(0);
  await page.goto("/items");
  await expect(nav.getByRole("combobox")).toBeVisible();
});

test("autocomplete suggests an item and navigates to its page", async ({ page }) => {
  await page.goto("/items");
  const box = page.getByRole("navigation", { name: "Primary" }).getByRole("combobox");
  await box.fill("Sniper Rifle Silencer");
  const option = page.getByRole("option", { name: "Sniper Rifle Silencer", exact: true });
  await option.click();
  await expect(page).toHaveURL(/\/items\/sniper-rifle-silencer/);
});

test("autocomplete category suggestion filters the list", async ({ page }) => {
  await page.goto("/items");
  const box = page.getByRole("navigation", { name: "Primary" }).getByRole("combobox");
  await box.fill("weapons");
  await page.getByRole("option", { name: "Weapons", exact: true }).click();
  await expect(page).toHaveURL(/\/items\?category=weapons/);
});

test("items filters no longer expose a Sort-by control", async ({ page }) => {
  await page.goto("/items");
  await expect(page.getByLabel("Sort by")).toHaveCount(0);
});
```

- [ ] **Step 3: Run the full verification gate**

Run each (PowerShell), all must pass:

```
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e
```

Expected: vitest green (incl. `search` + updated `item-filter`), no type errors, no lint errors, build succeeds, all Playwright tests pass including axe in **both** themes and the new search tests.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/wiki.spec.ts
git commit -m "test: e2e for navbar search autocomplete and sort removal"
```

---

## Self-Review notes

- **Spec coverage:** navbar search (Tasks 4–5), name/tag autocomplete (Tasks 2–4), home rule + hero search (Tasks 4, 6), hover/focus-within menus (Task 5), Sort-by removal (Task 1), tests (Tasks 1, 2, 7). All spec sections map to a task.
- **Type consistency:** `IndexItem`/`Suggestions` defined in `search.ts` (Task 2) and imported unchanged by `SearchBox` (Task 4). `searchSuggestions` signature is identical in both. `categoryColor` (taxonomy) used by `SearchBox` and `MainNav`.
- **a11y:** combobox uses `role="combobox"` + `aria-expanded`/`aria-controls`/`aria-activedescendant`; options use `role="option"` + `aria-selected`; the color dot and the "filter"/"page" hint are `aria-hidden`; section menus open on `group-focus-within` (keyboard) as well as hover. axe is asserted in both themes by the existing sweep.
- **No DB for unit work:** Tasks 1–6 verify via vitest/tsc/lint/build (no DB). Only Task 7's `test:e2e` needs the DB (configured in `.env`).
```
