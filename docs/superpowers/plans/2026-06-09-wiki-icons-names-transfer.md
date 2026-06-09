# Wiki Icons + Real Names Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the scraper's real localized item names/descriptions and matched icon sprites into the wiki — real names become the primary item name, descriptions populate detail pages, and matched icons replace the placeholder glyph everywhere items appear.

**Architecture:** One-time copy of the scraper's `out/` outputs into the wiki (`prisma/data.json`, `prisma/icons.json`, `public/icons/*.png`, all committed). A Prisma migration adds `Item.icon` + `Item.derivedName`. The seed maps `displayName → name` (derived name retained in `derivedName` for search), `description`, and an `icon` web path. `ItemIcon` becomes the single render swap from placeholder to `<img>`. Search (autocomplete + list filter) matches both `name` and `derivedName` so the descriptive old names stay discoverable.

**Tech Stack:** Next.js 16, Prisma 6 (Neon Postgres), TypeScript, Vitest, Playwright + axe, DaisyUI 5.

**Critical context for the executor:**
- Wiki app dir: `d:\Documents\SandLabs\sand-wiki` (on `master`). Run Node/npm via the **PowerShell** tool after a PATH refresh (Bash has no Node here). The scraper run uses its own `.venv` Python from its worktree.
- `sand-wiki/.env` must contain `DATABASE_URL` (Neon dev string) for seed/migrate/e2e. If missing, ask the user. `next build` works without it.
- After any schema change, `npx prisma generate` must run (migrate dev does this) or `tsc`/`next build` fail with a spurious implicit-`any` in `prisma/seed.ts`.
- Run a full `npm install` first if `node_modules` is partial (daisyui is a devDependency the Turbopack dev server needs).
- **Slugs never change** — they stay the scraper-derived identifiers, so all `/items/<slug>` URLs and recipe references remain stable even though displayed names change.
- All 123 items have a `displayName`; 115 differ from the derived `name`. Expect almost every visible name on the site to change.

---

### Task 1: Import scraper assets into the wiki

**Files:**
- Create: `sand-wiki/prisma/import-scraper-assets.mjs` (one-time importer; committed for reproducibility)
- Create (generated): `sand-wiki/prisma/icons.json`, `sand-wiki/public/icons/*.png`
- Modify (generated): `sand-wiki/prisma/data.json`

- [ ] **Step 1: Regenerate the scraper outputs with the completed overrides**

Run from the scraper worktree (PowerShell tool):
```
cd d:\Documents\SandLabs\.claude\worktrees\sand-scraper-impl\sand-scraper; .\.venv\Scripts\python -m sand_scraper --icons --validate
```
Expected: writes `out\data.json`, `out\icons.json`, `out\icons\*.png`; prints a validation summary. Note the reported item→icon match count (expected ~123/123). If the run fails (missing game data), stop and report.

- [ ] **Step 2: Write the importer script**

Create `sand-wiki/prisma/import-scraper-assets.mjs`:
```js
// One-time importer: copies the sand-scraper out/ snapshot into the wiki.
// Usage (from sand-wiki/):  node prisma/import-scraper-assets.mjs [outDir]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const OUT = process.argv[2] ?? join("..", ".claude", "worktrees", "sand-scraper-impl", "sand-scraper", "out");

// 1. data.json (items now carry displayName + description)
writeFileSync("prisma/data.json", readFileSync(join(OUT, "data.json"), "utf-8"));

// 2. icons.json (itemId -> "icons/icon_*.png"); keep next to the seed
const icons = JSON.parse(readFileSync(join(OUT, "icons.json"), "utf-8"));
writeFileSync("prisma/icons.json", JSON.stringify(icons, null, 2) + "\n");

// 3. copy only the matched PNGs into public/icons/
mkdirSync("public/icons", { recursive: true });
let n = 0;
for (const rel of Object.values(icons)) {
  copyFileSync(join(OUT, rel), join("public", "icons", basename(rel)));
  n++;
}
console.log(`Imported data.json + icons.json and ${n} icons.`);
```

- [ ] **Step 3: Run the importer**

Run (PowerShell tool, from `d:\Documents\SandLabs\sand-wiki`):
```
node prisma/import-scraper-assets.mjs
```
Expected: `Imported data.json + icons.json and <N> icons.` (N ≈ 123).

- [ ] **Step 4: Verify the imported data**

Run:
```
node -e "const d=require('./prisma/data.json'); const i=d.items.find(x=>x.slug==='c4-dynamite'); console.log(i.displayName, '|', !!i.description); const ic=require('./prisma/icons.json'); console.log('icons:', Object.keys(ic).length); console.log('png exists:', require('fs').existsSync('public/icons/'+require('path').basename(Object.values(ic)[0])));"
```
Expected: prints `Time Bomb | true`, an icon count near 123, and `png exists: true`.

- [ ] **Step 5: Commit**

```
git add sand-wiki/prisma/import-scraper-assets.mjs sand-wiki/prisma/data.json sand-wiki/prisma/icons.json sand-wiki/public/icons
git commit -m "feat(wiki): import scraper data.json, icons.json, and matched icon sprites"
```

---

### Task 2: Add `icon` and `derivedName` to the Item model

**Files:**
- Modify: `sand-wiki/prisma/schema.prisma` (Item model)
- Create (generated): `sand-wiki/prisma/migrations/<timestamp>_add_item_icon/migration.sql`

- [ ] **Step 1: Add the two nullable columns**

In `prisma/schema.prisma`, add to `model Item` (alongside `imageAlt`):
```prisma
  icon          String?
  derivedName   String?
```

- [ ] **Step 2: Create and apply the migration**

Run (PowerShell tool, from `sand-wiki`):
```
npx prisma migrate dev --name add_item_icon
```
Expected: creates `prisma/migrations/<timestamp>_add_item_icon/`, applies it to the Neon dev DB, and regenerates the Prisma client. (Additive nullable columns — no data loss, no reset, no consent prompt.)

- [ ] **Step 3: Verify the client picked up the fields**

Run:
```
npx tsc --noEmit
```
Expected: PASS (no errors). If it fails citing missing fields, re-run `npx prisma generate`.

- [ ] **Step 4: Commit**

```
git add sand-wiki/prisma/schema.prisma sand-wiki/prisma/migrations
git commit -m "feat(wiki): add Item.icon and Item.derivedName columns"
```

---

### Task 3: Seed real names, descriptions, derivedName, and icon paths

**Files:**
- Modify: `sand-wiki/prisma/seed.ts`

- [ ] **Step 1: Extend the ScrapItem interface and read the icon map**

In `prisma/seed.ts`, update the `ScrapItem` interface to add the new fields:
```ts
interface ScrapItem {
  slug: string; id: string; name: string; displayName?: string | null;
  description?: string | null; type: string | null;
  isResource: boolean; storageStack: number | null; workbenchTier: number | null; fromCatalog: boolean;
}
```

After `const data: ScrapData = JSON.parse(...)`, add the icon map (read the imported `icons.json`):
```ts
const iconRel: Record<string, string> = JSON.parse(
  readFileSync(join(__dirname, "icons.json"), "utf-8"),
);
const iconFor = (id: string): string | undefined => {
  const rel = iconRel[id];
  return rel ? "/icons/" + rel.split("/").pop() : undefined;
};
```

- [ ] **Step 2: Use the new fields when creating items**

Replace the `prisma.item.create({ data: {...} })` block inside the `for (const i of data.items)` loop with:
```ts
    await prisma.item.create({
      data: {
        slug: i.slug,
        name: i.displayName ?? i.name,
        derivedName: i.name,
        description: i.description ?? undefined,
        category, isResource: i.isResource,
        storageStack: i.storageStack ?? undefined, workbenchTier: i.workbenchTier ?? undefined,
        icon: iconFor(i.id),
      },
    });
```

- [ ] **Step 3: Run the seed**

Run (PowerShell tool, from `sand-wiki`):
```
npm run db:seed
```
Expected: `Seeded 123 items and 34 recipes.` with no errors.

- [ ] **Step 4: Verify seeded values**

Run:
```
node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.item.findUnique({where:{slug:'c4-dynamite'}}).then(i=>{console.log(i.name, '|', i.derivedName, '|', i.icon, '|', !!i.description); return p.$disconnect();});"
```
Expected: `Time Bomb | C4 Dynamite | /icons/icon_c4Dynamite.png | true` (icon filename may differ; key point: non-null `/icons/...`).

- [ ] **Step 5: Commit**

```
git add sand-wiki/prisma/seed.ts
git commit -m "feat(wiki): seed real names, descriptions, derivedName, and icon paths"
```

---

### Task 4: Thread `icon` through recipe line projection

**Files:**
- Modify: `sand-wiki/src/lib/recipes.ts`
- Test: `sand-wiki/src/lib/recipes.test.ts`

- [ ] **Step 1: Update the failing test**

In `src/lib/recipes.test.ts`, replace the `recipe` fixture and the expectation to include `icon`:
```ts
const recipe: RecipeWithItems = {
  slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2,
  inputs: [{ amount: 5, item: { slug: "scraps", name: "Scraps", icon: null } }],
  outputs: [{ amount: 1, item: { slug: "fabric", name: "Fabric", icon: "/icons/icon_fabric.png" } }],
};

describe("toRecipeCard", () => {
  it("flattens a recipe into display rows, carrying each item's icon", () => {
    expect(toRecipeCard(recipe)).toEqual({
      slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2,
      inputs: [{ slug: "scraps", name: "Scraps", icon: null, amount: 5 }],
      outputs: [{ slug: "fabric", name: "Fabric", icon: "/icons/icon_fabric.png", amount: 1 }],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/recipes.test.ts`
Expected: FAIL (type error / missing `icon` in output).

- [ ] **Step 3: Add `icon` to the types and the `row` mapper**

In `src/lib/recipes.ts`:
```ts
export interface RecipeLineItem { slug: string; name: string; icon: string | null }
```
```ts
export interface RecipeCardRow { slug: string; name: string; icon: string | null; amount: number }
```
```ts
const row = (l: RecipeLine): RecipeCardRow => ({ slug: l.item.slug, name: l.item.name, icon: l.item.icon, amount: l.amount });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add sand-wiki/src/lib/recipes.ts sand-wiki/src/lib/recipes.test.ts
git commit -m "feat(wiki): carry item icon through recipe line rows"
```

---

### Task 5: Match `derivedName` in the autocomplete search

**Files:**
- Modify: `sand-wiki/src/lib/search.ts`
- Modify: `sand-wiki/src/app/api/search-index/route.ts`
- Test: `sand-wiki/src/lib/search.test.ts`

- [ ] **Step 1: Add a failing test for derivedName matching**

In `src/lib/search.test.ts`, update the index fixture to carry `derivedName` and add a test:
```ts
const index: IndexItem[] = [
  { slug: "sniper-rifle", name: "1874s Petros Sniper Rifle", category: "guns", derivedName: "Sniper Rifle" },
  { slug: "pistol-ammo", name: "8x21 mm Ammo", category: "ammo", derivedName: "Pistol Ammo" },
  { slug: "energy-bar", name: "NZ Mk2 Energy Rod", category: "medical", derivedName: "Energy Bar" },
];
```
```ts
  it("matches the derived name even when the display name does not contain the query", () => {
    const r = searchSuggestions("sniper rifle", index);
    expect(r.items.map((i) => i.slug)).toEqual(["sniper-rifle"]);
  });

  it("still displays the real name in suggestions", () => {
    const r = searchSuggestions("sniper rifle", index);
    expect(r.items[0].name).toBe("1874s Petros Sniper Rifle");
  });
```
The existing `"matches item names case-insensitively"` test uses `searchSuggestions("rifle", index)` — update its expectation to `["sniper-rifle"]` (still the only match: display name "1874s Petros Sniper Rifle" contains "rifle").

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/search.test.ts`
Expected: FAIL on the derivedName test (and a type error: `derivedName` not on `IndexItem`).

- [ ] **Step 3: Implement dual-field matching**

In `src/lib/search.ts`:
```ts
export interface IndexItem { slug: string; name: string; category: string; derivedName?: string | null }
```
Update the items filter inside `searchSuggestions`:
```ts
  const items = index
    .filter((i) => i.name.toLowerCase().includes(q) || (i.derivedName ?? "").toLowerCase().includes(q))
    .slice(0, ITEM_CAP);
```

- [ ] **Step 4: Include derivedName in the search-index route**

In `src/app/api/search-index/route.ts`, extend the select:
```ts
    select: { slug: true, name: true, category: true, derivedName: true },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/search.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```
git add sand-wiki/src/lib/search.ts sand-wiki/src/lib/search.test.ts sand-wiki/src/app/api/search-index/route.ts
git commit -m "feat(wiki): match derived item names in search autocomplete"
```

---

### Task 6: Match `derivedName` in the items-list query filter

**Files:**
- Modify: `sand-wiki/src/lib/item-filter.ts`
- Test: `sand-wiki/src/lib/item-filter.test.ts`

- [ ] **Step 1: Update the failing test**

In `src/lib/item-filter.test.ts`, replace the name-filter test:
```ts
  it("filters by name OR derivedName (case-insensitive) and category", () => {
    expect(buildItemQuery({ query: "rifle", category: "guns" }).where).toEqual({
      OR: [
        { name: { contains: "rifle", mode: "insensitive" } },
        { derivedName: { contains: "rifle", mode: "insensitive" } },
      ],
      category: "guns",
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/item-filter.test.ts`
Expected: FAIL (where still uses `name` only).

- [ ] **Step 3: Implement OR matching**

In `src/lib/item-filter.ts`, replace the query line:
```ts
  if (filter.query)
    where.OR = [
      { name: { contains: filter.query, mode: "insensitive" } },
      { derivedName: { contains: filter.query, mode: "insensitive" } },
    ];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/item-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add sand-wiki/src/lib/item-filter.ts sand-wiki/src/lib/item-filter.test.ts
git commit -m "feat(wiki): match derived names in items-list query filter"
```

---

### Task 7: Render real icons in `ItemIcon`

**Files:**
- Modify: `sand-wiki/src/components/ItemIcon.tsx`

- [ ] **Step 1: Add the `icon` prop and `<img>` branch**

Replace the entire `src/components/ItemIcon.tsx` with:
```tsx
/** Item image. When `icon` is set, render the sprite; otherwise a placeholder glyph.
 *  This is the single change point for item imagery. */
export function ItemIcon({
  name,
  icon,
  size = "md",
}: {
  name: string;
  icon?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const px = { sm: "size-5", md: "size-12", lg: "size-28" }[size];
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt={name}
        title={name}
        className={`${px} rounded-box bg-base-300 object-contain shrink-0`}
      />
    );
  }
  return (
    <span
      className={`${px} inline-flex items-center justify-center rounded-box bg-base-300 text-base-content/40 shrink-0`}
      role="img"
      aria-label={name}
      title={name}
    >
      <span aria-hidden="true">▦</span>
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (call sites that pass only `name` remain valid since `icon` is optional).

- [ ] **Step 3: Commit**

```
git add sand-wiki/src/components/ItemIcon.tsx
git commit -m "feat(wiki): render real item sprite in ItemIcon when available"
```

---

### Task 8: Pass `icon` into every ItemIcon call site

**Files:**
- Modify: `sand-wiki/src/components/recipe-cells.tsx`
- Modify: `sand-wiki/src/app/items/[slug]/page.tsx`
- Modify: `sand-wiki/src/components/ItemCard.tsx`
- Modify: `sand-wiki/src/app/items/page.tsx`

- [ ] **Step 1: Recipe table cells**

In `src/components/recipe-cells.tsx`, update the `ItemIcon` in `IngredientList`:
```tsx
          <ItemIcon name={r.name} icon={r.icon} size="sm" />
```
(`r` is a `RecipeCardRow`, which now has `icon` from Task 4.)

- [ ] **Step 2: Item detail header**

In `src/app/items/[slug]/page.tsx`, update the header icon (the `getItemBySlug` result includes the `icon` scalar automatically):
```tsx
        <ItemIcon name={item.name} icon={item.icon} size="lg" />
```

- [ ] **Step 3: Item grid card — add the icon**

In `src/components/ItemCard.tsx`, import the component and add `icon` to the data shape, rendering it before the name:
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
      <Link href={`/items/${item.slug}`} className="card bg-base-200 hover:bg-base-300 transition-colors h-full">
        <div className="card-body p-4">
          <div className="flex items-center gap-2">
            <ItemIcon name={item.name} icon={item.icon} size="sm" />
            <span className="font-medium">{item.name}</span>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <CategoryTag slug={item.category} size="sm" />
            {item.workbenchTier !== null && (
              <span className="badge badge-ghost badge-sm">Tier {item.workbenchTier}</span>
            )}
            {item.buyable && (
              <span className="badge badge-success badge-sm" aria-label="Buyable">◈ Buy</span>
            )}
            {item.sellable && (
              <span className="badge badge-warning badge-sm" aria-label="Sellable">◈ Sell</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
```

- [ ] **Step 4: Pass `icon` from the items list page**

In `src/app/items/page.tsx`, add `icon` to the `ItemCard` data:
```tsx
              item={{
                slug: i.slug, name: i.name, icon: i.icon, category: i.category, workbenchTier: i.workbenchTier,
                buyable: tradeFlags.buyable.has(i.slug),
                sellable: tradeFlags.sellable.has(i.slug),
              }}
```
(`i` comes from `listItems`, which selects all scalar fields including `icon`.)

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit; if ($?) { npm run lint }`
Expected: tsc PASS; eslint PASS (a single `no-img-element` line is disabled in ItemIcon).

- [ ] **Step 6: Commit**

```
git add sand-wiki/src/components/recipe-cells.tsx "sand-wiki/src/app/items/[slug]/page.tsx" sand-wiki/src/components/ItemCard.tsx sand-wiki/src/app/items/page.tsx
git commit -m "feat(wiki): show item icons on cards, detail header, and recipe tables"
```

---

### Task 9: Update e2e assertions for real names + assert icons render

**Files:**
- Modify: `sand-wiki/tests/e2e/wiki.spec.ts`

The display name of every referenced item now changes. Update the literal-name assertions to the real names and add an icon check. Real names (from the seed): `sniper-rifle-iron-sights-silencer` → "1874e/sd Petros Rifle (Silenced)"; `sniper-rifle-silencer` → "1874s/sd Petros Sniper Rifle (Silenced)"; `resource-metal-parts` → "Scrap Metal".

- [ ] **Step 1: Update the item-detail heading assertion**

In the test `"item detail shows Crafted by and Used in tabs with tables"`:
```ts
  await expect(page.getByRole("heading", { name: "1874e/sd Petros Rifle (Silenced)" })).toBeVisible();
```

- [ ] **Step 2: Update the resource-detail heading assertion**

In the test `"resource detail exposes a Used in tab"`:
```ts
  await expect(page.getByRole("heading", { name: "Scrap Metal" })).toBeVisible();
```

- [ ] **Step 3: Update the autocomplete test to type the derived name and click the real name**

In the test `"autocomplete suggests an item and navigates to its page"` — keep typing the derived name (exercises derivedName matching), but the rendered option is the real name:
```ts
  await box.fill("Sniper Rifle Silencer");
  const option = page.getByRole("option", { name: "1874s/sd Petros Sniper Rifle (Silenced)", exact: true });
  await option.click();
  await expect(page).toHaveURL(/\/items\/sniper-rifle-silencer/);
```

- [ ] **Step 4: Add an icon-render assertion**

Append a new test (uses `c4-dynamite`, which has a matched icon):
```ts
test("item detail shows a real sprite image", async ({ page }) => {
  await page.goto("/items/c4-dynamite");
  const img = page.getByRole("img", { name: "Time Bomb" });
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("src", /^\/icons\/.+\.png$/);
});
```

- [ ] **Step 5: Run the e2e suite**

Run (PowerShell tool, from `sand-wiki`, requires `.env` + dev server / Playwright config):
```
npm run test:e2e
```
Expected: all tests PASS (including the new icon test and both-theme axe checks).

- [ ] **Step 6: Commit**

```
git add sand-wiki/tests/e2e/wiki.spec.ts
git commit -m "test(wiki): update e2e for real item names and assert icon rendering"
```

---

### Task 10: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Regenerate client and re-seed (clean state)**

Run (PowerShell tool, from `sand-wiki`):
```
npx prisma generate; if ($?) { npm run db:seed }
```
Expected: `Seeded 123 items and 34 recipes.`

- [ ] **Step 2: Unit tests**

Run: `npm test`
Expected: all vitest suites PASS.

- [ ] **Step 3: Types + lint**

Run: `npx tsc --noEmit; if ($?) { npm run lint }`
Expected: both PASS.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: e2e + axe (both themes)**

Run: `npm run test:e2e`
Expected: all PASS, no serious/critical a11y violations in either theme.

- [ ] **Step 6: Final commit (if any uncommitted verification fixups)**

```
git add -A
git commit -m "chore(wiki): icons + names transfer verification fixups"
```
(Skip if nothing changed.)

---

## Self-Review

**Spec coverage:**
- Regenerate scraper outputs (spec §Source data) → Task 1 Step 1. ✓
- Copy data.json + matched PNGs, committed (§2) → Task 1. ✓
- `icon` + `derivedName` migration (§3) → Task 2. ✓
- Seed: name=displayName??derived, derivedName, description, icon (§3) → Task 3. ✓
- ItemIcon `<img>` swap (§4) → Task 7. ✓
- Icons threaded to detail / recipe tables / grid cards (§4, user confirm) → Tasks 4, 8. ✓
- Dual-field search: index route + searchSuggestions (§5) → Task 5; list-filter parity → Task 6. ✓
- Verification gate incl. axe both themes (§6) → Tasks 9, 10. ✓

**Placeholder scan:** No TBD/TODO; all code shown in full. ✓

**Type consistency:** `RecipeLineItem`/`RecipeCardRow` gain `icon: string | null` (Task 4) and are consumed in `recipe-cells.tsx` (Task 8). `IndexItem.derivedName?: string | null` (Task 5) matches the route select and test fixtures. `ItemCardData.icon?: string | null` (Task 8) matches the `item.icon` source. Seed `iconFor` returns `string | undefined`, assigned to optional Prisma `icon`. ✓

**Note on display-name renames:** Making `displayName` primary renames ~115 items site-wide; only the three e2e literal-name assertions (Task 9) and the dual-field search (Tasks 5–6) depend on the old names, and all are handled.
