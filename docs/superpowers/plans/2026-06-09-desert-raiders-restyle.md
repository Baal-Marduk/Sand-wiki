# Desert Raiders Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire SAND wiki with a cohesive DaisyUI "Desert Raiders" theme (dark + light toggle, Oswald display headings), and correct the game name to "SAND: Raiders of Sophie".

**Architecture:** Add DaisyUI 5 to the existing Tailwind v4 setup; define two custom themes in `globals.css`; load Oswald via `next/font`; add a small client `ThemeToggle`; rewrite each page/component to use DaisyUI semantic classes (`navbar`, `hero`, `card`, `badge`, `table`, `btn`, form controls). Presentation-only — no routes, data, or query changes.

**Tech Stack:** Next.js 16 (App Router, TS), Tailwind v4, **DaisyUI 5**, `next/font` (Oswald), Vitest, Playwright/axe. Work in worktree `D:\Documents\SandLabs\.claude\worktrees\sand-wiki\sand-wiki` on branch `build/sand-wiki-impl`.

---

## Environment notes (Windows)

- Use the **PowerShell** tool; prefix EVERY command with:
  ```powershell
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  ```
  then `Set-Location "D:\Documents\SandLabs\.claude\worktrees\sand-wiki\sand-wiki"`.
- A dev server may be running on port 3000 (hot-reload). For e2e, Playwright starts its OWN server on 3000 (`npm run build && npm run start`) — if 3000 is occupied by the dev server, stop that process first (`Get-NetTCPConnection -LocalPort 3000 -State Listen`; `Stop-Process -Id <pid> -Force`).
- Git: commit from inside the app dir (branch `build/sand-wiki-impl`). Never `git checkout`/`switch`/`worktree`; never `git add -A` (stage listed files only). `.env` is gitignored. Commit author: `git -c user.name="Leo Wattier" -c user.email="leo.wattier@datakiss.co" commit -m "…"` + trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Preserve these (e2e + a11y depend on them)

When rewriting markup, KEEP these accessible names/texts intact:
- Home search input accessible name matches `/search items/i` (keep a `sr-only` `<label htmlFor="q">Search items by name</label>` or `aria-label`), and a submit button with visible text **Search**.
- Item names render as links (e.g. "Scrap Rifle").
- The primary nav has an **"Items"** opener whose exact text is `Items`, revealing a **"Weapons"** link (keep the `<details><summary>Items</summary>…</details>` pattern).
- Placeholder pages contain the text **"Coming soon"** and category labels like **"Loot Containers"**.
- Tech page: a control labelled `/unlock technology/i`, a button **Calculate**, and results rendered as `30 × Iron Ore` / `5 × Fuel` (U+00D7 `×`).
- Keep the tech graph wrapper `inert` with the `TechTreeTable` fallback.

---

## Task 1: DaisyUI + themes + Oswald font + layout shell

**Files:** Modify `package.json` (dep), `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Install DaisyUI**

Run: `npm install -D daisyui@latest`
Expected: daisyui added to devDependencies.

- [ ] **Step 2: Replace `src/app/globals.css`** with DaisyUI + the two custom themes + display font wiring:

```css
@import "tailwindcss";
@plugin "daisyui";

@plugin "daisyui/theme" {
  name: "desertnight";
  default: true;
  prefersdark: true;
  color-scheme: dark;
  --color-base-100: #171009;
  --color-base-200: #1f160d;
  --color-base-300: #2c2014;
  --color-base-content: #ece0cb;
  --color-primary: #e8893b;
  --color-primary-content: #1a120a;
  --color-secondary: #b5532a;
  --color-secondary-content: #fbe9d8;
  --color-accent: #c9a24b;
  --color-accent-content: #1a120a;
  --color-neutral: #2c2014;
  --color-neutral-content: #ece0cb;
  --color-info: #6aa9c9;
  --color-info-content: #08131a;
  --color-success: #7fb069;
  --color-success-content: #0c1607;
  --color-warning: #e0a341;
  --color-warning-content: #1a1304;
  --color-error: #d4654f;
  --color-error-content: #1a0805;
  --radius-box: 0.75rem;
  --radius-field: 0.5rem;
}

@plugin "daisyui/theme" {
  name: "desertday";
  color-scheme: light;
  --color-base-100: #efe6d6;
  --color-base-200: #e6dac6;
  --color-base-300: #d9c9ad;
  --color-base-content: #2a1d10;
  --color-primary: #c2671f;
  --color-primary-content: #fff7ec;
  --color-secondary: #9a4420;
  --color-secondary-content: #fff7ec;
  --color-accent: #8a6d2f;
  --color-accent-content: #fff7ec;
  --color-neutral: #2a1d10;
  --color-neutral-content: #efe6d6;
  --color-info: #2f6f8f;
  --color-info-content: #fff;
  --color-success: #4f7a3a;
  --color-success-content: #fff;
  --color-warning: #9a6a16;
  --color-warning-content: #fff;
  --color-error: #a83c28;
  --color-error-content: #fff;
  --radius-box: 0.75rem;
  --radius-field: 0.5rem;
}

@theme {
  --font-display: var(--font-oswald);
}
```

- [ ] **Step 3: Replace `src/app/layout.tsx`** — load Oswald, set default theme + anti-FOUC script, use DaisyUI base classes, fix the game name:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Oswald } from "next/font/google";
import { MainNav } from "@/components/MainNav";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-oswald", display: "swap" });

export const metadata: Metadata = {
  title: "Unofficial SAND Wiki",
  description: "A community, unofficial database for SAND: Raiders of Sophie.",
};

const themeInit = `(function(){try{var t=localStorage.getItem('sand-theme');if(t==='desertday'||t==='desertnight'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="desertnight" className={oswald.variable}>
      <body className="min-h-screen bg-base-100 text-base-content flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <header className="border-b border-base-300">
          <MainNav />
        </header>
        <main className="max-w-5xl mx-auto w-full p-4 flex-1">{children}</main>
        <footer className="footer footer-center border-t border-base-300 text-sm text-base-content/70 p-4">
          <p>
            Unofficial fan site. Not affiliated with or endorsed by tinyBuild.{" "}
            <Link href="/about" className="link">Learn more</Link>.
          </p>
        </footer>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: build succeeds (DaisyUI plugin loads; Oswald fetched at build). If the build fails fetching the font offline, that's an environment issue — report it.
Run: `npm run test` → 20 still pass.

- [ ] **Step 5: Commit**

```
git add package.json package-lock.json src/app/globals.css src/app/layout.tsx
git commit -m "feat: add DaisyUI desert themes, Oswald font, themed layout shell"
```

---

## Task 2: ThemeToggle client component

**Files:** Create `src/components/ThemeToggle.tsx`

- [ ] **Step 1: Create `src/components/ThemeToggle.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

type Theme = "desertnight" | "desertday";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("desertnight");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) || "desertnight";
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "desertnight" ? "desertday" : "desertnight";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("sand-theme", next);
    } catch {
      /* ignore storage errors */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark theme"
      className="btn btn-ghost btn-circle text-lg"
    >
      <span aria-hidden="true">{mounted && theme === "desertday" ? "☀" : "☾"}</span>
    </button>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → no errors (component compiles; it's wired into the navbar in Task 3).

- [ ] **Step 3: Commit**

```
git add src/components/ThemeToggle.tsx
git commit -m "feat: theme toggle (desert night/day) with localStorage persistence"
```

---

## Task 3: Restyle the navbar (MainNav)

**Files:** Modify `src/components/MainNav.tsx`

- [ ] **Step 1: Replace `src/components/MainNav.tsx`** with a DaisyUI navbar (keeps the `<details>` Items menu and exact "Items" text; adds the toggle):

```tsx
import Link from "next/link";
import { SECTIONS } from "@/lib/taxonomy";
import { ThemeToggle } from "@/components/ThemeToggle";

export function MainNav() {
  return (
    <nav aria-label="Primary" className="navbar max-w-5xl mx-auto px-4">
      <div className="flex-1 items-center gap-2">
        <Link href="/" className="font-display text-xl font-bold text-primary tracking-wide">
          SAND
        </Link>
        <ul className="menu menu-horizontal items-center gap-1 px-2">
          {SECTIONS.map((section) => {
            if (section.kind === "data" && section.categories.length > 0) {
              return (
                <li key={section.slug}>
                  <details>
                    <summary>{section.label}</summary>
                    <ul className="bg-base-200 rounded-box z-10 w-48 p-2 shadow">
                      <li>
                        <Link href={`/${section.slug}`}>All {section.label}</Link>
                      </li>
                      {section.categories.map((c) => (
                        <li key={c.slug}>
                          <Link href={`/${section.slug}?category=${c.slug}`}>{c.label}</Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            }
            const href = section.href ?? `/${section.slug}`;
            return (
              <li key={section.slug}>
                <Link href={href}>{section.label}</Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex-none items-center gap-1">
        <Link href="/about" className="btn btn-ghost btn-sm">About</Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build` → succeeds.
Run: `npm run test` → 20 pass.

- [ ] **Step 3: Commit**

```
git add src/components/MainNav.tsx
git commit -m "feat: DaisyUI navbar with Items dropdown and theme toggle"
```

---

## Task 4: Restyle the home page (hero, Layout A)

**Files:** Replace `src/app/page.tsx`; the existing `src/components/SearchBar.tsx` is replaced inline (delete its usage). Keep a `sr-only` label for the search input.

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
import Link from "next/link";
import { SECTIONS, ITEM_CATEGORIES } from "@/lib/taxonomy";

export default function HomePage() {
  return (
    <div className="space-y-10 py-6">
      <section className="hero rounded-box bg-base-200 py-12">
        <div className="hero-content text-center">
          <div className="max-w-xl">
            <h1 className="font-display text-4xl font-bold tracking-wide text-base-content">
              Unofficial SAND Wiki
            </h1>
            <p className="py-3 text-base-content/70">
              Crafting recipes, items, and the tech tree for{" "}
              <em>SAND: Raiders of Sophie</em>.
            </p>
            <form action="/items" method="get" role="search" className="join w-full max-w-md mx-auto">
              <label htmlFor="q" className="sr-only">Search items by name</label>
              <input
                id="q"
                name="q"
                type="search"
                placeholder="Search items by name…"
                className="input input-bordered join-item w-full"
              />
              <button type="submit" className="btn btn-primary join-item">Search</button>
            </form>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {ITEM_CATEGORIES.map((c) => (
                <Link key={c.slug} href={`/items?category=${c.slug}`} className="badge badge-outline badge-lg hover:badge-primary">
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold mb-3">Browse by section</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((section) => (
            <Link
              key={section.slug}
              href={section.href ?? `/${section.slug}`}
              className="card bg-base-200 hover:bg-base-300 transition-colors"
            >
              <div className="card-body">
                <h3 className="card-title font-display">{section.label}</h3>
                <p className="text-sm text-base-content/70">
                  {section.categories.length > 0
                    ? section.categories.map((c) => c.label).join(", ")
                    : "Explore"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Delete the now-unused `SearchBar` component**

Run: `git rm src/components/SearchBar.tsx`
(The home page now has the search inline; no other file imports `SearchBar` — confirm with a search before deleting: `Select-String -Path src -Pattern "SearchBar" -Recurse`. If anything still imports it, stop and report.)

- [ ] **Step 3: Verify**

Run: `npm run build` → succeeds; `/` present.
Run: `npm run dev` is NOT needed — but if you want a visual sanity check, skip it (build is enough).

- [ ] **Step 4: Commit**

```
git add src/app/page.tsx
git commit -m "feat: Desert Raiders home hero with search and section grid"
```

---

## Task 5: Restyle items list, filters, and cards

**Files:** Replace `src/components/ItemFilters.tsx`, `src/components/ItemCard.tsx`, `src/app/items/page.tsx`

- [ ] **Step 1: Replace `src/components/ItemFilters.tsx`** (DaisyUI form controls; same field names/`category`):

```tsx
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
```

- [ ] **Step 2: Replace `src/components/ItemCard.tsx`** (DaisyUI card; category as a badge):

```tsx
import Link from "next/link";
import { categoryLabel } from "@/lib/taxonomy";

export interface ItemCardData {
  slug: string; name: string; category: string; workbenchLevel: number | null;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="list-none">
      <Link href={`/items/${item.slug}`} className="card bg-base-200 hover:bg-base-300 transition-colors h-full">
        <div className="card-body p-4">
          <span className="font-medium">{item.name}</span>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="badge badge-outline badge-sm">{categoryLabel(item.category)}</span>
            {item.workbenchLevel !== null && (
              <span className="badge badge-ghost badge-sm">Workbench {item.workbenchLevel}</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
```

- [ ] **Step 3: Replace `src/app/items/page.tsx`** (same logic; themed result count + heading):

```tsx
import { listItems, listResources } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { ItemFilters } from "@/components/ItemFilters";
import { ITEM_CATEGORIES, isItemCategory } from "@/lib/taxonomy";
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
      <h1 className="font-display text-2xl font-bold mb-4">Items</h1>
      <ItemFilters
        categories={ITEM_CATEGORIES}
        resources={resources.map((r) => ({ id: r.id, name: r.name }))}
        current={{ q, category, workbench, resource, sort }}
      />
      <p className="text-sm text-base-content/70 mb-3" aria-live="polite">
        <span className="badge badge-ghost">{items.length} result(s)</span>
      </p>
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

- [ ] **Step 4: Verify** — `npm run build` → succeeds; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```
git add src/components/ItemFilters.tsx src/components/ItemCard.tsx src/app/items/page.tsx
git commit -m "feat: DaisyUI styling for items list, filters, and cards"
```

---

## Task 6: Restyle item detail page

**Files:** Replace `src/app/items/[slug]/page.tsx`

- [ ] **Step 1: Replace `src/app/items/[slug]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemBySlug } from "@/lib/queries";
import { categoryLabel } from "@/lib/taxonomy";

type Params = Promise<{ slug: string }>;

export default async function ItemDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  return (
    <article className="py-6 space-y-6 max-w-2xl">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold">{item.name}</h1>
        <div className="flex flex-wrap gap-2">
          <span className="badge badge-primary">{categoryLabel(item.category)}</span>
          {item.workbenchLevel !== null && (
            <span className="badge badge-outline">Workbench {item.workbenchLevel}</span>
          )}
          {item.craftTimeSeconds !== null && (
            <span className="badge badge-ghost">{item.craftTimeSeconds}s craft</span>
          )}
        </div>
        {item.description && <p className="text-base-content/80">{item.description}</p>}
      </header>

      {(item.unlockConditions || item.unlockedBy) && (
        <div className="card bg-base-200">
          <div className="card-body p-4 text-sm space-y-1">
            {item.unlockConditions && <p><span className="text-base-content/60">Unlock:</span> {item.unlockConditions}</p>}
            {item.unlockedBy && (
              <p>
                <span className="text-base-content/60">Unlocked by tech:</span>{" "}
                <Link className="link link-primary" href="/tech">{item.unlockedBy.name}</Link>
              </p>
            )}
          </div>
        </div>
      )}

      {item.recipe.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold mb-2">Recipe</h2>
          <ul className="space-y-1">
            {item.recipe.map((r) => (
              <li key={r.id}>
                <span className="badge badge-ghost badge-sm mr-2">{r.quantity}×</span>
                <Link className="link" href={`/items/${r.ingredient.slug}`}>{r.ingredient.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.usedIn.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold mb-2">Used in</h2>
          <ul className="space-y-1">
            {item.usedIn.map((u) => (
              <li key={u.id}><Link className="link" href={`/items/${u.item.slug}`}>{u.item.name}</Link></li>
            ))}
          </ul>
        </section>
      )}

      <p><Link href="/items" className="btn btn-ghost btn-sm">← Back to items</Link></p>
    </article>
  );
}
```

- [ ] **Step 2: Verify** — `npm run build` → succeeds.

- [ ] **Step 3: Commit**

```
git add "src/app/items/[slug]/page.tsx"
git commit -m "feat: DaisyUI styling for item detail page"
```

---

## Task 7: Restyle tech page + table

**Files:** Replace `src/components/TechTreeTable.tsx`, `src/app/tech/page.tsx` (TechTreeGraph unchanged except wrapper class — leave as-is)

- [ ] **Step 1: Replace `src/components/TechTreeTable.tsx`** (DaisyUI table; keep caption + scopes):

```tsx
export interface TechRow {
  slug: string; name: string; prerequisites: string[];
}

export function TechTreeTable({ rows }: { rows: TechRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra">
        <caption className="sr-only">Tech tree nodes and their prerequisites</caption>
        <thead>
          <tr>
            <th scope="col">Technology</th>
            <th scope="col">Requires</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug}>
              <th scope="row" className="font-medium">{r.name}</th>
              <td>{r.prerequisites.length ? r.prerequisites.join(", ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/app/tech/page.tsx`** (themed cards/form; keep calculator labels, button text, and `×` results):

```tsx
import { loadTechGraph, listTechNodes, resourceNamesById } from "@/lib/queries";
import { calculateTotalCost } from "@/lib/tech-tree";
import { TechTreeGraph } from "@/components/TechTreeGraph";
import { TechTreeTable } from "@/components/TechTreeTable";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TechPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const targetSlug = Array.isArray(sp.target) ? sp.target[0] : sp.target;

  const [graph, nodes, resourceNames] = await Promise.all([
    loadTechGraph(), listTechNodes(), resourceNamesById(),
  ]);
  const idBySlug = new Map(nodes.map((n) => [n.slug, n.id]));
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));

  let total: { resource: string; quantity: number }[] | null = null;
  let targetName: string | null = null;
  if (targetSlug && idBySlug.has(targetSlug)) {
    const targetId = idBySlug.get(targetSlug)!;
    targetName = nameById.get(targetId) ?? targetSlug;
    total = [...calculateTotalCost(graph, targetId)].map(([resourceId, quantity]) => ({
      resource: resourceNames.get(resourceId) ?? resourceId, quantity,
    }));
  }

  const graphInput = nodes.map((n) => ({
    id: n.id, name: n.name, prerequisiteIds: graph.get(n.id)?.prerequisiteIds ?? [],
  }));
  const tableRows = nodes.map((n) => ({
    slug: n.slug, name: n.name,
    prerequisites: (graph.get(n.id)?.prerequisiteIds ?? []).map((id) => nameById.get(id) ?? id),
  }));

  return (
    <section className="py-6 space-y-8">
      <h1 className="font-display text-2xl font-bold">Tech Tree</h1>

      <div className="card bg-base-200"><div className="card-body p-3"><TechTreeGraph nodes={graphInput} /></div></div>

      <section>
        <h2 className="font-display text-xl font-semibold mb-2">All technologies</h2>
        <TechTreeTable rows={tableRows} />
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold mb-2">Cost calculator</h2>
        <form action="/tech" method="get" className="flex gap-2 items-end mb-4">
          <div>
            <label htmlFor="target" className="label text-sm">Unlock technology</label>
            <select id="target" name="target" defaultValue={targetSlug ?? ""} className="select select-bordered">
              <option value="">Select…</option>
              {nodes.map((n) => <option key={n.slug} value={n.slug}>{n.name}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Calculate</button>
        </form>

        {total && (
          <div aria-live="polite" className="card bg-base-200 max-w-md">
            <div className="card-body p-4">
              <h3 className="font-medium mb-2">Total cost to unlock {targetName} (from scratch):</h3>
              {total.length === 0 ? (
                <p>No resource cost recorded.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {total.map((t) => (
                    <span key={t.resource} className="badge badge-lg badge-primary">{t.quantity} × {t.resource}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
```

- [ ] **Step 3: Verify** — `npm run build` → succeeds. Confirm the calculator still renders `30 × Iron Ore` and `5 × Fuel` shape (badges contain that text).

- [ ] **Step 4: Commit**

```
git add src/components/TechTreeTable.tsx src/app/tech/page.tsx
git commit -m "feat: DaisyUI styling for tech tree page and table"
```

---

## Task 8: Restyle placeholders, tools, about + name correction

**Files:** Replace `src/components/SectionPlaceholder.tsx`, `src/app/tools/page.tsx`, `src/app/about/page.tsx`; modify `README.md`

- [ ] **Step 1: Replace `src/components/SectionPlaceholder.tsx`**

```tsx
import { getSection } from "@/lib/taxonomy";
import { notFound } from "next/navigation";

export function SectionPlaceholder({ sectionSlug }: { sectionSlug: string }) {
  const section = getSection(sectionSlug);
  if (!section) notFound();

  return (
    <section className="py-8 space-y-4 max-w-2xl">
      <h1 className="font-display text-2xl font-bold">{section.label}</h1>
      <div role="alert" className="alert alert-warning">
        <span>Coming soon — this section isn&apos;t available yet.</span>
      </div>
      {section.categories.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-semibold mb-2">Planned categories</h2>
          <div className="flex flex-wrap gap-2">
            {section.categories.map((c) => <span key={c.slug} className="badge badge-outline badge-lg">{c.label}</span>)}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Replace `src/app/tools/page.tsx`**

```tsx
import Link from "next/link";

export default function ToolsPage() {
  return (
    <section className="py-8 space-y-4 max-w-2xl">
      <h1 className="font-display text-2xl font-bold">Tools</h1>
      <p className="text-base-content/70">Calculators and utilities for planning your runs.</p>
      <Link href="/tech" className="card bg-base-200 hover:bg-base-300 transition-colors block">
        <div className="card-body p-4">
          <span className="font-medium">Tech-tree cost calculator</span>
          <span className="text-sm text-base-content/70">Total resources needed to unlock any technology.</span>
        </div>
      </Link>
    </section>
  );
}
```

- [ ] **Step 3: Replace `src/app/about/page.tsx`** (themed + corrected name):

```tsx
export default function AboutPage() {
  return (
    <article className="py-8 max-w-2xl">
      <div className="card bg-base-200">
        <div className="card-body space-y-4">
          <h1 className="font-display text-2xl font-bold">About this site</h1>
          <p>
            This is an <strong>unofficial</strong>, community-maintained wiki for
            <em> SAND: Raiders of Sophie</em>. It is <strong>not affiliated with, endorsed by, or
            connected to tinyBuild</strong> or the game&apos;s developers.
          </p>
          <p>
            No protected game assets (extracted images, sounds, or 3D models) are used. All data is
            community-contributed for informational purposes.
          </p>
          <p>Found an error? Reporting and contributions are planned for a future update.</p>
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Fix the name in `README.md`** — replace the two occurrences of "Raiders of Sofia" with "Raiders of Sophie":
  - The intro line: `Community, unofficial wiki for *SAND: Raiders of Sophie*. Not affiliated with tinyBuild.`
  - Any other "Sofia" in the README → "Sophie".
  Run a check after: `Select-String -Path README.md -Pattern "Sofia"` should return nothing.

- [ ] **Step 5: Verify no "Sofia" remains in app source**

Run: `Select-String -Path src,README.md -Pattern "Sofia" -Recurse`
Expected: no matches.
Run: `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```
git add src/components/SectionPlaceholder.tsx src/app/tools/page.tsx src/app/about/page.tsx README.md
git commit -m "feat: DaisyUI styling for placeholders/tools/about; fix game name to Sophie"
```

---

## Task 9: Update e2e + final verification

**Files:** Modify `tests/e2e/wiki.spec.ts`

- [ ] **Step 1: Replace `tests/e2e/wiki.spec.ts`** (keeps existing coverage; adds theme-toggle + second-theme axe):

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = ["/", "/items", "/items/scrap-rifle", "/tech", "/about", "/environment", "/tramplers", "/tools"];

for (const path of pages) {
  test(`no serious/critical a11y violations on ${path} (dark)`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}

test("light theme (desertday) has no serious/critical a11y violations on key pages", async ({ page }) => {
  for (const path of ["/", "/items", "/tech"]) {
    await page.goto(path);
    await page.evaluate(() => { document.documentElement.dataset.theme = "desertday"; });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(serious, `${path}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
  }
});

test("theme toggle switches between desert night and day", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "desertnight");
  await page.getByRole("button", { name: /toggle light and dark theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "desertday");
});

test("search navigates to filtered items list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: /search items/i }).fill("rifle");
  await page.getByRole("button", { name: /^search$/i }).click();
  await expect(page).toHaveURL(/\/items\?q=rifle/);
  await expect(page.getByRole("link", { name: "Scrap Rifle" })).toBeVisible();
});

test("category filter narrows the items list", async ({ page }) => {
  await page.goto("/items?category=weapons");
  await expect(page.getByRole("link", { name: "Scrap Rifle" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Iron Ore" })).toHaveCount(0);
});

test("nav exposes the Items category menu", async ({ page }) => {
  await page.goto("/");
  // Scope to the Primary nav: the home page also has a section card titled "Items"
  // and a hero chip linking to Weapons, so an unscoped selector would be ambiguous.
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByText("Items", { exact: true }).click();
  await expect(nav.getByRole("link", { name: "Weapons" })).toBeVisible();
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

Note: the search button matcher is `/^search$/i` (anchored) so it doesn't also match the searchbox; verify the button still passes.

- [ ] **Step 2: Free port 3000 if the dev server holds it, then run e2e**

Run (PowerShell): check `Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue`; if present, `Stop-Process -Id <pid> -Force`.
Run: `npm run db:seed` (ensure seeded).
Run: `npm run test:e2e`
Expected: all tests pass. If axe finds a contrast violation in either theme, that's a REAL theme bug — adjust the offending color in the `globals.css` theme (e.g. raise `base-content` or `primary-content` contrast) and re-run; do not weaken the test.

- [ ] **Step 3: Full verification gate**

Run: `npm run test` → 20 unit pass.
Run: `npx tsc --noEmit` → no errors.
Run: `npm run lint` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```
git add tests/e2e/wiki.spec.ts
git commit -m "test: theme toggle + light-theme a11y; keep nav/filter coverage"
```

---

## Coverage map (spec → task)

| Spec section | Task |
|--------------|------|
| §3 DaisyUI + themes | 1 |
| §4 Oswald display font | 1 |
| §5 theme toggle (+FOUC script) | 1 (script), 2, 3 |
| §6 navbar | 3 |
| §6 home hero (Layout A) | 4 |
| §6 items list/filters/cards | 5 |
| §6 item detail | 6 |
| §6 tech page/table | 7 |
| §6 placeholders/tools/about/footer | 1 (footer), 8 |
| §7 name correction (Sophie) | 1 (metadata), 4 (home), 8 (about, README) |
| §8 accessibility (both themes) | 9 |
| §9 testing | 9 |

## Notes / deviations

- `SearchBar.tsx` is removed (Task 4) — the home search is inline now and it had no other consumers.
- React Flow `TechTreeGraph` keeps its existing code (still `inert`); only its surrounding card wrapper changes (Task 7).
- The anti-FOUC `<script>` is placed at the top of `<body>` (App Router doesn't allow a custom `<head>` element); it runs before content paints.
