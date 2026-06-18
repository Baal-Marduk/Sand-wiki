# Trampler Category Sidebar + Player Gear Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a category sidebar to the trampler part-list view and seed five wiki-authored Player Gear items (Binoculars, Flashlight, Multitool, Map, Flare Gun) into the `tools` item category with descriptions and icons.

**Architecture:** Part 1 generalizes the existing `CategoryQuickNav` component with a `basePath` prop and reuses it on the tramplers page. Part 2 introduces `prisma/gear.json` as a wiki-authored item source that the seed merges into the scraped item list, with category mapping via `CATEGORY_OVERRIDES` and icons via the existing `icons.json` mechanism.

**Tech Stack:** Next.js (App Router), Prisma 6, TypeScript, Vitest, Tailwind/DaisyUI.

**Repo note:** All paths below are relative to `sand-wiki/` unless prefixed otherwise. Run commands from `sand-wiki/`. The five gear sprites live in the sibling worktree at `../.claude/worktrees/sand-scraper-impl/sand-scraper/out/icons/` (referenced as `$SPRITES` below).

---

## Part 1 — Trampler category sidebar

### Task 1: Add `basePath` to `CategoryQuickNav` via an extracted href helper

**Files:**
- Modify: `src/components/CategoryQuickNav.tsx`
- Test: `src/components/CategoryQuickNav.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/CategoryQuickNav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { categoryNavHref } from "./CategoryQuickNav";

describe("categoryNavHref", () => {
  it("defaults to a bare category link", () => {
    expect(categoryNavHref("/items", "weapons")).toBe("/items?category=weapons");
  });

  it("appends q and sort when provided", () => {
    expect(categoryNavHref("/items", "weapons", { query: "rifle scope", sort: "name" }))
      .toBe("/items?category=weapons&q=rifle+scope&sort=name");
  });

  it("supports an alternate base path", () => {
    expect(categoryNavHref("/tramplers", "chassis")).toBe("/tramplers?category=chassis");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CategoryQuickNav.test.ts`
Expected: FAIL — `categoryNavHref` is not exported.

- [ ] **Step 3: Implement the helper and use it in the component**

In `src/components/CategoryQuickNav.tsx`, add the exported helper above the component and add a `basePath` prop (default `/items`). Replace the inline `href` closure with a call to the helper.

Add near the top (after imports):

```tsx
/** Build a category-switch link. `q`/`sort` are preserved only when present. */
export function categoryNavHref(
  basePath: string,
  slug: string,
  opts: { query?: string; sort?: string } = {},
): string {
  const params = new URLSearchParams({ category: slug });
  if (opts.query) params.set("q", opts.query);
  if (opts.sort) params.set("sort", opts.sort);
  return `${basePath}?${params.toString()}`;
}
```

Change the component signature and the `href` line:

```tsx
export function CategoryQuickNav({
  categories, current, query, sort, basePath = "/items",
}: { categories: Category[]; current?: string; query?: string; sort?: string; basePath?: string }) {
  const href = (slug: string) => categoryNavHref(basePath, slug, { query, sort });
```

Leave the rest of the component (markup, styling) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/CategoryQuickNav.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/CategoryQuickNav.tsx src/components/CategoryQuickNav.test.ts
git commit -m "refactor(wiki): add basePath to CategoryQuickNav via href helper"
```

---

### Task 2: Render the sidebar on the trampler part-list view

**Files:**
- Modify: `src/app/tramplers/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/app/tramplers/page.tsx`, add to the existing imports:

```tsx
import { CategoryQuickNav } from "@/components/CategoryQuickNav";
import { TRAMPLER_CATEGORIES } from "@/lib/taxonomy";
```

(`getSection`, `isTramplerCategory`, `CategoryIcon`, query helpers, and `TramplerCard` are already imported.)

- [ ] **Step 2: Wrap the part-list return in the two-column layout**

Replace the entire `return` block of the `const parts = await listTramplerParts(category);` branch (the second `return`, currently the `<section>` containing the `<h1>` and the parts grid / empty-state) with:

```tsx
  const parts = await listTramplerParts(category);
  return (
    <section className="py-6">
      <h1 className="font-display text-2xl font-bold mb-4">{labelOf(category)}</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_220px] items-start">
        <div className="min-w-0 order-2 lg:order-1">
          {parts.length === 0 ? (
            <div role="alert" className="alert alert-warning max-w-2xl">
              <span>Coming soon — no entries yet for this category.</span>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {parts.map((p) => (
                <TramplerCard
                  key={p.id}
                  part={{ slug: p.slug, name: p.name, icon: p.icon, dimensions: p.dimensions, researchTier: p.researchTier }}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="order-1 lg:order-2">
          <CategoryQuickNav categories={TRAMPLER_CATEGORIES} current={category} basePath="/tramplers" />
        </div>
      </div>
    </section>
  );
```

(The landing-view branch — `if (!category) { … }` — is unchanged.)

- [ ] **Step 3: Verify the build/typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, open `http://localhost:3000/tramplers?category=chassis`.
Expected: a category sidebar (right on desktop, chips on mobile) listing all nine trampler categories with `chassis` highlighted; clicking another category navigates to its part list. The landing page `/tramplers` is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/tramplers/page.tsx
git commit -m "feat(wiki): category sidebar on trampler part-list view"
```

---

## Part 2 — Player Gear tools

### Task 3: Add the five gear icons

**Files:**
- Create: `public/icons/icon_item_binocular.png`, `public/icons/icon_flashlight_on.png`, `public/icons/icon_multiTool.png`, `public/icons/icon_tool_map.png`, `public/icons/icon_tool_flaregun.png`
- Modify: `prisma/icons.json`

- [ ] **Step 1: Copy the sprites into `public/icons/`**

Run from `sand-wiki/` (PowerShell):

```powershell
$src = "..\.claude\worktrees\sand-scraper-impl\sand-scraper\out\icons"
foreach ($f in "icon_item_binocular.png","icon_flashlight_on.png","icon_multiTool.png","icon_tool_map.png","icon_tool_flaregun.png") {
  Copy-Item "$src\$f" "public\icons\$f"
}
```

- [ ] **Step 2: Verify the five files exist**

Run: `ls public/icons/icon_item_binocular.png public/icons/icon_flashlight_on.png public/icons/icon_multiTool.png public/icons/icon_tool_map.png public/icons/icon_tool_flaregun.png`
Expected: all five listed.

- [ ] **Step 3: Add `id → path` entries to `prisma/icons.json`**

`icons.json` is a flat JSON object keyed by item `id`. Add these five keys (alongside the existing entries — JSON object, order doesn't matter):

```json
  "item_binocular": "icons/icon_item_binocular.png",
  "item_lamp": "icons/icon_flashlight_on.png",
  "item_multiTool": "icons/icon_multiTool.png",
  "item_map": "icons/icon_tool_map.png",
  "item_flareGun": "icons/icon_tool_flaregun.png"
```

- [ ] **Step 4: Verify the JSON parses and has 129 entries**

Run: `node -e "const d=require('./prisma/icons.json');console.log(Object.keys(d).length, d.item_binocular, d.item_flareGun)"`
Expected: `129 icons/icon_item_binocular.png icons/icon_tool_flaregun.png`

- [ ] **Step 5: Commit**

```bash
git add public/icons/icon_item_binocular.png public/icons/icon_flashlight_on.png public/icons/icon_multiTool.png public/icons/icon_tool_map.png public/icons/icon_tool_flaregun.png prisma/icons.json
git commit -m "feat(wiki): add Player Gear tool icons + icons.json mappings"
```

---

### Task 4: Create `prisma/gear.json`

**Files:**
- Create: `prisma/gear.json`

- [ ] **Step 1: Write the gear data file**

Create `prisma/gear.json` with the five items. Descriptions are the cleaned wiki prose from the spec.

```json
[
  {
    "slug": "binoculars",
    "id": "item_binocular",
    "name": "Binoculars",
    "description": "The Binoculars are one of the pieces of Player Gear carried by all explorers of Sophie. They can be used to see across far distances and are useful for scouting out locations as well as keeping a lookout for other players and Tramplers.",
    "type": null,
    "isResource": false,
    "storageStack": null,
    "workbenchTier": null,
    "fromCatalog": false
  },
  {
    "slug": "flashlight",
    "id": "item_lamp",
    "name": "Flashlight",
    "description": "The Lamp is one of the pieces of Player Gear carried by all explorers of Sophie. It can be toggled on and off by clicking on the item inside the player's inventory. When on, the lamp provides limited illumination in front of the player, which can be useful during the night when visibility is poor. Note: other players are able to see the illumination provided by your lamp, so keep an eye on your surroundings.",
    "type": null,
    "isResource": false,
    "storageStack": null,
    "workbenchTier": null,
    "fromCatalog": false
  },
  {
    "slug": "multitool",
    "id": "item_multiTool",
    "name": "Multitool",
    "description": "The Repair Tool, or Multitool, is one of the pieces of Player Gear carried by all explorers of Sophie. It can be used in or out of battle to quickly repair damage to doors, compartments, pipes, and hatches on your Trampler.",
    "type": null,
    "isResource": false,
    "storageStack": null,
    "workbenchTier": null,
    "fromCatalog": false
  },
  {
    "slug": "map",
    "id": "item_map",
    "name": "Map",
    "description": "The Map is one of the pieces of Player Gear carried by all explorers of Sophie; Tramplers also come equipped with a map mounted to the central steering column of the steering deck. The map takes the form of old nautical charts from back when Sophie still had liquid water on its surface. As this is no longer the case, maps now contain little useful information beyond the locations of Landmarks such as ports and military forts — the rest is out of date, shrouded in a fog of war. As the player traverses the dried-up sea floors of Sophie they slowly fill in the chart to reflect the land's new topography, and updates are reflected across both the player's personal map and the map of any Trampler they own. Because landmarks and terrain are randomly generated for each lobby, any progress filling in a map is lost upon extraction; every expedition begins with a fresh map obscured by fog of war, except for the player's immediate surroundings at spawn.",
    "type": null,
    "isResource": false,
    "storageStack": null,
    "workbenchTier": null,
    "fromCatalog": false
  },
  {
    "slug": "flare-gun",
    "id": "item_flareGun",
    "name": "Flare Gun",
    "description": "The Flare Gun is one of the pieces of Player Gear carried by all explorers of Sophie. It is able to shoot colored flares high into the sky, where they burst into a colored cloud depending on the flare that is loaded. Flares deal no damage and do not burst unless shot upwards, although they leave a smaller smoke trail of their color in their wake regardless of how they are fired. Flares are useful for signaling to teammates and other Tramplers.",
    "type": null,
    "isResource": false,
    "storageStack": null,
    "workbenchTier": null,
    "fromCatalog": false
  }
]
```

- [ ] **Step 2: Verify it parses and has 5 entries**

Run: `node -e "const g=require('./prisma/gear.json');console.log(g.length, g.map(x=>x.slug).join(','))"`
Expected: `5 binoculars,flashlight,multitool,map,flare-gun`

- [ ] **Step 3: Commit**

```bash
git add prisma/gear.json
git commit -m "feat(wiki): wiki-authored Player Gear item data"
```

---

### Task 5: Map the gear slugs to the `tools` category

**Files:**
- Modify: `src/lib/taxonomy.ts` (the `CATEGORY_OVERRIDES` object, ~line 155)
- Test: `src/lib/taxonomy.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/taxonomy.test.ts`, inside the existing `describe("categoryForItem", …)` block, add:

```ts
  it("maps Player Gear slugs to tools", () => {
    expect(categoryForItem(null, "Binoculars", "binoculars")).toBe("tools");
    expect(categoryForItem(null, "Flashlight", "flashlight")).toBe("tools");
    expect(categoryForItem(null, "Multitool", "multitool")).toBe("tools");
    expect(categoryForItem(null, "Map", "map")).toBe("tools");
    expect(categoryForItem(null, "Flare Gun", "flare-gun")).toBe("tools");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/taxonomy.test.ts`
Expected: FAIL — these currently resolve to `misc`.

- [ ] **Step 3: Add the overrides**

In `src/lib/taxonomy.ts`, extend the `CATEGORY_OVERRIDES` object with five entries:

```ts
  binoculars: "tools", // Player Gear — no game type
  flashlight: "tools", // Player Gear (wiki: Lamp)
  multitool: "tools", // Player Gear (wiki: Repair Tool)
  map: "tools", // Player Gear
  "flare-gun": "tools", // Player Gear
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/taxonomy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxonomy.ts src/lib/taxonomy.test.ts
git commit -m "feat(wiki): map Player Gear slugs to the tools category"
```

---

### Task 6: Merge `gear.json` into the seed item list

**Files:**
- Modify: `prisma/seed-transform.ts` (add `mergeItems`)
- Modify: `prisma/seed-transform.test.ts`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Write the failing test for `mergeItems`**

In `prisma/seed-transform.test.ts`, add (and add `mergeItems` to the import from `./seed-transform`):

```ts
import { flattenStats, lootToTiers, costToRows, mergeItems } from "./seed-transform";

describe("mergeItems", () => {
  it("concatenates gear after scraped items", () => {
    const scraped = [{ slug: "a" }, { slug: "b" }];
    const gear = [{ slug: "c" }];
    expect(mergeItems(scraped, gear).map((i) => i.slug)).toEqual(["a", "b", "c"]);
  });

  it("throws when a gear slug collides with a scraped slug", () => {
    expect(() => mergeItems([{ slug: "a" }], [{ slug: "a" }]))
      .toThrow(/collides/);
  });
});
```

(Leave the existing `import` line in place — replace it with the one above that adds `mergeItems`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/seed-transform.test.ts`
Expected: FAIL — `mergeItems` is not exported.

- [ ] **Step 3: Implement `mergeItems`**

At the end of `prisma/seed-transform.ts`, add:

```ts
/** Merge wiki-authored gear items after the scraped items. Throws if a gear slug
 *  collides with a scraped slug, so a duplicate can't silently shadow scraped data. */
export function mergeItems<T extends { slug: string }>(scraped: T[], gear: T[]): T[] {
  const seen = new Set(scraped.map((i) => i.slug));
  for (const g of gear) {
    if (seen.has(g.slug)) throw new Error(`Gear item slug "${g.slug}" collides with a scraped item`);
    seen.add(g.slug);
  }
  return [...scraped, ...gear];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run prisma/seed-transform.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `mergeItems` into `seed.ts`**

In `prisma/seed.ts`:

1. Add `mergeItems` to the existing import from `./seed-transform`:

```ts
import { flattenStats, lootToTiers, costToRows, mergeItems, type RawStats, type RawLoot, type RawCostLine } from "./seed-transform";
```

2. Immediately after the `const data: ScrapData = JSON.parse(...)` line (~line 43), read and merge the gear file:

```ts
  const gear: ScrapItem[] = JSON.parse(
    readFileSync(join(__dirname, "gear.json"), "utf-8"),
  );
  const items = mergeItems(data.items, gear);
```

3. Replace the three `data.items` references with `items`:
   - The item upsert loop header: `for (const i of items) {`
   - The prune set: `where: { slug: { notIn: items.map((i) => i.slug) } }`
   - The final count assertion: `if (itemCount !== items.length) throw new Error(\`Item count mismatch after seed: DB has ${itemCount}, snapshot has ${items.length} (duplicate slugs?)\`);`
   - The success log line: `console.log(\`Seeded ${items.length} items, ...\`)`

   (`idBySlug`, recipes, env, and tramplers logic are unchanged.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add prisma/seed-transform.ts prisma/seed-transform.test.ts prisma/seed.ts
git commit -m "feat(wiki): merge gear.json into the seed item list"
```

---

### Task 7: Seed and verify end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Run the seed against the dev DB**

Run: `npx prisma db seed`
Expected: completes without error; the final log reports an item count five higher than before (no count-mismatch throw, no "does not resolve to an item" warnings for the gear).

- [ ] **Step 2: Confirm the five items are categorized as tools**

Run:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.item.findMany({where:{slug:{in:['binoculars','flashlight','multitool','map','flare-gun']}},select:{slug:true,category:true,icon:true,description:true}}).then(r=>{console.log(JSON.stringify(r,null,2));return p.\$disconnect()})"
```

Expected: five rows, each with `category: "tools"`, a non-null `icon` (`/icons/icon_...png`), and the description text.

- [ ] **Step 3: Manual check in the app**

Run: `npm run dev`, open `http://localhost:3000/items?category=tools`.
Expected: Binoculars, Flashlight, Multitool, Map, and Flare Gun appear with their icons. Click each (e.g. `/items/flare-gun`) and confirm the description renders on the detail page.

- [ ] **Step 4: No commit** (verification only). If the seed surfaced a data issue, fix it in the relevant prior task's file and re-run.

---

## Self-Review Notes

- **Spec coverage:** Sidebar (Tasks 1–2), gear icons (Task 3), gear data + descriptions (Task 4), tools category mapping (Task 5), seed merge with prune/count guards preserved (Task 6), verification (Task 7). All spec sections covered.
- **Type consistency:** `categoryNavHref(basePath, slug, opts)` and `mergeItems<T extends {slug}>(scraped, gear)` are used with matching signatures across tasks. `icons.json` keys (`item_binocular`, `item_lamp`, `item_multiTool`, `item_map`, `item_flareGun`) match the `id` values in `gear.json`. Slugs (`binoculars`, `flashlight`, `multitool`, `map`, `flare-gun`) match between `gear.json` and the `CATEGORY_OVERRIDES`.
- **Out of scope (per spec):** Tools top-level section stays a placeholder; no flare-color sub-items, recipes, or stats; no sidebar on the trampler landing view.
