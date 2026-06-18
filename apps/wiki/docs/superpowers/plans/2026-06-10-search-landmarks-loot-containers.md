# Search Autocomplete: Landmarks & Loot Containers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add landmarks and loot containers to the search autocomplete as two separate groups ("Loot Containers", "Landmarks") that navigate to `/environment/{slug}`, alongside the existing Categories and Items groups.

**Architecture:** `/api/search-index` returns `{ items, places }` (places = EnvEntity rows in the `loot-containers`/`landmarks` categories). `search.ts` gains a `places` result (pure, cap 6). `SearchBox` loads the combined index and renders an ordered, group-based dropdown (Categories → Items → Loot Containers → Landmarks), replacing today's ad-hoc header logic.

**Tech Stack:** Next.js 16 (App Router, route handler), Prisma 6, React 19, TypeScript, Vitest, Playwright + axe.

---

## File Structure

- **Modify** `src/lib/search.ts` — types + `searchSuggestions` gains `places` (Task 1).
- **Modify** `src/lib/search.test.ts` — update + add tests (Task 1).
- **Modify** `src/app/api/search-index/route.ts` — return `{ items, places }` (Task 2).
- **Modify** `src/components/SearchBox.tsx` — combined index + group-based dropdown (Task 3).
- **Modify** `tests/e2e/wiki.spec.ts` — autocomplete → environment navigation (Task 4).
- **Modify** `TODO.md` — mark #11 done (Task 5).

---

## Task 1: Search lib — add `places` (TDD)

**Files:**
- Modify: `src/lib/search.ts`
- Test: `src/lib/search.test.ts`

- [ ] **Step 1: Update existing tests + add new ones**

In `src/lib/search.test.ts`:

(a) change the import line to also bring in the place type:

```ts
import { searchSuggestions, type IndexItem, type IndexPlace } from "./search";
```

(b) add a places fixture right after the existing `index` array:

```ts
const places: IndexPlace[] = [
  { slug: "weapon-crate", name: "Weapon Crate", category: "loot-containers" },
  { slug: "food-crate", name: "Food Crate", category: "loot-containers" },
  { slug: "dreadnaught", name: "Dreadnaught", category: "landmarks" },
];
```

(c) replace the two empty-query assertions so they expect the new `places` field:

```ts
    expect(searchSuggestions("", index)).toEqual({ categories: [], items: [], places: [] });
    expect(searchSuggestions("   ", index)).toEqual({ categories: [], items: [], places: [] });
```

(d) add these tests before the closing `});` of the `describe` block:

```ts
  it("matches places by name and returns them in the places field", () => {
    const r = searchSuggestions("crate", index, places);
    expect(r.places.map((p) => p.slug)).toEqual(["weapon-crate", "food-crate"]);
  });

  it("returns places of both categories, tagged by category", () => {
    const r = searchSuggestions("a", index, places); // matches Weapon Crate, Dreadnaught (and items)
    expect(r.places.some((p) => p.category === "loot-containers")).toBe(true);
    expect(r.places.some((p) => p.category === "landmarks")).toBe(true);
  });

  it("defaults places to empty when not provided", () => {
    expect(searchSuggestions("crate", index).places).toEqual([]);
  });

  it("caps place results at 6", () => {
    const many: IndexPlace[] = Array.from({ length: 20 }, (_, n) => ({
      slug: `crate-${n}`, name: `Crate ${n}`, category: "loot-containers",
    }));
    expect(searchSuggestions("crate", index, many).places).toHaveLength(6);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/search.test.ts`
Expected: FAIL — `IndexPlace` not exported / `places` missing from results.

- [ ] **Step 3: Implement**

Replace the contents of `src/lib/search.ts` with:

```ts
import { ITEM_CATEGORIES, type Category } from "@/lib/taxonomy";

export interface IndexItem { slug: string; name: string; category: string; derivedName?: string | null }
/** A searchable environment entity (loot container or landmark). `category` is its env
 *  category slug, used to group it in the dropdown and pick its icon. */
export interface IndexPlace { slug: string; name: string; category: string }
export interface SearchIndex { items: IndexItem[]; places: IndexPlace[] }
export interface Suggestions { categories: Category[]; items: IndexItem[]; places: IndexPlace[] }

const ITEM_CAP = 8;
const PLACE_CAP = 6;

/** Case-insensitive substring match over category labels, item names (+derived names),
 *  and place names. Items and places are capped independently. */
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/search.test.ts`
Expected: PASS (all, including the new place tests).

- [ ] **Step 5: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/lib/search.ts src/lib/search.test.ts && git commit -F - <<'EOF'
feat(wiki): searchSuggestions returns matching places (landmarks/loot containers)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Index API returns `{ items, places }`

**Files:**
- Modify: `src/app/api/search-index/route.ts`

- [ ] **Step 1: Replace the route**

Replace the contents of `src/app/api/search-index/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Lightweight index for client-side search autocomplete: all items plus the
 *  environment entities (loot containers + landmarks) that get their own dropdown groups. */
export async function GET() {
  const [items, places] = await Promise.all([
    prisma.item.findMany({
      select: { slug: true, name: true, category: true, derivedName: true },
      orderBy: { name: "asc" },
    }),
    prisma.envEntity.findMany({
      where: { category: { in: ["loot-containers", "landmarks"] } },
      select: { slug: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return NextResponse.json({ items, places }, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/app/api/search-index/route.ts && git commit -F - <<'EOF'
feat(wiki): search index API returns items + places

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: SearchBox — combined index + grouped dropdown

**Files:**
- Modify: `src/components/SearchBox.tsx`

Replace the whole file (the dropdown is refactored from ad-hoc header detection to an
ordered groups model). Replace the entire contents of `src/components/SearchBox.tsx` with:

```tsx
"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CategoryIcon } from "@/components/CategoryIcon";
import { searchSuggestions, type SearchIndex, type Suggestions } from "@/lib/search";

const EMPTY: SearchIndex = { items: [], places: [] };

// Shared across all instances — fetch the index at most once per page load.
let indexPromise: Promise<SearchIndex> | null = null;
function loadIndex(): Promise<SearchIndex> {
  if (!indexPromise) {
    indexPromise = fetch("/api/search-index")
      .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : EMPTY))
      .catch(() => EMPTY);
  }
  return indexPromise;
}

interface Flat { kind: "category" | "item" | "place"; slug: string; label: string; category: string }
interface Group { header: string; options: Flat[] }

/** Ordered dropdown groups, each included only when it has matches:
 *  Categories → Items → Loot Containers → Landmarks. */
function buildGroups(s: Suggestions): Group[] {
  const groups: Group[] = [];
  if (s.categories.length) {
    groups.push({ header: "Categories", options: s.categories.map((c) => ({ kind: "category", slug: c.slug, label: c.label, category: c.slug })) });
  }
  if (s.items.length) {
    groups.push({ header: "Items", options: s.items.map((i) => ({ kind: "item", slug: i.slug, label: i.name, category: i.category })) });
  }
  const loot = s.places.filter((p) => p.category === "loot-containers");
  if (loot.length) {
    groups.push({ header: "Loot Containers", options: loot.map((p) => ({ kind: "place", slug: p.slug, label: p.name, category: p.category })) });
  }
  const land = s.places.filter((p) => p.category === "landmarks");
  if (land.length) {
    groups.push({ header: "Landmarks", options: land.map((p) => ({ kind: "place", slug: p.slug, label: p.name, category: p.category })) });
  }
  return groups;
}

export function SearchBox({ variant }: { variant: "navbar" | "hero" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState<SearchIndex>(EMPTY);
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

  const suggestions = query.trim()
    ? searchSuggestions(query, index.items, index.places)
    : { categories: [], items: [], places: [] };
  const groups = buildGroups(suggestions);
  const options = groups.flatMap((g) => g.options);
  const showList = open && options.length > 0;

  function ensureIndex() {
    if (index.items.length === 0 && index.places.length === 0) loadIndex().then(setIndex);
  }

  function navigate(f: Flat) {
    setOpen(false);
    setActive(-1);
    setQuery("");
    if (f.kind === "category") router.push(`/items?category=${f.slug}`);
    else if (f.kind === "place") router.push(`/environment/${f.slug}`);
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
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && active >= 0 && options[active]) navigate(options[active]);
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

  let idx = -1; // running global option index, for aria-activedescendant + nav

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
          {groups.map((g) => (
            <Fragment key={g.header}>
              <li role="presentation" className="px-2 pt-1 pb-0.5 text-xs uppercase tracking-wide text-base-content/50">
                {g.header}
              </li>
              {g.options.map((f) => {
                idx += 1;
                const i = idx;
                return (
                  <li
                    key={`${f.kind}-${f.slug}`}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={active === i}
                    className={`flex items-center gap-2 rounded px-2 py-1 text-sm cursor-pointer ${active === i ? "bg-base-300" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => { e.preventDefault(); navigate(f); }}
                  >
                    <CategoryIcon slug={f.category} className="size-4 shrink-0" />
                    {f.label}
                    <span className="ml-auto text-xs text-base-content/50" aria-hidden="true">
                      {f.kind === "category" ? "filter" : "page"}
                    </span>
                  </li>
                );
              })}
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/components/SearchBox.tsx && git commit -F - <<'EOF'
feat(wiki): suggest landmarks and loot containers in search dropdown

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: E2E — autocomplete navigates to an environment page

**Files:**
- Modify: `tests/e2e/wiki.spec.ts`

`weapon-crate` is a known loot container (`/environment/weapon-crate` is already used by
another test), so typing "Weapon Crate" is a deterministic fixture.

- [ ] **Step 1: Append the test**

Append to `tests/e2e/wiki.spec.ts` (after the existing tests):

```ts
test("autocomplete suggests a loot container and navigates to its environment page", async ({ page }) => {
  await page.goto("/items");
  const box = page.getByRole("navigation", { name: "Primary" }).getByRole("combobox");
  await box.fill("Weapon Crate");
  // The dropdown shows a dedicated "Loot Containers" group.
  await expect(page.getByText("Loot Containers", { exact: true })).toBeVisible();
  const option = page.getByRole("option", { name: /Weapon Crate/ });
  await option.click();
  await expect(page).toHaveURL(/\/environment\/weapon-crate/);
});
```

- [ ] **Step 2: Run it**

Run: `cd /d/Documents/SandLabs/sand-wiki && npx playwright test -g "autocomplete suggests a loot container"`
Expected: PASS. (Playwright config runs `next build && next start` against the dev DB; if the build cannot reach the DB, run `npm run build` to confirm compilation and report the live run is DB-gated.)

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add tests/e2e/wiki.spec.ts && git commit -F - <<'EOF'
test(wiki): e2e for loot-container search suggestion + navigation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Full verification + mark TODO #11 done

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Unit + lint**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm run test && npm run lint`
Expected: unit suite PASS (102 prior + the new search tests), lint clean.

- [ ] **Step 2: Full e2e (both-theme axe gate + new test)**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm run test:e2e`
Expected: all PASS, including axe in both themes (dropdown roles/`aria-activedescendant` unchanged). DB-gated — report if unreachable.

- [ ] **Step 3: Mark TODO #11 done**

In `TODO.md`, change:

```
- Add landmarks and loot containers to search auto fill
```

to:

```
- [x] Add landmarks and loot containers to search auto fill (separate dropdown groups → /environment/{slug})
```

- [ ] **Step 4: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add TODO.md && git commit -F - <<'EOF'
docs(wiki): mark TODO #11 (landmarks/loot containers in search) done

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Self-review notes

- **Spec coverage:** index API returns `{items, places}` (Task 2); `searchSuggestions` places result + cap (Task 1); SearchBox combined index + ordered groups (Categories → Items → Loot Containers → Landmarks) + place navigation to `/environment/{slug}` (Task 3); unit tests incl. empty-query shape change + place matching/cap/default (Task 1); e2e nav (Task 4); axe gate (Task 5). Scope limited to loot-containers + landmarks.
- **Type consistency:** `SearchIndex`/`IndexPlace`/`Suggestions.places` defined in Task 1 and consumed verbatim by Tasks 2–3; `searchSuggestions(query, items, places)` signature matches all call sites (test + SearchBox). `Flat.kind` adds `"place"`; navigation switch covers all three kinds.
- **Behavior preserved:** item/category matching, caps, free-text submit, keyboard nav over the flattened option list, and all ARIA attributes are unchanged; only the header rendering is refactored and place groups added.
- **No placeholders:** every step has full code or exact before/after text.
