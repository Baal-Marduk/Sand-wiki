# Wiki Real-Data Revision — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **HANDOFF PLAN.** This is executed by the **sand-wiki effort** inside the wiki project
> (`sand-wiki/`, branch `build/sand-wiki-impl`), NOT by the scraper session. All paths below are
> relative to the wiki project root `sand-wiki/`. Commands run from there.

**Goal:** Revise the wiki's data model, seed, data-access, and item/tech pages to consume the scraper's real `{items, recipes}` dataset — a proper multi-input/multi-output Recipe model, a `type→category` mapping, and the tech tree demoted to a placeholder (no data exists).

**Architecture:** Prisma gains `Recipe`/`RecipeInput`/`RecipeOutput` and loses the `TechNode` family; the seed reads the scraper `data.json`; the item detail page shows "Crafted by" / "Used in" recipe lists; `/tech` becomes a placeholder section.

**Tech Stack:** Next.js (App Router, TS), Prisma + PostgreSQL, DaisyUI/Tailwind, Vitest (unit), Playwright + axe (e2e).

**Source spec:** `docs/superpowers/specs/2026-06-09-wiki-real-data-design.md`
**Data shape + findings:** `docs/superpowers/findings/2026-06-08-sand-bundle-schema.md`

---

## File Structure

```
sand-wiki/
  prisma/
    schema.prisma            # revised models                         (Task 2)
    seed.ts                  # rewritten to read scraper data.json     (Task 5)
    data.json                # committed scraper snapshot (real data)  (Task 5)
    migrations/…             # new migration                           (Task 2)
  src/lib/
    taxonomy.ts              # + type→category map (Task 1); tech kind  (Task 6)
    taxonomy.test.ts         # + mapping tests                          (Task 1)
    item-filter.ts           # workbenchTier filter/sort                (Task 3)
    item-filter.test.ts      # updated                                  (Task 3)
    queries.ts               # producedBy/usedIn; drop tech queries     (Task 4)
    recipes.ts               # pure "crafted by / used in" shaping      (Task 4)
    recipes.test.ts                                                     (Task 4)
    tech-tree.ts / .test.ts  # DELETED                                  (Task 6)
  src/app/
    items/page.tsx           # filter by category + tier                (Task 5? UI)→(Task 7)
    items/[slug]/page.tsx    # Crafted by / Used in                      (Task 7)
    tech/page.tsx            # placeholder                               (Task 6)
```

**Sequencing note:** Task 2 (schema) intentionally breaks TypeScript compilation in `queries.ts` and
the tech page until Tasks 4 and 6 update them. Do Tasks 2→3→4→5→6→7 in order; the build is green again
by the end of Task 6 and verified in Task 8.

---

## Task 1: `type → category` mapping (pure, TDD)

**Files:**
- Modify: `src/lib/taxonomy.ts`
- Modify: `src/lib/taxonomy.test.ts`

- [ ] **Step 1: Add the failing test** to `src/lib/taxonomy.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { categoryForType } from "./taxonomy";

describe("categoryForType", () => {
  it("maps known game types to wiki categories", () => {
    expect(categoryForType("WEAPON")).toBe("guns");
    expect(categoryForType("WEAPON_BELT")).toBe("guns");
    expect(categoryForType("AMMO")).toBe("ammo");
    expect(categoryForType("TURRET_AMMO")).toBe("ammo");
    expect(categoryForType("RESOURCE_T1")).toBe("resources");
    expect(categoryForType("RESOURCE_T3")).toBe("resources");
    expect(categoryForType("ENERGY")).toBe("resources");
    expect(categoryForType("ARMOR")).toBe("attire");
    expect(categoryForType("BACKPACK")).toBe("attire");
    expect(categoryForType("ATTACK_CONSUMABLE")).toBe("weapons");
    expect(categoryForType("RAID_EXPLOSIVES")).toBe("weapons");
    expect(categoryForType("UTILITY_CONSUMABLE")).toBe("tools");
    expect(categoryForType("FOOD")).toBe("medical");
    expect(categoryForType("KEY")).toBe("misc");
    expect(categoryForType("MONEY")).toBe("misc");
    expect(categoryForType("LARGE_VALUABLE")).toBe("misc");
    expect(categoryForType("SMALL_VALUABLE")).toBe("misc");
  });

  it("maps null/unknown types to misc", () => {
    expect(categoryForType(null)).toBe("misc");
    expect(categoryForType("SOME_NEW_TYPE")).toBe("misc");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm run test -- taxonomy` → `categoryForType` not exported.

- [ ] **Step 3: Implement** — add to `src/lib/taxonomy.ts` (after the existing exports):

```ts
/** Maps the scraper's game `type` enum to a wiki item category slug. Unknown/null -> "misc". */
const TYPE_TO_CATEGORY: Record<string, string> = {
  WEAPON: "guns",
  WEAPON_BELT: "guns",
  AMMO: "ammo",
  TURRET_AMMO: "ammo",
  RESOURCE_T1: "resources",
  RESOURCE_T2: "resources",
  RESOURCE_T3: "resources",
  ENERGY: "resources",
  ARMOR: "attire",
  BACKPACK: "attire",
  ATTACK_CONSUMABLE: "weapons",
  RAID_EXPLOSIVES: "weapons",
  UTILITY_CONSUMABLE: "tools",
  FOOD: "medical",
  KEY: "misc",
  MONEY: "misc",
  LARGE_VALUABLE: "misc",
  SMALL_VALUABLE: "misc",
};

export function categoryForType(type: string | null | undefined): string {
  if (!type) return "misc";
  return TYPE_TO_CATEGORY[type] ?? "misc";
}
```

- [ ] **Step 4: Run it, expect PASS** — `npm run test -- taxonomy`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxonomy.ts src/lib/taxonomy.test.ts
git commit -m "feat: map game item types to wiki categories"
```

---

## Task 2: Prisma schema — new Recipe model, drop tech (migration)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Replace the `Item` model and all recipe/tech models** in `prisma/schema.prisma` with:

```prisma
model Item {
  id            String  @id @default(cuid())
  slug          String  @unique
  name          String
  description   String?
  category      String
  isResource    Boolean @default(false)
  storageStack  Int?
  workbenchTier Int?
  imageAlt      String?

  producedBy    RecipeOutput[]
  usedIn        RecipeInput[]

  @@index([category])
  @@index([workbenchTier])
}

model Recipe {
  id               String  @id @default(cuid())
  slug             String  @unique
  workbench        String?
  tier             Int?
  craftTimeSeconds Float?

  inputs           RecipeInput[]
  outputs          RecipeOutput[]
}

model RecipeInput {
  id       String @id @default(cuid())
  recipeId String
  recipe   Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  itemId   String
  item     Item   @relation(fields: [itemId], references: [id], onDelete: Cascade)
  amount   Int

  @@index([itemId])
  @@index([recipeId])
}

model RecipeOutput {
  id       String @id @default(cuid())
  recipeId String
  recipe   Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  itemId   String
  item     Item   @relation(fields: [itemId], references: [id], onDelete: Cascade)
  amount   Int

  @@index([itemId])
  @@index([recipeId])
}
```
Delete the old `RecipeIngredient`, `TechNode`, `TechCost`, `TechPrerequisite` models and the
`unlockedById`/`unlockedBy`, `workbenchLevel`, `craftTimeSeconds`, `unlockConditions` fields entirely.

- [ ] **Step 2: Create + apply the migration**

Run: `npx prisma migrate dev --name real-data-model`
Expected: migration created, applied, `@prisma/client` regenerated. (The DB is dev/local; data loss
is fine.)

- [ ] **Step 3: Validate** — `npx prisma validate` → "The schema is valid".

> TypeScript will now fail to compile in `queries.ts` and the tech page — fixed in Tasks 4 and 6.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: Recipe data model; remove tech-tree models"
```

---

## Task 3: Item filter — workbench tier (pure, TDD)

**Files:**
- Modify: `src/lib/item-filter.ts`
- Modify: `src/lib/item-filter.test.ts`

- [ ] **Step 1: Replace `src/lib/item-filter.test.ts`** with:

```ts
import { describe, it, expect } from "vitest";
import { buildItemQuery } from "./item-filter";

describe("buildItemQuery", () => {
  it("defaults to no filters and name-ascending", () => {
    expect(buildItemQuery({})).toEqual({ where: {}, orderBy: { name: "asc" } });
  });

  it("filters by name (case-insensitive) and category", () => {
    expect(buildItemQuery({ query: "rifle", category: "guns" }).where).toEqual({
      name: { contains: "rifle", mode: "insensitive" },
      category: "guns",
    });
  });

  it("filters by workbench tier", () => {
    expect(buildItemQuery({ workbenchTier: 2 }).where).toEqual({ workbenchTier: 2 });
  });

  it("sorts by workbench tier when requested", () => {
    expect(buildItemQuery({ sort: "workbench" }).orderBy).toEqual({ workbenchTier: "asc" });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm run test -- item-filter`.

- [ ] **Step 3: Replace `src/lib/item-filter.ts`** with:

```ts
import type { Prisma } from "@prisma/client";

export interface ItemFilter {
  query?: string;
  category?: string;
  workbenchTier?: number;
  sort?: "name" | "workbench";
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

  const orderBy: Prisma.ItemOrderByWithRelationInput =
    filter.sort === "workbench" ? { workbenchTier: "asc" } : { name: "asc" };
  return { where, orderBy };
}
```
(Removes `requiredResourceId`; "uses resource" filtering is deferred per spec §10.)

- [ ] **Step 4: Run it, expect PASS** — `npm run test -- item-filter`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/item-filter.ts src/lib/item-filter.test.ts
git commit -m "feat: filter/sort items by workbench tier"
```

---

## Task 4: Queries + recipe shaping (TDD for the pure part)

**Files:**
- Create: `src/lib/recipes.ts`
- Create: `src/lib/recipes.test.ts`
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: Write `src/lib/recipes.test.ts`** (pure shaping — no DB)

```ts
import { describe, it, expect } from "vitest";
import { toRecipeCard, type RecipeWithItems } from "./recipes";

const recipe: RecipeWithItems = {
  slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2,
  inputs: [{ amount: 5, item: { slug: "scraps", name: "Scraps" } }],
  outputs: [{ amount: 1, item: { slug: "fabric", name: "Fabric" } }],
};

describe("toRecipeCard", () => {
  it("flattens a recipe into display rows", () => {
    expect(toRecipeCard(recipe)).toEqual({
      slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2,
      inputs: [{ slug: "scraps", name: "Scraps", amount: 5 }],
      outputs: [{ slug: "fabric", name: "Fabric", amount: 1 }],
    });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm run test -- recipes`.

- [ ] **Step 3: Implement `src/lib/recipes.ts`**

```ts
export interface RecipeLineItem { slug: string; name: string }
export interface RecipeLine { amount: number; item: RecipeLineItem }
export interface RecipeWithItems {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  inputs: RecipeLine[];
  outputs: RecipeLine[];
}

export interface RecipeCardRow { slug: string; name: string; amount: number }
export interface RecipeCard {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  inputs: RecipeCardRow[];
  outputs: RecipeCardRow[];
}

const row = (l: RecipeLine): RecipeCardRow => ({ slug: l.item.slug, name: l.item.name, amount: l.amount });

/** Flatten a recipe (with nested items) into display-ready rows for the item page. */
export function toRecipeCard(r: RecipeWithItems): RecipeCard {
  return {
    slug: r.slug, workbench: r.workbench, tier: r.tier, craftTimeSeconds: r.craftTimeSeconds,
    inputs: r.inputs.map(row),
    outputs: r.outputs.map(row),
  };
}
```

- [ ] **Step 4: Run it, expect PASS** — `npm run test -- recipes`.

- [ ] **Step 5: Replace `src/lib/queries.ts`** with (drops all tech queries; new include shape):

```ts
import { prisma } from "./db";
import { buildItemQuery, type ItemFilter } from "./item-filter";
import { toRecipeCard } from "./recipes";

const recipeInclude = {
  recipe: { include: { inputs: { include: { item: true } }, outputs: { include: { item: true } } } },
} as const;

export async function listItems(filter: ItemFilter) {
  const { where, orderBy } = buildItemQuery(filter);
  return prisma.item.findMany({ where, orderBy });
}

export async function listResources() {
  return prisma.item.findMany({ where: { isResource: true }, orderBy: { name: "asc" } });
}

export async function getItemBySlug(slug: string) {
  const item = await prisma.item.findUnique({
    where: { slug },
    include: { producedBy: { include: recipeInclude }, usedIn: { include: recipeInclude } },
  });
  if (!item) return null;
  const craftedBy = item.producedBy.map((o) => toRecipeCard(o.recipe));
  const usedIn = item.usedIn.map((i) => toRecipeCard(i.recipe));
  return { ...item, craftedBy, usedIn };
}
```

- [ ] **Step 6: Type-check** — `npx tsc --noEmit`. Expect remaining errors ONLY in the tech page and
  any tech component (fixed in Task 6) and possibly the items pages (Task 7). `queries.ts`/`lib` clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/recipes.ts src/lib/recipes.test.ts src/lib/queries.ts
git commit -m "feat: recipe-aware queries (crafted by / used in)"
```

---

## Task 5: Seed rewrite + real data snapshot

**Files:**
- Modify: `prisma/seed.ts`
- Create: `prisma/data.json` (copy of the scraper output)

- [ ] **Step 1: Provide the dataset.** Copy the scraper's reviewed output into the wiki:
  `out/data.json` from the scraper project → `sand-wiki/prisma/data.json`. (123 items / 34 recipes.)
  It is the `{ meta, items[], recipes[] }` shape from the spec §2.

- [ ] **Step 2: Replace `prisma/seed.ts`** with:

```ts
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryForType, isItemCategory } from "../src/lib/taxonomy";

const prisma = new PrismaClient();

interface ScrapItem {
  slug: string; id: string; name: string; type: string | null;
  isResource: boolean; storageStack: number | null; workbenchTier: number | null; fromCatalog: boolean;
}
interface ScrapLine { item: string; amount: number }
interface ScrapRecipe {
  slug: string; workbench: string | null; tier: number | null; craftTimeSeconds: number | null;
  inputs: ScrapLine[]; outputs: ScrapLine[];
}
interface ScrapData { items: ScrapItem[]; recipes: ScrapRecipe[] }

async function main() {
  const file = process.env.SEED_FILE ?? join(__dirname, "data.json");
  const data: ScrapData = JSON.parse(readFileSync(file, "utf-8"));

  await prisma.recipeInput.deleteMany();
  await prisma.recipeOutput.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.item.deleteMany();

  for (const i of data.items) {
    const category = categoryForType(i.type);
    if (!isItemCategory(category)) throw new Error(`Mapped category "${category}" is not a known category`);
    if (i.type && categoryForType(i.type) === "misc" && i.type !== "KEY" && i.type !== "MONEY"
        && i.type !== "LARGE_VALUABLE" && i.type !== "SMALL_VALUABLE") {
      console.warn(`Unmapped type "${i.type}" -> misc (${i.slug})`);
    }
    await prisma.item.create({
      data: {
        slug: i.slug, name: i.name, category, isResource: i.isResource,
        storageStack: i.storageStack ?? undefined, workbenchTier: i.workbenchTier ?? undefined,
      },
    });
  }

  const idBySlug = new Map((await prisma.item.findMany()).map((it) => [it.slug, it.id]));
  const need = (slug: string) => {
    const id = idBySlug.get(slug);
    if (!id) throw new Error(`Recipe references unknown item slug: ${slug}`);
    return id;
  };

  for (const r of data.recipes) {
    await prisma.recipe.create({
      data: {
        slug: r.slug, workbench: r.workbench ?? undefined, tier: r.tier ?? undefined,
        craftTimeSeconds: r.craftTimeSeconds ?? undefined,
        inputs: { create: r.inputs.map((l) => ({ itemId: need(l.item), amount: l.amount })) },
        outputs: { create: r.outputs.map((l) => ({ itemId: need(l.item), amount: l.amount })) },
      },
    });
  }

  console.log(`Seeded ${data.items.length} items and ${data.recipes.length} recipes.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Run the seed** — `npm run db:seed`
  Expected: `Seeded 123 items and 34 recipes.` (warnings for any type that maps to misc but isn't an
  intended misc type — there should be none with the §4 mapping).

- [ ] **Step 4: Spot-check** — `npx prisma studio` (or a quick count) → Item 123, Recipe 34, and an
  item produced by >1 recipe has multiple `producedBy` rows.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts prisma/data.json
git commit -m "feat: seed items + recipes from scraper data"
```

---

## Task 6: Demote tech tree to a placeholder

**Files:**
- Modify: `src/lib/taxonomy.ts`
- Delete: `src/lib/tech-tree.ts`, `src/lib/tech-tree.test.ts`
- Replace: `src/app/tech/page.tsx`
- Delete: any tech-only components (e.g. `TechTreeGraph`, `TechTreeTable`, `TechCalculator`) and their imports.

- [ ] **Step 1: Update `taxonomy.ts`** — change the `tech` section from a link to a placeholder:

```ts
  { slug: "tech", label: "Tech Tree", kind: "placeholder", categories: [] },
```
(Remove its `href`.)

- [ ] **Step 2: Delete tech-tree logic** — `git rm src/lib/tech-tree.ts src/lib/tech-tree.test.ts`.
  Remove any remaining imports of `tech-tree`, `loadTechGraph`, `listTechNodes`, `resourceNamesById`,
  `calculateTotalCost` across the app (grep to confirm none remain).

- [ ] **Step 3: Replace `src/app/tech/page.tsx`** with a placeholder consistent with the
  `environment`/`tramplers` placeholder pages (reuse the existing placeholder component/pattern). It
  must state the tech tree is not available from current game data. Example shape (adapt to the actual
  placeholder component in use):

```tsx
export default function TechPage() {
  return (
    <section className="prose max-w-2xl py-8">
      <h1>Tech Tree</h1>
      <p>
        The in-game tech tree is not available in the current game data — its costs and prerequisites
        are not shipped in the game files. This section is a placeholder until that data can be
        extracted.
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Type-check + build** — `npx tsc --noEmit` then `npm run build`. Expect clean (all tech
  references removed). Fix any stragglers the compiler flags.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: demote tech tree to placeholder (no game data)"
```

---

## Task 7: Item pages — category/tier filters + Crafted by / Used in

**Files:**
- Modify: `src/app/items/page.tsx` (+ its filter component)
- Modify: `src/app/items/[slug]/page.tsx` (+ item detail components)

These are UI integration tasks against the wiki's existing DaisyUI components. Behavior to implement:

- [ ] **Step 1: Items list** — filters are **category** (from `ITEM_CATEGORIES`) and **workbench tier**
  (distinct non-null `workbenchTier` values), plus name search and name/tier sort, mapped to
  `ItemFilter` (`{ query, category, workbenchTier, sort }`). Remove the old workbench-level and
  required-resource controls.

- [ ] **Step 2: Item detail** — call `getItemBySlug(slug)`; render:
  - facts: category label (`categoryLabel`), `isResource`, `storageStack`, `workbenchTier`.
  - **Crafted by:** `item.craftedBy` (RecipeCard[]). For each: list `inputs` (`amount × name`, link by
    slug), `outputs` (`amount × name` — show outputs because recipes can yield by-products/multiples),
    `craftTimeSeconds`, and `workbench`/`tier`. Handle 0, 1, and many recipes.
  - **Used in:** `item.usedIn` (RecipeCard[]) — recipes consuming this item; link to each output item.
  - Remove the old single-`recipe` and `unlockedBy` rendering.

- [ ] **Step 3: Verify** — `npm run dev`, open `/items` (filter by a category and a tier), an item
  produced by multiple recipes (multiple "Crafted by" cards), and a resource (rich "Used in"). Confirm
  links resolve. Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/items
git commit -m "feat: item pages for recipe model (crafted by / used in, tier filter)"
```

---

## Task 8: Tests, about-page note, final verification

**Files:**
- Modify: `src/app/about/page.tsx` (or the data/about page)
- Modify: `tests/e2e/*.spec.ts` (update for the new pages; drop tech-calculator assertions)

- [ ] **Step 1: About/data note** — add a short note that the dataset is scraped from a playtest build,
  item names are derived from internal ids, and tech tree / contracts / loot are not yet available.

- [ ] **Step 2: Update e2e** — remove tech-tree calculator tests; ensure `/items` filtering by category
  works, an item detail page shows a "Crafted by" recipe, and `/tech` renders the placeholder. Keep the
  axe accessibility checks across `/`, `/items`, `/items/[slug]`, `/tech`, `/about`.

- [ ] **Step 3: Full verification gate** (run all, all must pass)

```bash
npm run test          # vitest: taxonomy mapping, item-filter, recipes
npx tsc --noEmit      # no type errors
npm run lint          # clean
npm run build         # production build succeeds
npm run db:seed       # 123 items / 34 recipes
npm run test:e2e      # Playwright + axe
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: e2e + about note for real-data wiki"
```

---

## Coverage map (spec → task)

| Spec section | Task |
|---|---|
| §3 Data model (Recipe/RecipeInput/RecipeOutput; drop tech) | 2 |
| §4 type→category mapping (+ unknown→misc warn) | 1, 5 |
| §5 Seed rewrite from scraper data.json | 5 |
| §6 Items list (category + tier) | 7 |
| §6 Item detail (Crafted by / Used in) | 4 (shaping), 7 (UI) |
| §6 /tech placeholder; calculator removed | 6 |
| §6 About/data note | 8 |
| §7 Testing (mapping, recipes, seed, e2e/axe) | 1, 3, 4, 5, 8 |
| §8 Out of scope (no scraper change, no tech/contracts/loot) | n/a (respected) |
```
