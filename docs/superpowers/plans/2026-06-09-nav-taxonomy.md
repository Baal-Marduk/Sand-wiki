# Navigation Taxonomy + Item Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded nav and free-text `Item.type` with a two-level taxonomy (Sections → Categories) driven by a single static config, where only the Items section is data-backed and the rest are scaffolded.

**Architecture:** A `src/lib/taxonomy.ts` config is the single source of truth for both the menu and the set of valid item categories. `Item.type` becomes a validated `category` string. A new `MainNav` renders the menu; the items list filters by category; Environment/Tramplers get "coming soon" placeholder pages; Tools gets a calculators page.

**Tech Stack:** Next.js 16 (App Router, TS), Prisma 6 + PostgreSQL, Tailwind, Vitest, Playwright/axe. Work in the worktree app dir `D:\Documents\SandLabs\.claude\worktrees\sand-wiki\sand-wiki` on branch `build/sand-wiki-impl`.

---

## Environment notes (Windows)

- Use the **PowerShell** tool for shell commands; prefix EVERY command with:
  ```powershell
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  ```
  then `Set-Location "D:\Documents\SandLabs\.claude\worktrees\sand-wiki\sand-wiki"`.
- A hot-reloading `npm run dev` server may be running on port 3000 — that's fine. Do not start another. Use `npm run build` / `npm run test` to verify (the e2e webServer starts its own instance).
- Git: commit from inside the app dir (lands on `build/sand-wiki-impl`). Never `git checkout`/`switch`/`worktree`; never `git add -A`. Stage only the listed files. `.env` is gitignored — never stage it. Commit author: `git -c user.name="Leo Wattier" -c user.email="leo.wattier@datakiss.co" commit -m "…"` with trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
src/lib/taxonomy.ts           # NEW: single source of truth (sections, categories, helpers)
src/lib/taxonomy.test.ts      # NEW: taxonomy invariants
src/lib/item-filter.ts        # MOD: type -> category
src/lib/item-filter.test.ts   # MOD: type -> category
src/lib/queries.ts            # MOD: remove listItemTypes
prisma/schema.prisma          # MOD: Item.type -> Item.category (+ index)
prisma/migrations/...         # NEW: rename migration
prisma/sample-data.json       # MOD: type -> category (remapped values)
prisma/seed.ts                # MOD: category + validation against taxonomy
src/components/MainNav.tsx    # NEW: taxonomy-driven nav (accessible <details> menus)
src/app/layout.tsx            # MOD: use MainNav
src/components/ItemFilters.tsx# MOD: Type select -> Category select (from taxonomy)
src/app/items/page.tsx        # MOD: ?category= instead of ?type=; categories from taxonomy
src/components/ItemCard.tsx   # MOD: display category label
src/app/items/[slug]/page.tsx # MOD: display category label
src/components/SectionPlaceholder.tsx  # NEW: shared "coming soon" component
src/app/environment/page.tsx  # NEW: placeholder
src/app/tramplers/page.tsx    # NEW: placeholder
src/app/tools/page.tsx        # NEW: calculators index
tests/e2e/wiki.spec.ts        # MOD: nav + category + placeholder coverage
```

---

## Task 1: Taxonomy config (TDD)

Pure data + helpers, no DB. Build it test-first.

**Files:**
- Create: `src/lib/taxonomy.ts`
- Test: `src/lib/taxonomy.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/taxonomy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SECTIONS, ITEM_CATEGORIES, ITEM_CATEGORY_SLUGS,
  isItemCategory, categoryLabel, getSection,
} from "./taxonomy";

describe("taxonomy", () => {
  it("exposes the five top-level sections in order", () => {
    expect(SECTIONS.map((s) => s.slug)).toEqual([
      "items", "environment", "tramplers", "tech", "tools",
    ]);
  });

  it("has unique section slugs", () => {
    expect(new Set(SECTIONS.map((s) => s.slug)).size).toBe(SECTIONS.length);
  });

  it("has unique category slugs within each section", () => {
    for (const s of SECTIONS) {
      const slugs = s.categories.map((c) => c.slug);
      expect(new Set(slugs).size, `duplicate in ${s.slug}`).toBe(slugs.length);
    }
  });

  it("defines the eight item categories", () => {
    expect(ITEM_CATEGORY_SLUGS).toEqual([
      "weapons", "guns", "resources", "attire", "tools", "medical", "ammo", "misc",
    ]);
    expect(ITEM_CATEGORIES.every((c) => c.label.length > 0)).toBe(true);
  });

  it("validates item categories", () => {
    expect(isItemCategory("weapons")).toBe(true);
    expect(isItemCategory("npcs")).toBe(false);
    expect(isItemCategory("nope")).toBe(false);
  });

  it("maps a category slug to its label, falling back to the slug", () => {
    expect(categoryLabel("weapons")).toBe("Weapons");
    expect(categoryLabel("unknown")).toBe("unknown");
  });

  it("looks up a section by slug", () => {
    expect(getSection("environment")?.label).toBe("Environment");
    expect(getSection("missing")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — cannot import from `./taxonomy`.

- [ ] **Step 3: Implement `src/lib/taxonomy.ts`**

```ts
export type SectionKind = "data" | "placeholder" | "link" | "tools";

export interface Category {
  slug: string;
  label: string;
}

export interface Section {
  slug: string;
  label: string;
  kind: SectionKind;
  href?: string;
  categories: Category[];
}

const itemCategories: Category[] = [
  { slug: "weapons", label: "Weapons" },
  { slug: "guns", label: "Guns" },
  { slug: "resources", label: "Resources" },
  { slug: "attire", label: "Attire" },
  { slug: "tools", label: "Tools" },
  { slug: "medical", label: "Medical" },
  { slug: "ammo", label: "Ammo" },
  { slug: "misc", label: "Misc" },
];

export const SECTIONS: Section[] = [
  { slug: "items", label: "Items", kind: "data", categories: itemCategories },
  {
    slug: "environment",
    label: "Environment",
    kind: "placeholder",
    categories: [
      { slug: "loot-containers", label: "Loot Containers" },
      { slug: "npcs", label: "NPCs" },
      { slug: "outposts", label: "Outposts" },
      { slug: "game-modes", label: "Game Modes" },
    ],
  },
  { slug: "tramplers", label: "Tramplers", kind: "placeholder", categories: [] },
  { slug: "tech", label: "Tech Tree", kind: "link", href: "/tech", categories: [] },
  { slug: "tools", label: "Tools", kind: "tools", href: "/tools", categories: [] },
];

export const ITEM_CATEGORIES = itemCategories;
export const ITEM_CATEGORY_SLUGS = itemCategories.map((c) => c.slug);

export function isItemCategory(slug: string): boolean {
  return ITEM_CATEGORY_SLUGS.includes(slug);
}

export function categoryLabel(slug: string): string {
  return itemCategories.find((c) => c.slug === slug)?.label ?? slug;
}

export function getSection(slug: string): Section | undefined {
  return SECTIONS.find((s) => s.slug === slug);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (taxonomy + existing tech-tree/item-filter tests).

- [ ] **Step 5: Commit**

```
git add src/lib/taxonomy.ts src/lib/taxonomy.test.ts
git commit -m "feat: add navigation taxonomy config with tests"
```

---

## Task 2: Rename `Item.type` → `Item.category` (schema + all consumers)

This is one atomic change: dropping `type` and adding `category` regenerates the Prisma client, so every TypeScript reference to `type` must change together to keep the build green. Do all steps before verifying.

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/sample-data.json`, `prisma/seed.ts`
- Modify: `src/lib/item-filter.ts`, `src/lib/item-filter.test.ts`, `src/lib/queries.ts`
- Modify: `src/app/items/page.tsx`, `src/components/ItemFilters.tsx`, `src/components/ItemCard.tsx`, `src/app/items/[slug]/page.tsx`
- New: a Prisma migration (generated)

- [ ] **Step 1: Update `prisma/schema.prisma`** — in `model Item`, replace the `type` field and its index:

Change:
```prisma
  type             String
```
to:
```prisma
  category         String
```
and change the index:
```prisma
  @@index([type])
```
to:
```prisma
  @@index([category])
```
(Leave every other field, including `isResource`, unchanged.)

- [ ] **Step 2: Remap `prisma/sample-data.json`** — rename each item's `"type"` key to `"category"` with a valid value. Replace the `"items"` array with:

```json
  "items": [
    { "slug": "iron-ore", "name": "Iron Ore", "category": "resources", "isResource": true, "imageAlt": "A chunk of iron ore" },
    { "slug": "fuel", "name": "Fuel", "category": "resources", "isResource": true, "imageAlt": "A canister of fuel" },
    { "slug": "iron-plate", "name": "Iron Plate", "category": "misc", "workbenchLevel": 1, "craftTimeSeconds": 10,
      "recipe": [{ "ingredient": "iron-ore", "quantity": 2 }], "imageAlt": "A flat iron plate" },
    { "slug": "scrap-rifle", "name": "Scrap Rifle", "category": "weapons", "workbenchLevel": 2, "craftTimeSeconds": 30,
      "unlockConditions": "Requires Basic Weapons tech", "unlockedBy": "basic-weapons",
      "recipe": [{ "ingredient": "iron-plate", "quantity": 3 }, { "ingredient": "fuel", "quantity": 1 }],
      "imageAlt": "A makeshift rifle built from scrap" }
  ],
```
(`iron-plate` has no matching category in the canonical 8, so it maps to `misc`.)

- [ ] **Step 3: Update `prisma/seed.ts`** — three edits:

(a) Add the taxonomy import at the top (after the existing imports):
```ts
import { isItemCategory } from "../src/lib/taxonomy";
```
(b) In `interface SeedItem`, change `type: string;` to `category: string;`.
(c) In the item-creation loop, replace the `data: { … }` for `prisma.item.create` so it uses `category` and validates it. Change:
```ts
      data: {
        slug: i.slug, name: i.name, type: i.type, isResource: i.isResource ?? false,
```
to:
```ts
      data: {
        slug: i.slug, name: i.name, category: i.category, isResource: i.isResource ?? false,
```
and immediately before that `prisma.item.create(` call, add a guard inside the loop:
```ts
    if (!isItemCategory(i.category)) {
      throw new Error(`Unknown item category "${i.category}" for ${i.slug}`);
    }
```

- [ ] **Step 4: Update `src/lib/item-filter.ts`** — rename the field. Change `type?: string;` to `category?: string;` in `ItemFilter`, and change:
```ts
  if (filter.type) {
    where.type = filter.type;
  }
```
to:
```ts
  if (filter.category) {
    where.category = filter.category;
  }
```

- [ ] **Step 5: Update `src/lib/item-filter.test.ts`** — replace the two tests that use `type`:

The "filters by type and workbench level" test becomes:
```ts
  it("filters by category and workbench level", () => {
    const q = buildItemQuery({ category: "weapons", workbenchLevel: 2 });
    expect(q.where).toEqual({ category: "weapons", workbenchLevel: 2 });
  });
```
The "combines multiple filters" test becomes:
```ts
  it("combines multiple filters", () => {
    const q = buildItemQuery({ query: "axe", category: "tools" });
    expect(q.where).toEqual({
      name: { contains: "axe", mode: "insensitive" },
      category: "tools",
    });
  });
```

- [ ] **Step 6: Update `src/lib/queries.ts`** — delete the `listItemTypes` function entirely (categories now come from the taxonomy). Remove lines:
```ts
export async function listItemTypes() {
  const rows = await prisma.item.findMany({
    distinct: ["type"], select: { type: true }, orderBy: { type: "asc" },
  });
  return rows.map((r) => r.type);
}
```

- [ ] **Step 7: Update `src/components/ItemFilters.tsx`** — replace the whole file (Type select → Category select fed from props):

```tsx
import type { Category } from "@/lib/taxonomy";

export interface FilterOptions {
  categories: Category[];
  resources: { id: string; name: string }[];
  current: { q?: string; category?: string; workbench?: string; resource?: string; sort?: string };
}

export function ItemFilters({ categories, resources, current }: FilterOptions) {
  return (
    <form action="/items" method="get" className="grid gap-3 sm:grid-cols-6 items-end mb-6">
      <div className="sm:col-span-2">
        <label htmlFor="q" className="block text-sm">Name</label>
        <input id="q" name="q" type="search" defaultValue={current.q ?? ""}
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1" />
      </div>
      <div>
        <label htmlFor="category" className="block text-sm">Category</label>
        <select id="category" name="category" defaultValue={current.category ?? ""}
          className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1">
          <option value="">All</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
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
```

- [ ] **Step 8: Update `src/app/items/page.tsx`** — replace the whole file (reads `?category=`, gets categories from taxonomy, drops `listItemTypes`):

```tsx
import { listItems, listResources } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { ItemFilters } from "@/components/ItemFilters";
import { ITEM_CATEGORIES } from "@/lib/taxonomy";
import type { ItemFilter } from "@/lib/item-filter";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = str(sp.q);
  const category = str(sp.category);
  const resource = str(sp.resource);
  const workbench = str(sp.workbench);
  const sortParam = str(sp.sort);
  const sort: ItemFilter["sort"] = sortParam === "workbench" ? "workbench" : "name";

  const workbenchLevel =
    workbench && Number.isInteger(Number(workbench)) ? Number(workbench) : undefined;

  const filter: ItemFilter = {
    query: q || undefined,
    category: category || undefined,
    workbenchLevel,
    requiredResourceId: resource || undefined,
    sort,
  };

  const [items, resources] = await Promise.all([listItems(filter), listResources()]);

  return (
    <section className="py-6">
      <h1 className="text-2xl font-bold mb-4">Items</h1>
      <ItemFilters
        categories={ITEM_CATEGORIES}
        resources={resources.map((r) => ({ id: r.id, name: r.name }))}
        current={{ q, category, workbench, resource, sort }}
      />
      <p className="text-sm text-neutral-400 mb-2" aria-live="polite">{items.length} result(s)</p>
      {items.length === 0 ? (
        <p>No items match your filters.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => <ItemCard key={i.id} item={i} />)}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 9: Update `src/components/ItemCard.tsx`** — replace the whole file (show category label):

```tsx
import Link from "next/link";
import { categoryLabel } from "@/lib/taxonomy";

export interface ItemCardData {
  slug: string; name: string; category: string; workbenchLevel: number | null;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="rounded border border-neutral-800 p-4 hover:border-amber-600">
      <Link href={`/items/${item.slug}`} className="block">
        <span className="font-medium">{item.name}</span>
        <span className="block text-sm text-neutral-400">
          {categoryLabel(item.category)}
          {item.workbenchLevel !== null ? ` · Workbench ${item.workbenchLevel}` : ""}
        </span>
      </Link>
    </li>
  );
}
```

- [ ] **Step 10: Update `src/app/items/[slug]/page.tsx`** — change the category display line. Add the import and update the `<p>`:

Add after the existing imports:
```tsx
import { categoryLabel } from "@/lib/taxonomy";
```
Change:
```tsx
        <p className="text-neutral-400">{item.type}</p>
```
to:
```tsx
        <p className="text-neutral-400">{categoryLabel(item.category)}</p>
```

- [ ] **Step 11: Create the migration (do not apply yet)**

Run: `npx prisma migrate dev --name item_category --create-only`
Expected: a new `prisma/migrations/<timestamp>_item_category/migration.sql` is generated (drops `type`, adds `category`, swaps the index). It is **not** applied — applying directly would fail because `category` is a required column and the `Item` table already has rows.

- [ ] **Step 12: Apply by resetting the dev database, then re-seed**

The sample data is disposable, so reset replays all migrations on an empty database (the new required column is added to an empty `Item` table, which succeeds), and regenerates the client.

Run: `npx prisma migrate reset --force`
Expected: database reset; all migrations applied cleanly; "Generated Prisma Client". (`.env` already has the real `DATABASE_URL`.)

Run: `npm run db:seed`
Expected: "Seeded 4 items and 2 tech nodes." (and no "Unknown item category" error).

- [ ] **Step 13: Verify the whole rename compiles and tests pass**

Run: `npm run test`
Expected: all unit tests pass (taxonomy + tech-tree + item-filter with category).
Run: `npx tsc --noEmit`
Expected: no type errors (proves no lingering `.type` references).
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 14: Commit**

```
git add prisma/schema.prisma prisma/migrations prisma/sample-data.json prisma/seed.ts src/lib/item-filter.ts src/lib/item-filter.test.ts src/lib/queries.ts src/app/items/page.tsx src/components/ItemFilters.tsx src/components/ItemCard.tsx "src/app/items/[slug]/page.tsx"
git commit -m "feat: replace Item.type with validated category (taxonomy-backed)"
```

---

## Task 3: Taxonomy-driven main navigation

Accessible menu using native `<details>`/`<summary>` (keyboard-operable, no client JS). Items shows a category dropdown; Environment/Tramplers/Tech/Tools are top-level links to their pages.

**Files:**
- Create: `src/components/MainNav.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create `src/components/MainNav.tsx`**

```tsx
import Link from "next/link";
import { SECTIONS } from "@/lib/taxonomy";

export function MainNav() {
  return (
    <nav aria-label="Primary" className="max-w-5xl mx-auto flex flex-wrap gap-4 items-center p-4">
      <Link href="/" className="font-bold">SAND Wiki</Link>

      {SECTIONS.map((section) => {
        // Data section (Items): dropdown of category links.
        if (section.kind === "data" && section.categories.length > 0) {
          return (
            <details key={section.slug} className="relative">
              <summary className="cursor-pointer list-none underline-offset-4 hover:underline">
                {section.label}
              </summary>
              <ul className="absolute z-10 mt-2 min-w-44 rounded border border-neutral-700 bg-neutral-900 p-2 space-y-1">
                <li>
                  <Link href={`/${section.slug}`} className="block px-2 py-1 rounded hover:bg-neutral-800">
                    All {section.label}
                  </Link>
                </li>
                {section.categories.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/${section.slug}?category=${c.slug}`}
                      className="block px-2 py-1 rounded hover:bg-neutral-800"
                    >
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          );
        }
        // Link / tools / placeholder sections: a single top-level link to their page.
        const href = section.href ?? `/${section.slug}`;
        return (
          <Link key={section.slug} href={href} className="underline-offset-4 hover:underline">
            {section.label}
          </Link>
        );
      })}

      <Link href="/about" className="underline-offset-4 hover:underline ml-auto">About</Link>
    </nav>
  );
}
```

- [ ] **Step 2: Update `src/app/layout.tsx`** — use `MainNav`. Replace the import block and the `<header>`:

Change the imports to:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { MainNav } from "@/components/MainNav";
import "./globals.css";
```
Replace the entire `<header>…</header>` with:
```tsx
        <header className="border-b border-neutral-800">
          <MainNav />
        </header>
```
(Leave `<main>` and `<footer>` unchanged; `Link` is still used by the footer.)

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds. Run `npm run test` → still green.

- [ ] **Step 4: Commit**

```
git add src/components/MainNav.tsx src/app/layout.tsx
git commit -m "feat: taxonomy-driven main navigation"
```

---

## Task 4: Placeholder section pages (Environment, Tramplers)

**Files:**
- Create: `src/components/SectionPlaceholder.tsx`
- Create: `src/app/environment/page.tsx`
- Create: `src/app/tramplers/page.tsx`

- [ ] **Step 1: Create `src/components/SectionPlaceholder.tsx`**

```tsx
import { getSection } from "@/lib/taxonomy";
import { notFound } from "next/navigation";

export function SectionPlaceholder({ sectionSlug }: { sectionSlug: string }) {
  const section = getSection(sectionSlug);
  if (!section) notFound();

  return (
    <section className="py-8 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">{section.label}</h1>
      <p className="rounded border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-amber-200">
        Coming soon — this section isn&apos;t available yet.
      </p>
      {section.categories.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Planned categories</h2>
          <ul className="list-disc list-inside text-neutral-300">
            {section.categories.map((c) => <li key={c.slug}>{c.label}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Create `src/app/environment/page.tsx`**

```tsx
import { SectionPlaceholder } from "@/components/SectionPlaceholder";

export default function EnvironmentPage() {
  return <SectionPlaceholder sectionSlug="environment" />;
}
```

- [ ] **Step 3: Create `src/app/tramplers/page.tsx`**

```tsx
import { SectionPlaceholder } from "@/components/SectionPlaceholder";

export default function TramplersPage() {
  return <SectionPlaceholder sectionSlug="tramplers" />;
}
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: succeeds; `/environment` and `/tramplers` appear as routes.

- [ ] **Step 5: Commit**

```
git add src/components/SectionPlaceholder.tsx src/app/environment/page.tsx src/app/tramplers/page.tsx
git commit -m "feat: coming-soon placeholder pages for Environment and Tramplers"
```

---

## Task 5: Tools (calculators) page

**Files:**
- Create: `src/app/tools/page.tsx`

- [ ] **Step 1: Create `src/app/tools/page.tsx`**

```tsx
import Link from "next/link";

export default function ToolsPage() {
  return (
    <section className="py-8 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Tools</h1>
      <p className="text-neutral-300">Calculators and utilities for planning your runs.</p>
      <ul className="space-y-2">
        <li className="rounded border border-neutral-800 p-4 hover:border-amber-600">
          <Link href="/tech" className="block">
            <span className="font-medium">Tech-tree cost calculator</span>
            <span className="block text-sm text-neutral-400">
              Total resources needed to unlock any technology.
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: succeeds; `/tools` present.

- [ ] **Step 3: Commit**

```
git add src/app/tools/page.tsx
git commit -m "feat: tools page listing site calculators"
```

---

## Task 6: e2e coverage + final verification

**Files:**
- Modify: `tests/e2e/wiki.spec.ts`

- [ ] **Step 1: Replace `tests/e2e/wiki.spec.ts`** with the updated suite (adds nav, category, and placeholder coverage; keeps existing flows):

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = ["/", "/items", "/items/scrap-rifle", "/tech", "/about", "/environment", "/tramplers", "/tools"];

for (const path of pages) {
  test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}

test("search navigates to filtered items list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: /search items/i }).fill("rifle");
  await page.getByRole("button", { name: /search/i }).click();
  await expect(page).toHaveURL(/\/items\?q=rifle/);
  await expect(page.getByRole("link", { name: "Scrap Rifle" })).toBeVisible();
});

test("category filter narrows the items list", async ({ page }) => {
  await page.goto("/items?category=weapons");
  await expect(page.getByRole("link", { name: "Scrap Rifle" })).toBeVisible();
  // iron-ore is a resource, not a weapon — must not appear
  await expect(page.getByRole("link", { name: "Iron Ore" })).toHaveCount(0);
});

test("nav exposes the Items category menu", async ({ page }) => {
  await page.goto("/");
  // The Items <summary> opens a menu containing category links.
  await page.getByText("Items", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Weapons" })).toBeVisible();
});

test("environment section shows a coming-soon placeholder", async ({ page }) => {
  await page.goto("/environment");
  await expect(page.getByRole("heading", { name: "Environment" })).toBeVisible();
  await expect(page.getByText(/coming soon/i)).toBeVisible();
  await expect(page.getByText("Loot Containers")).toBeVisible();
});

test("tech calculator computes total unlock cost", async ({ page }) => {
  await page.goto("/tech");
  await page.getByLabel(/unlock technology/i).selectOption({ label: "Basic Weapons" });
  await page.getByRole("button", { name: /calculate/i }).click();
  await expect(page.getByText(/30 × Iron Ore/i)).toBeVisible();
  await expect(page.getByText(/5 × Fuel/i)).toBeVisible();
});
```

- [ ] **Step 2: Ensure DB is seeded** (from Task 2 it already is; re-run if unsure)

Run: `npm run db:seed`
Expected: "Seeded 4 items and 2 tech nodes."

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e`
Expected: all tests pass (8 a11y + search + category + nav + placeholder + calculator).

- [ ] **Step 4: Full verification gate**

Run: `npm run test` → unit tests pass.
Run: `npx tsc --noEmit` → no type errors.
Run: `npm run lint` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```
git add tests/e2e/wiki.spec.ts
git commit -m "test: cover nav, category filter, and placeholder pages"
```

---

## Coverage map (spec → task)

| Spec section | Task |
|--------------|------|
| §3 taxonomy.ts source of truth | 1 |
| §4 Item.type → validated category + migration + sample remap | 2 |
| §5 item-filter/queries changes | 2 |
| §6 MainNav + layout | 3 |
| §6 items category filter | 2 (filter UI) |
| §6 placeholder pages | 4 |
| §6 Tools page | 5 |
| §6 Tech Tree link | 3 (nav) |
| §7 accessibility (native `<details>`, contrast) | 3, 6 |
| §8 testing | 1, 2, 6 |

## Deviations from the spec

- **Placeholder sections appear as a single top-level nav link** to their coming-soon page (which lists the planned categories), rather than a nav dropdown of category links that all point to the same page. Cleaner UX; same information. Only the data-backed **Items** section gets a category dropdown in the nav.
- The Items dropdown includes an **"All Items"** link (to `/items`) in addition to the per-category links.
