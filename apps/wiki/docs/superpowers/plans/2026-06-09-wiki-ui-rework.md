# Wiki UI Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the SAND wiki's nav, item taxonomy, cards, recipe display, and global styling into a denser, icon-forward, squared-off look.

**Architecture:** Next.js 16 App Router + Prisma 6 + DaisyUI/Tailwind v4. Item `category` is computed once at seed time and stored in the DB; all consumers read the stored string. UI is mostly server components; the one new interactive affordance (recipe name tooltip) is CSS-only so no component becomes a client component. Logic lives in `src/lib` (unit-tested with Vitest); UI behavior is verified with Playwright e2e.

**Tech Stack:** TypeScript, Next.js 16.2, React 19, Prisma 6, Tailwind v4, DaisyUI 5, Vitest, Playwright.

**Working directory:** All paths are relative to the repo root `d:/Documents/SandLabs`. The app lives under `sand-wiki/`. Run npm/test commands from inside `sand-wiki/` (e.g. `npm --prefix sand-wiki run test`, or `cd sand-wiki` in your own shell). The git repo root is `d:/Documents/SandLabs`; commit with `git -C "d:/Documents/SandLabs"`.

**Branch:** Work continues on `feat/wiki-ui-rework` (already created; the design spec is committed there).

**Spec:** `sand-wiki/docs/superpowers/specs/2026-06-09-wiki-ui-rework-design.md`

---

## File Structure

**Modify:**
- `sand-wiki/src/lib/taxonomy.ts` — categories, type→category map, new `categoryForItem`, colors
- `sand-wiki/src/lib/taxonomy.test.ts` — updated category list, `categoryForType`, new `categoryForItem` tests
- `sand-wiki/src/lib/item-filter.test.ts` — `guns` fixture → `weapons`
- `sand-wiki/src/lib/search.test.ts` — `guns` fixtures → `weapons`
- `sand-wiki/prisma/seed.ts` — use `categoryForItem(type, name)`
- `sand-wiki/src/components/ItemIcon.tsx` — add `recipe` (44px) and `card` (72px) sizes
- `sand-wiki/src/components/MainNav.tsx` — hover-gap fix, drop "All {label}" link
- `sand-wiki/src/components/ItemCard.tsx` — big-icon horizontal layout
- `sand-wiki/src/components/recipe-cells.tsx` — icon-only ingredient cells + CSS tooltip
- `sand-wiki/src/app/items/page.tsx` — remove filter bar + tier param, add quick-nav layout
- `sand-wiki/src/app/globals.css` — reduce radius tokens (both themes)
- `sand-wiki/tests/e2e/wiki.spec.ts` — update category/tier tests, add nav + tooltip assertions

**Create:**
- `sand-wiki/src/components/CategoryQuickNav.tsx` — responsive sticky category nav

**Delete:**
- `sand-wiki/src/components/ItemFilters.tsx`

---

## Task 1: Taxonomy — replace Guns with Artillery + `categoryForItem`

**Files:**
- Modify: `sand-wiki/src/lib/taxonomy.ts`
- Test: `sand-wiki/src/lib/taxonomy.test.ts`

- [ ] **Step 1: Update the failing tests**

In `sand-wiki/src/lib/taxonomy.test.ts`, add `categoryForItem` to the import from `./taxonomy`:

```ts
import {
  SECTIONS, ITEM_CATEGORIES, ITEM_CATEGORY_SLUGS,
  isItemCategory, categoryLabel, getSection, categoryForType, categoryForItem,
  CATEGORY_COLORS, categoryColor,
} from "./taxonomy";
```

Replace the "defines the eight item categories" test body's expected array:

```ts
  it("defines the eight item categories", () => {
    expect(ITEM_CATEGORY_SLUGS).toEqual([
      "weapons", "artillery", "resources", "attire", "tools", "medical", "ammo", "misc",
    ]);
    expect(ITEM_CATEGORIES.every((c) => c.label.length > 0)).toBe(true);
  });
```

In the `categoryForType` describe block, change the two weapon expectations:

```ts
    expect(categoryForType("WEAPON")).toBe("weapons");
    expect(categoryForType("WEAPON_BELT")).toBe("weapons");
```

Add a new describe block after the `categoryForType` block:

```ts
describe("categoryForItem", () => {
  it("routes mm-named weapons to artillery", () => {
    expect(categoryForItem("WEAPON", "40mm Cannon")).toBe("artillery");
    expect(categoryForItem("WEAPON", "85 mm Howitzer")).toBe("artillery");
    expect(categoryForItem("WEAPON_BELT", "120mm Belt")).toBe("artillery");
  });

  it("keeps non-mm weapons in weapons", () => {
    expect(categoryForItem("WEAPON", "Assault Rifle")).toBe("weapons");
    expect(categoryForItem("WEAPON_BELT", "Ammo Belt")).toBe("weapons");
  });

  it("only applies the mm rule to weapon types", () => {
    // "mm" in a non-weapon name must not move it to artillery
    expect(categoryForItem("FOOD", "Yummy 9mm Snack")).toBe("medical");
    expect(categoryForItem("RESOURCE_T1", "100mm Scrap")).toBe("resources");
  });

  it("falls back to type mapping for null/unknown", () => {
    expect(categoryForItem(null, "anything")).toBe("misc");
    expect(categoryForItem("SOME_NEW_TYPE", "40mm")).toBe("misc");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix sand-wiki run test -- src/lib/taxonomy.test.ts`
Expected: FAIL — `categoryForItem` is not exported; `categoryForType("WEAPON")` still returns `"guns"`; category list mismatch.

- [ ] **Step 3: Update `taxonomy.ts`**

In `sand-wiki/src/lib/taxonomy.ts`, change `itemCategories` (replace the `guns` entry with `artillery`, placed second):

```ts
const itemCategories: Category[] = [
  { slug: "weapons", label: "Weapons" },
  { slug: "artillery", label: "Artillery" },
  { slug: "resources", label: "Resources" },
  { slug: "attire", label: "Attire" },
  { slug: "tools", label: "Tools" },
  { slug: "medical", label: "Medical" },
  { slug: "ammo", label: "Ammo" },
  { slug: "misc", label: "Misc" },
];
```

In `TYPE_TO_CATEGORY`, change the two weapon lines:

```ts
  WEAPON: "weapons",
  WEAPON_BELT: "weapons",
```

Add `categoryForItem` directly after the existing `categoryForType` function:

```ts
/** Name-aware category. Weapon types whose name contains a number followed by "mm"
 *  (e.g. "40mm", "85 mm") are artillery; everything else uses the type mapping.
 *  This is the single source of the guns→weapons/artillery split — applied at seed time. */
export function categoryForItem(type: string | null | undefined, name: string): string {
  const base = categoryForType(type);
  if (base === "weapons" && /\d+\s?mm/i.test(name)) return "artillery";
  return base;
}
```

In `CATEGORY_COLORS`, add an `artillery` color and keep `guns` as a fallback:

```ts
export const CATEGORY_COLORS: Record<string, string> = {
  weapons: "#d4654f",
  artillery: "#8b94a6",
  guns: "#8b94a6", // legacy fallback — not a current category
  ammo: "#e0a341",
  resources: "#7fb069",
  tools: "#4fb3a6",
  attire: "#6aa9c9",
  medical: "#d56a8c",
  misc: "#9b8b73",
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix sand-wiki run test -- src/lib/taxonomy.test.ts`
Expected: PASS (all taxonomy tests green).

- [ ] **Step 5: Commit**

```bash
git -C "d:/Documents/SandLabs" add sand-wiki/src/lib/taxonomy.ts sand-wiki/src/lib/taxonomy.test.ts
git -C "d:/Documents/SandLabs" commit -m "feat(wiki): replace Guns category with name-aware Artillery split"
```

---

## Task 2: Seed uses `categoryForItem`

**Files:**
- Modify: `sand-wiki/prisma/seed.ts:4` and `:40`

- [ ] **Step 1: Update the import**

In `sand-wiki/prisma/seed.ts`, change the taxonomy import (line 4) to include `categoryForItem`:

```ts
import { categoryForItem, isItemCategory } from "../src/lib/taxonomy";
```

- [ ] **Step 2: Use the name-aware mapping**

Replace line 40 (`const category = categoryForType(i.type);`) with:

```ts
    const category = categoryForItem(i.type, i.displayName ?? i.name);
```

(The `isItemCategory(category)` guard on the next line is unchanged and now passes for `artillery`.)

- [ ] **Step 3: Type-check the seed script compiles**

Run: `npx --prefix sand-wiki tsx --version >/dev/null && npx --prefix sand-wiki tsc --noEmit -p sand-wiki/tsconfig.json`
Expected: No type errors referencing `seed.ts` (a clean exit, or only pre-existing unrelated output). The DB is re-seeded in Task 10; do not seed yet.

- [ ] **Step 4: Commit**

```bash
git -C "d:/Documents/SandLabs" add sand-wiki/prisma/seed.ts
git -C "d:/Documents/SandLabs" commit -m "feat(wiki): seed item categories with name-aware artillery split"
```

---

## Task 3: Update opaque `guns` test fixtures

**Files:**
- Modify: `sand-wiki/src/lib/item-filter.test.ts`
- Modify: `sand-wiki/src/lib/search.test.ts`

These tests use `"guns"` as an arbitrary category string; the logic doesn't depend on the value. Update to a current slug for cleanliness.

- [ ] **Step 1: Update `item-filter.test.ts`**

In `sand-wiki/src/lib/item-filter.test.ts`, in the "filters by name OR derivedName ... and category" test, replace both `"guns"` occurrences with `"weapons"`:

```ts
    expect(buildItemQuery({ query: "rifle", category: "weapons" }).where).toEqual({
      OR: [
        { name: { contains: "rifle", mode: "insensitive" } },
        { derivedName: { contains: "rifle", mode: "insensitive" } },
      ],
      category: "weapons",
    });
```

- [ ] **Step 2: Update `search.test.ts`**

In `sand-wiki/src/lib/search.test.ts`, replace the two fixture `category: "guns"` values with `category: "weapons"` (lines ~5 and ~29 — the `sniper-rifle` fixture and the `gun-${n}` loop fixture). Leave slugs/names as-is.

- [ ] **Step 3: Run the lib tests**

Run: `npm --prefix sand-wiki run test`
Expected: PASS (entire Vitest suite green).

- [ ] **Step 4: Commit**

```bash
git -C "d:/Documents/SandLabs" add sand-wiki/src/lib/item-filter.test.ts sand-wiki/src/lib/search.test.ts
git -C "d:/Documents/SandLabs" commit -m "test(wiki): use current category slug in fixtures"
```

---

## Task 4: ItemIcon — add `recipe` and `card` sizes

**Files:**
- Modify: `sand-wiki/src/components/ItemIcon.tsx`

- [ ] **Step 1: Extend the size union and px map**

In `sand-wiki/src/components/ItemIcon.tsx`, change the `size` prop type and the `px` lookup. Replace the type line:

```ts
  size?: "sm" | "recipe" | "md" | "card" | "lg";
```

and replace the `px` map line:

```ts
  const px = { sm: "size-5", recipe: "size-11", md: "size-12", card: "size-18", lg: "size-28" }[size];
```

- [ ] **Step 2: Verify it compiles**

Run: `npx --prefix sand-wiki tsc --noEmit -p sand-wiki/tsconfig.json`
Expected: No new type errors. (No standalone test — consumers in Tasks 6 and 7 exercise the new sizes; final e2e in Task 10 confirms rendering.)

- [ ] **Step 3: Commit**

```bash
git -C "d:/Documents/SandLabs" add sand-wiki/src/components/ItemIcon.tsx
git -C "d:/Documents/SandLabs" commit -m "feat(wiki): add recipe and card ItemIcon sizes"
```

---

## Task 5: Nav dropdown hover-gap fix + remove "All" link

**Files:**
- Modify: `sand-wiki/src/components/MainNav.tsx`
- Test: `sand-wiki/tests/e2e/wiki.spec.ts`

- [ ] **Step 1: Add a failing e2e assertion**

In `sand-wiki/tests/e2e/wiki.spec.ts`, replace the existing `nav exposes the Items category menu` test with:

```ts
test("nav exposes the Items category menu without an All link", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("button", { name: /^Items/ }).hover();
  await expect(nav.getByRole("link", { name: "Weapons" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Artillery" })).toBeVisible();
  // The "All Items" shortcut has been removed.
  await expect(nav.getByRole("link", { name: /^All Items$/ })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix sand-wiki run test:e2e -- -g "Items category menu"`
Expected: FAIL — "All Items" link still present / Artillery link absent (DB not re-seeded yet may also affect Artillery; the All-Items assertion is the deterministic failure driving this task). If the e2e server/db is unavailable in this environment, note it and rely on Step 4 manual verification instead.

- [ ] **Step 3: Edit `MainNav.tsx`**

Remove the dead-zone margin and the "All" link. Replace the dropdown `<ul>` opening tag and its first `<li>` (the All-link block, lines ~26-31) so the list starts directly with the category items. New dropdown markup:

```tsx
                  <ul
                    className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute left-0 top-full z-20 pt-2 w-48 space-y-1"
                  >
                    <li className="rounded-box border border-base-300 bg-base-200 p-2 shadow space-y-1 list-none">
                      <ul className="space-y-1">
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
                  </ul>
```

Rationale: the outer `<ul>` now carries `pt-2` (transparent padding) instead of `mt-1` (margin), so the hover region is continuous from the trigger into the menu — no dead zone. The visible panel (border/bg/shadow) moves to an inner wrapper so the padding stays transparent.

- [ ] **Step 4: Verify the fix**

Run: `npm --prefix sand-wiki run test:e2e -- -g "Items category menu"`
Expected: PASS.
Manual: `npm --prefix sand-wiki run dev`, hover "Items ▾", then move the cursor straight down into the menu — it stays open; there is no "All Items" entry; categories include Artillery, not Guns.

- [ ] **Step 5: Commit**

```bash
git -C "d:/Documents/SandLabs" add sand-wiki/src/components/MainNav.tsx sand-wiki/tests/e2e/wiki.spec.ts
git -C "d:/Documents/SandLabs" commit -m "fix(wiki): close nav dropdown hover gap and drop All link"
```

---

## Task 6: Item card redesign (big icon + stacked name/category)

**Files:**
- Modify: `sand-wiki/src/components/ItemCard.tsx`

- [ ] **Step 1: Rewrite the card body**

Replace the contents of `sand-wiki/src/components/ItemCard.tsx` with:

```tsx
import Link from "next/link";
import { CategoryTag } from "@/components/CategoryTag";
import { ItemIcon } from "@/components/ItemIcon";

export interface ItemCardData {
  slug: string; name: string; icon?: string | null; category: string; workbenchTier: number | null;
  buyable?: boolean; sellable?: boolean;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="list-none">
      <Link
        href={`/items/${item.slug}`}
        className="card card-side bg-base-200 hover:bg-base-300 transition-colors h-full items-center gap-3 p-3"
      >
        <ItemIcon name={item.name} icon={item.icon} size="card" decorative />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{item.name}</div>
          <div className="mt-1">
            <CategoryTag slug={item.category} size="sm" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {item.workbenchTier !== null && (
            <span className="badge badge-ghost badge-sm">T{item.workbenchTier}</span>
          )}
          {item.buyable && (
            <span className="badge badge-success badge-sm" aria-label="Buyable">◈ Buy</span>
          )}
          {item.sellable && (
            <span className="badge badge-warning badge-sm" aria-label="Sellable">◈ Sell</span>
          )}
        </div>
      </Link>
    </li>
  );
}
```

Note: the buyable/sellable badges keep `aria-label="Buyable"`/`"Sellable"` so the existing `items grid marks buyable and sellable items` e2e test still passes.

- [ ] **Step 2: Verify the buyable/sellable e2e still passes**

Run: `npm --prefix sand-wiki run test:e2e -- -g "items grid marks buyable and sellable"`
Expected: PASS. (If the e2e env is unavailable, verify manually on `/items`: cards show a large icon left, name + category stacked, and Tier/Buy/Sell badges on the right.)

- [ ] **Step 3: Commit**

```bash
git -C "d:/Documents/SandLabs" add sand-wiki/src/components/ItemCard.tsx
git -C "d:/Documents/SandLabs" commit -m "feat(wiki): redesign item card with prominent icon and stacked text"
```

---

## Task 7: Recipe cells — icon-only with name-on-hover tooltip

**Files:**
- Modify: `sand-wiki/src/components/recipe-cells.tsx`
- Test: `sand-wiki/tests/e2e/wiki.spec.ts`

- [ ] **Step 1: Add a failing e2e assertion**

In `sand-wiki/tests/e2e/wiki.spec.ts`, extend the `item detail shows Crafted by and Used in tabs with tables` test by appending these lines before its closing brace (after the "Produces" assertion). This checks that ingredient icons are now accessible links carrying the item name (the tooltip's accessible source), instead of inline text:

```ts
  // Ingredient icons expose the item name as their accessible name (shown visually on hover).
  await page.getByRole("tab", { name: "Crafted by" }).click();
  const firstIngredientLink = page.locator('[role="tabpanel"] table tbody a[href^="/items/"]').first();
  await expect(firstIngredientLink).toHaveAttribute("aria-label", /\S+/);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix sand-wiki run test:e2e -- -g "Crafted by and Used in tabs"`
Expected: FAIL — current ingredient links have no `aria-label` (they wrap visible text). If e2e env unavailable, proceed and rely on Step 4 manual check.

- [ ] **Step 3: Rewrite `IngredientList`**

Replace the `IngredientList` function in `sand-wiki/src/components/recipe-cells.tsx` (keep `WorkbenchBadge` unchanged). Updated file:

```tsx
import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";
import type { RecipeCard, RecipeCardRow } from "@/lib/recipes";

export function IngredientList({ rows }: { rows: RecipeCardRow[] }) {
  if (rows.length === 0) return <span className="text-base-content/50">—</span>;
  return (
    <div className="flex flex-wrap gap-3">
      {rows.map((r, i) => (
        <div key={`${r.slug}-${i}`} className="group relative flex flex-col items-center gap-0.5">
          <Link href={`/items/${r.slug}`} aria-label={r.name} className="block">
            <ItemIcon name={r.name} icon={r.icon} size="recipe" />
          </Link>
          <span className="text-xs text-base-content/60">×{r.amount}</span>
          <span
            role="tooltip"
            aria-hidden="true"
            className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 whitespace-nowrap rounded-field border border-base-300 bg-base-100 px-2 py-1 text-xs text-base-content shadow-lg"
          >
            {r.name}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WorkbenchBadge({ recipe }: { recipe: RecipeCard }) {
  if (!recipe.workbench) return <span className="text-base-content/50">—</span>;
  return (
    <span className="badge badge-outline whitespace-nowrap">
      {recipe.workbench}{recipe.tier !== null ? ` · T${recipe.tier}` : ""}
    </span>
  );
}
```

Notes:
- `ItemIcon` is called **without** `decorative`, so it renders a real `alt`/`aria-label` of the item name. The wrapping `Link` also gets `aria-label={r.name}` so the link itself has an accessible name (icon `alt` alone can be empty if `icon` is null).
- The tooltip is CSS-only: shown on `group-hover` and `group-focus-within` (keyboard focus on the link reveals it). It is `aria-hidden` since the name is already the link's accessible name. `rounded-field` follows the reduced radius from Task 9.
- No `"use client"` — this stays a server component.

- [ ] **Step 4: Verify**

Run: `npm --prefix sand-wiki run test:e2e -- -g "Crafted by and Used in tabs"`
Expected: PASS.
Manual: on `/items/sniper-rifle-iron-sights-silencer`, the Crafted-by table shows ingredient icons (larger) with `×amount` and no inline names; hovering or tab-focusing an icon shows a dark tooltip with the item name.

- [ ] **Step 5: Commit**

```bash
git -C "d:/Documents/SandLabs" add sand-wiki/src/components/recipe-cells.tsx sand-wiki/tests/e2e/wiki.spec.ts
git -C "d:/Documents/SandLabs" commit -m "feat(wiki): show recipe ingredients as icons with name-on-hover tooltip"
```

---

## Task 8: Items page restructure + CategoryQuickNav

**Files:**
- Create: `sand-wiki/src/components/CategoryQuickNav.tsx`
- Modify: `sand-wiki/src/app/items/page.tsx`
- Delete: `sand-wiki/src/components/ItemFilters.tsx`
- Test: `sand-wiki/tests/e2e/wiki.spec.ts`

- [ ] **Step 1: Create `CategoryQuickNav.tsx`**

Create `sand-wiki/src/components/CategoryQuickNav.tsx`:

```tsx
import Link from "next/link";
import type { Category } from "@/lib/taxonomy";
import { categoryColor } from "@/lib/taxonomy";

/** Responsive category switcher. Sticky vertical list on lg+, horizontal scroll
 *  row of chips below lg. Highlights the active category and preserves ?q=. */
export function CategoryQuickNav({
  categories, current, query,
}: { categories: Category[]; current?: string; query?: string }) {
  const href = (slug: string) =>
    `/items?category=${slug}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  return (
    <nav aria-label="Item categories" className="lg:sticky lg:top-[4.5rem]">
      <h2 className="hidden lg:block font-display text-xs font-semibold uppercase tracking-wide text-base-content/60 mb-2">
        Jump to
      </h2>
      <ul className="flex flex-row gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {categories.map((c) => {
          const active = c.slug === current;
          return (
            <li key={c.slug} className="shrink-0">
              <Link
                href={href(c.slug)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-field px-3 py-1.5 text-sm whitespace-nowrap border lg:border-0 ${
                  active
                    ? "bg-base-300 text-primary border-base-300 lg:bg-base-300"
                    : "border-base-300 lg:border-transparent hover:bg-base-200 text-base-content"
                }`}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(c.slug) }} aria-hidden="true" />
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Rewrite `items/page.tsx`**

Replace the contents of `sand-wiki/src/app/items/page.tsx` with (removes `ItemFilters`, the `listWorkbenchTiers` call, and the `tier` param; adds the quick-nav grid):

```tsx
import { listItems, getTradeFlags } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { CategoryQuickNav } from "@/components/CategoryQuickNav";
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
  const filter: ItemFilter = {
    query: q || undefined,
    category: category || undefined,
  };

  const [items, tradeFlags] = await Promise.all([listItems(filter), getTradeFlags()]);

  return (
    <section className="py-6">
      <h1 className="font-display text-2xl font-bold mb-4">Items</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_220px] items-start">
        <div className="min-w-0 order-2 lg:order-1">
          <p className="text-sm text-base-content/70 mb-3" aria-live="polite">
            <span className="badge badge-ghost">{items.length} result(s)</span>
          </p>
          {items.length === 0 ? (
            <p>No items match your filters.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((i) => (
                <ItemCard
                  key={i.id}
                  item={{
                    slug: i.slug, name: i.name, icon: i.icon, category: i.category, workbenchTier: i.workbenchTier,
                    buyable: tradeFlags.buyable.has(i.slug),
                    sellable: tradeFlags.sellable.has(i.slug),
                  }}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="order-1 lg:order-2">
          <CategoryQuickNav categories={ITEM_CATEGORIES} current={category} query={q} />
        </div>
      </div>
    </section>
  );
}
```

Note: `order-1/order-2` puts the quick-nav (chip row) above the grid on small screens and to the right on `lg+`. The grid drops to `xl:grid-cols-3` (from `lg`) because the sidebar now consumes horizontal space at `lg`.

- [ ] **Step 3: Delete `ItemFilters.tsx`**

```bash
git -C "d:/Documents/SandLabs" rm sand-wiki/src/components/ItemFilters.tsx
```

- [ ] **Step 4: Update e2e tests for the new items page**

In `sand-wiki/tests/e2e/wiki.spec.ts`:

(a) Update `category filter narrows the items list` to use the renamed category:

```ts
test("category filter narrows the items list", async ({ page }) => {
  await page.goto("/items?category=weapons");
  await expect(page.locator('a[href="/items/sniper-rifle"]')).toBeVisible();
  await expect(page.locator('a[href="/items/energy-bar"]')).toHaveCount(0);
});
```

(b) Delete the `workbench tier filter narrows the items list` test entirely (the tier filter no longer exists).

(c) Add a quick-nav test:

```ts
test("category quick-nav switches the filtered list", async ({ page }) => {
  await page.goto("/items");
  const quickNav = page.getByRole("navigation", { name: "Item categories" });
  await quickNav.getByRole("link", { name: "Weapons" }).click();
  await expect(page).toHaveURL(/\/items\?category=weapons/);
  await expect(page.getByRole("navigation", { name: "Item categories" })
    .getByRole("link", { name: "Weapons" })).toHaveAttribute("aria-current", "page");
});
```

- [ ] **Step 5: Run the affected e2e tests**

Run: `npm --prefix sand-wiki run test:e2e -- -g "category filter|quick-nav|marks buyable"`
Expected: PASS. (Requires the re-seeded DB from Task 10 for `category=weapons` to include `sniper-rifle`; if running before re-seed, expect the category assertion to fail until Task 10. The quick-nav URL/aria assertions pass regardless.)

- [ ] **Step 6: Commit**

```bash
git -C "d:/Documents/SandLabs" add sand-wiki/src/components/CategoryQuickNav.tsx sand-wiki/src/app/items/page.tsx sand-wiki/tests/e2e/wiki.spec.ts
git -C "d:/Documents/SandLabs" commit -m "feat(wiki): replace items filter bar with responsive category quick-nav"
```

---

## Task 9: Reduce global corner radius

**Files:**
- Modify: `sand-wiki/src/app/globals.css`

- [ ] **Step 1: Lower the radius tokens in both themes**

In `sand-wiki/src/app/globals.css`, in the `desertnight` theme block, change:

```css
  --radius-box: 0.25rem;
  --radius-field: 0.1875rem;
```

(was `0.75rem` / `0.5rem`). Make the identical change in the `desertday` theme block (lines ~56-57).

- [ ] **Step 2: Verify the build compiles the CSS**

Run: `npm --prefix sand-wiki run build`
Expected: Build succeeds. (Radius is a visual change; confirmed visually in Task 10.)

- [ ] **Step 3: Commit**

```bash
git -C "d:/Documents/SandLabs" add sand-wiki/src/app/globals.css
git -C "d:/Documents/SandLabs" commit -m "style(wiki): reduce corner radius for a sharper look"
```

---

## Task 10: Re-seed + full verification

**Files:** none (verification + data)

- [ ] **Step 1: Confirm and run the re-seed**

⚠️ This is destructive: `prisma/seed.ts` runs `deleteMany()` on items/recipes then recreates them against the **Neon dev DB**. Confirm with the user before running. It reads `prisma/data.json` and `prisma/icons.json` (both present).

Run: `npm --prefix sand-wiki run db:seed`
Expected: `Seeded N items and M recipes.` with no "Mapped category ... is not a known category" error.

- [ ] **Step 2: Spot-check the artillery split**

Run a quick query to confirm the split landed (PowerShell-safe one-liner):

Run: `npx --prefix sand-wiki tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();p.item.groupBy({by:['category'],_count:true}).then(r=>{console.log(r);return p.$disconnect()})"`
Expected: an `artillery` row with `_count > 0` and a `weapons` row; no `guns` row.

- [ ] **Step 3: Run the full unit suite**

Run: `npm --prefix sand-wiki run test`
Expected: PASS (all Vitest files).

- [ ] **Step 4: Lint**

Run: `npm --prefix sand-wiki run lint`
Expected: No errors.

- [ ] **Step 5: Run the full e2e suite**

Run: `npm --prefix sand-wiki run test:e2e`
Expected: PASS — including a11y checks on `/` and `/items` (the new tooltip, quick-nav, and cards must not introduce serious/critical violations), the renamed category test, the quick-nav test, and the recipe-tooltip assertion.

- [ ] **Step 6: Manual visual pass (`npm --prefix sand-wiki run dev`)**

Confirm:
- Nav: hover Items ▾ → move into menu, stays open; categories show Artillery (not Guns); no "All Items".
- `/items`: no filter bar; quick-nav is a sticky sidebar on wide screens and a chip row on narrow screens; clicking a category filters and highlights it; cards have a big icon with name+category stacked and squared corners.
- An item detail page: recipe ingredients are larger icons with `×amount`, names appear on hover/focus in a dark tooltip; corners are sharper across buttons/inputs/cards.

- [ ] **Step 7: Final commit (if any test fixups were needed)**

```bash
git -C "d:/Documents/SandLabs" add -A sand-wiki
git -C "d:/Documents/SandLabs" commit -m "test(wiki): verify UI rework end-to-end" || echo "nothing to commit"
```

---

## Self-Review notes (author)

- **Spec coverage:** §1→Task 5; §2→Tasks 1,2 (+3 fixtures, 10 re-seed); §3→Task 6; §4→Tasks 4,7; §5→Task 8; §6→Tasks 4,9. All sections mapped.
- **Type consistency:** `categoryForItem(type, name)` defined in Task 1, used identically in Task 2. `ItemIcon` sizes `"recipe"`/`"card"` defined in Task 4, used in Tasks 6/7. `CategoryQuickNav` props (`categories`, `current`, `query`) defined and consumed in Task 8. `ItemCardData` unchanged.
- **Ordering caveat noted:** category-based e2e assertions depend on the Task 10 re-seed; this is called out in Tasks 5, 8, and 10 so the executor doesn't treat a pre-seed failure as a regression.
