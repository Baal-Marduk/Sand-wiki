# Navigation Taxonomy + Item Categories — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design); pending written-spec review
**Builds on:** the read-only SAND wiki (`docs/superpowers/specs/2026-06-08-sand-wiki-design.md`)
**Branch:** `build/sand-wiki-impl`

## 1. Goal

Restructure the site navigation into a two-level taxonomy (Sections → Categories) and give
items a real category field, replacing the current hard-coded nav and free-text `Item.type`.

This is a **navigation-only** change: only the **Items** section is backed by real data. The
other sections are scaffolded (placeholder or link) so the menu is complete, with their real
data models to be designed later as separate projects.

## 2. Scope decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Content modeling | Navigation-only now. Only Items has data; other sections are placeholders/links. |
| Top-level "Tools" | Site **calculators** (NOT in-game tool items). In-game tools live under Items → tools. |
| Tramplers | Placeholder section, **no children** yet. |
| Taxonomy storage | **Static config in code** (`taxonomy.ts`) — single source of truth. Not a DB table. |
| Item category | A **validated string** constrained to the Items categories, checked in the seed. Not a DB enum. |
| `isResource` | Kept as-is (crafting/cost semantics, orthogonal to display category). |
| Category routing | Reuse the items list via `/items?category=<slug>` (no dedicated `/items/<cat>` routes). |

### Out of scope (future, separate specs)
Real data models and pages for Environment (loot containers, NPCs, outposts, game modes),
Tramplers, and any additional Tools calculators beyond the existing cost calculator.

## 3. The taxonomy (`src/lib/taxonomy.ts`)

A single exported config is the source of truth for the menu **and** the set of valid item
categories.

```ts
export type SectionKind = "data" | "placeholder" | "link" | "tools";

export interface Category {
  slug: string;   // url-safe, e.g. "loot-containers"
  label: string;  // display, e.g. "Loot Containers"
}

export interface Section {
  slug: string;
  label: string;
  kind: SectionKind;
  href?: string;        // for kind "link"
  categories: Category[];
}

export const SECTIONS: Section[] = [ /* see below */ ];
```

Sections:

| Section | slug | kind | href | Categories |
|---------|------|------|------|------------|
| Items | `items` | `data` | — | weapons, guns, resources, attire, tools, medical, ammo, misc |
| Environment | `environment` | `placeholder` | — | loot-containers, npcs, outposts, game-modes |
| Tramplers | `tramplers` | `placeholder` | — | (none) |
| Tech Tree | `tech` | `link` | `/tech` | (none) |
| Tools | `tools` | `tools` | `/tools` | (none — page lists calculators) |

Item categories (the `data` section's `categories`) are the canonical list:
`weapons, guns, resources, attire, tools, medical, ammo, misc`.

Helper exports: `ITEM_CATEGORY_SLUGS: string[]` and `isItemCategory(slug): boolean` for seed
validation and filter building.

## 4. Data model change

`prisma/schema.prisma` — `Item`:
- **Remove** `type String`.
- **Add** `category String` (indexed). Allowed values are enforced at the **seed** layer against
  `ITEM_CATEGORY_SLUGS` (the only write path in phase 1); the seed throws on an unknown category.
- Keep all other fields, including `isResource`.

Migration: a Prisma migration that drops `type` and adds `category` (with the `@@index`). The
sample dataset is remapped: `weapon → weapons`, `resource → resources`, and the `component`
item (`iron-plate`) → `misc` (no "component" category exists in the canonical list).

`sample-data.json`: each item's `"type"` key becomes `"category"` with a valid value.

## 5. Query/logic changes

- `src/lib/item-filter.ts`: `ItemFilter.type` → `ItemFilter.category`; `buildItemQuery` filters
  on `category` instead of `type`. (Unit test updated accordingly.)
- `src/lib/queries.ts`: `listItemTypes()` is **removed** (categories now come from the static
  taxonomy, not a DB `distinct` query). `listItems` unchanged except the filter field rename.

## 6. UI changes

- **`src/components/MainNav.tsx`** (new): renders `SECTIONS` as a top nav. Sections with
  categories expose them via an accessible disclosure (keyboard-operable `<button aria-expanded>`
  + a list of links; no hover-only menus). `data` categories link to `/items?category=<slug>`;
  `placeholder` categories link to the section's placeholder page; `link`/`tools` sections link
  to their `href`. `layout.tsx` uses `MainNav` instead of the inline `<nav>`.
- **Items list** (`/items`): the "Type" filter becomes a **Category** select populated from the
  taxonomy's item categories (not from the DB). Reads `?category=` (replacing `?type=`).
- **Placeholder page** (`src/app/(placeholder)` or a shared component): `/environment` and
  `/tramplers` render the section label + a "Coming soon" notice and, if the section has
  categories, lists them as plain text (not links to data). Implemented as static routes
  `src/app/environment/page.tsx` and `src/app/tramplers/page.tsx` using a shared
  `SectionPlaceholder` component.
- **Tools page** (`src/app/tools/page.tsx`, new): lists site calculators — currently a link to
  the tech-tree cost calculator on `/tech`. Room to add more later.
- **Tech Tree**: unchanged page; nav links to `/tech`.

## 7. Accessibility

- The nav dropdowns are keyboard-operable (button + `aria-expanded`, Escape to close, links
  focusable). No information conveyed by hover alone.
- Placeholder pages use a clear heading and a normal-contrast notice.
- axe checks in the e2e suite continue to pass (extended to cover the nav and a placeholder page).

## 8. Testing

- Update `item-filter.test.ts` for the `category` field.
- New `taxonomy.test.ts`: section slugs unique; category slugs unique within a section;
  `data` section has the 8 expected item categories; `isItemCategory` works.
- e2e (`wiki.spec.ts`): nav shows the five sections; opening the Items menu and choosing
  "Weapons" lands on `/items?category=weapons` filtered to weapons; `/environment` shows
  "Coming soon"; axe passes on `/` (with nav) and `/environment`.

## 9. Coverage map (requirement → change)

| Requirement | Where |
|-------------|-------|
| Menu: Items, Environment, Tramplers, Tech tree, Tools | `taxonomy.ts`, `MainNav` |
| Items children: weapons…misc | `taxonomy.ts`, `Item.category`, items filter |
| Environment children: loot containers, NPCs, outposts, game modes | `taxonomy.ts`, placeholder page |
| Tramplers (no children) | `taxonomy.ts`, placeholder page |
| Tech tree | nav link to existing `/tech` |
| Tools = calculators | `/tools` page |

## 10. Deviations / notes

- Items reached by category filter (`/items?category=…`), not per-category routes — reuses the
  existing list and keeps URLs shareable. Dedicated routes can be added later if desired.
- Category validity is enforced in the seed, not the database, to keep a single source of truth
  in `taxonomy.ts`.
