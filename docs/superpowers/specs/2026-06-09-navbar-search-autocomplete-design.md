# Navbar Search + Autocomplete (and nav/filter tweaks)

**Date:** 2026-06-09
**App:** `sand-wiki/` (Next.js 16 + Prisma 6 + DaisyUI 5)
**Status:** Approved (brainstorm), pending implementation plan

## Goal

Four related UI changes, refined via visual brainstorming:

1. Section dropdown menus in the main navbar open on hover and **close when un-hovered** (currently `<details>`, click-toggle, stays open).
2. Add a **search bar in the main navbar**.
3. **Remove "Sort by"** from the items list.
4. Add **autocompletion (item names + category tags)** to the search bars.

This is presentation-layer + one small read-only API route. No DB schema or data changes.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Autocomplete suggestion behavior | Item-name match → that item's page (`/items/<slug>`). Category-tag match → filtered list (`/items?category=<slug>`). |
| Home vs navbar search | The **navbar** search is hidden on the homepage (`/`); the existing **hero** search stays there. On every other page the navbar search shows. Both bars get autocomplete. |
| Dropdown open mechanism | Hover-open + keyboard-focus + click/tap accessible; closes on mouse-leave/blur. Must keep axe green (no hover-only). |
| Search scope | Autocomplete applies to the two navigational search bars (navbar + hero) via one shared component. The items-page filter `q` input stays a plain filter field. |
| Matching | Case-insensitive substring (`contains`) over 123 items + 8 category labels. No fuzzy-search library (YAGNI). |

## Architecture

A single client `SearchBox` component powers both search bars. It loads a small JSON
**search index** (all item `{slug, name, category}`) once from a new cached route handler,
and filters client-side via a pure `searchSuggestions()` helper. Selecting a suggestion
navigates with the Next router. The navbar's section menus switch from `<details>` to a
CSS hover/focus-within dropdown (keeps `MainNav` a server component).

## Components / files

### Create

**`src/app/api/search-index/route.ts`** — GET route handler returning the index:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
123-row payload; `max-age` avoids refetching across navigations.

**`src/lib/search.ts`** — pure matching logic (unit-tested):
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

**`src/components/SearchBox.tsx`** — client component (`"use client"`):
- Props: `{ variant: "navbar" | "hero" }`.
- Module-level cached promise for the index so multiple instances fetch once; fetch is
  triggered on first focus (not at import) to keep it lazy.
- State: `query`, `open`, `activeIndex` (across the flattened suggestion list).
- Renders an `<input>` styled per variant (compact rounded pill for navbar; larger join-style
  for hero) plus a popover listbox grouped **Categories** then **Items**, each row showing the
  category color dot (reuse the dot markup / `categoryColor`).
- **ARIA combobox:** input has `role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-autocomplete="list"`; listbox has `role="listbox"`; each option `role="option"` with a
  stable `id`; `aria-activedescendant` points at the highlighted option.
- **Keyboard:** ↑/↓ move `activeIndex`, Enter navigates the active suggestion (or, if none
  active, submits free-text → `/items?q=<query>`), Esc closes, blur (outside click) closes.
- **Navigation** via `useRouter().push`: category → `/items?category=<slug>`; item →
  `/items/<slug>`; free-text → `/items?q=<encoded query>`.
- **Home rule:** `usePathname()` — when `variant === "navbar"` and pathname is `"/"`, render
  `null`.

### Modify

**`src/components/MainNav.tsx`**
- Add `<SearchBox variant="navbar" />` in the right-hand group, before the About link.
- Replace each section `<details>/<summary>` with a hover/focus-within dropdown. Structure:
  an `li.group.relative` containing a focusable `<button>` (the section label) and an
  absolutely-positioned `<ul>` submenu shown via CSS `group-hover:` and `group-focus-within:`
  (e.g. submenu has `invisible opacity-0 … group-hover:visible group-hover:opacity-100
  group-focus-within:visible group-focus-within:opacity-100`). Closes on mouse-leave (hover
  ends) and on blur (focus leaves). Category rows include the color dot. `MainNav` stays a
  server component (no client JS needed for the menu).

**`src/components/ItemFilters.tsx`**
- Remove the entire "Sort by" `<div>` (`label` + `<select name="sort">`). Leave Name, Category,
  Tier, and Apply. Adjust the grid column count if needed so the remaining controls lay out
  cleanly.

**`src/lib/item-filter.ts`**
- Remove `sort` from `ItemFilter`; `buildItemQuery` always returns `orderBy: { name: "asc" }`.

**`src/lib/item-filter.test.ts`**
- Remove/adjust assertions referencing `sort`/`workbench` ordering; keep coverage of
  query/category/tier and the default name ordering.

**`src/app/items/page.tsx`**
- Stop reading/forwarding the `sort` search param; drop the `sort` field from the `ItemFilter`
  it builds.

**`src/app/page.tsx`**
- Replace the hero `<form action="/items">` search block with `<SearchBox variant="hero" />`.
  Keep the surrounding hero copy and the category dot chips.

## Data flow

1. `SearchBox` mounts (navbar on all non-home pages; hero on home). On first focus it awaits the
   shared index fetch from `/api/search-index`.
2. On each keystroke it calls `searchSuggestions(query, index)` and renders grouped options.
3. Selecting (click/Enter) routes via `useRouter().push` per the behavior table.

## Error handling

- Index fetch failure: `SearchBox` falls back to free-text-only (Enter → `/items?q=…`); no
  suggestions shown, no crash. (Log to console; do not surface a blocking error.)
- Empty/whitespace query: closed popover, no suggestions.

## Testing

- **Unit (vitest):** `searchSuggestions` — name match, category-label match, both, the
  `ITEM_CAP` limit, empty/whitespace query returns empty. Update `item-filter.test.ts` for the
  removed `sort`.
- **e2e (Playwright + axe):**
  - Navbar search is **not** present on `/` but **is** present on `/items`.
  - Typing a query on `/items` surfaces a suggestion listbox; selecting an item navigates to its
    page; selecting a category navigates to the filtered list.
  - The "Sort by" control is gone from `/items`.
  - Section menu category links remain reachable (e.g. via keyboard focus opening the menu).
  - **axe passes in both `desertnight` and `desertday`** (combobox roles correct, nav contrast AA).
- **Full gate:** `vitest`, `tsc --noEmit`, `eslint`, `next build`, `test:e2e`.

## Out of scope

- The items-page `q` filter input (stays a plain server-filtered field).
- Fuzzy/typo-tolerant search, search ranking beyond substring + cap.
- Searching anything other than items (no recipes/sections in autocomplete).

## Risks / notes

- **Combobox a11y is the main risk** — get the ARIA wiring right or axe/manual keyboard use
  regresses. Follow the WAI-ARIA combobox-with-listbox pattern.
- Hover/focus-within CSS menu: verify on touch (tap focuses the button → opens; tap-away blurs →
  closes) and that mouse-leave actually closes it.
- The route handler needs `DATABASE_URL` at runtime (already required for the app).
