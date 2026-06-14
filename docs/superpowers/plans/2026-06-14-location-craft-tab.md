# Location Craft Tab + Backlinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give landmark/location pages a Craft tab listing the production recipes tied to that location, editable through the existing proposal flow, with item pages backlinking to the locations that produce them — without a re-seed ever erasing hand-added DB data.

**Architecture:** Add `Recipe.locationId` (FK to the location `Entity`) and `Entity.curated` (prune-protection). Harden `seed.ts` so prune queries skip curated rows. Load the 9 confirmed recipes via an idempotent curated-insert script. Reuse the existing `RecipeCard`/`UsedInTable`/`CraftTable` display and the `recipe_new`/`recipe_edit`/`recipe_delete` proposal pipeline, threading a `locationSlug` through new-recipe only.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Prisma 6 / Postgres (Neon), Vitest, TypeScript. App lives in `sand-wiki/`.

**Working directory note:** All paths below are repo-relative (repo root = `D:/Documents/SandLabs`). Run all `npm`/`npx` commands from `sand-wiki/`. The branch `feat/location-craft-tab` is already checked out.

**Conventions observed:**
- The recipe line relation field is `entity` (not `item`) on the unified model.
- DB-touching functions are NOT unit-tested in this repo; only pure helpers are. Follow that: unit-test pure logic with Vitest; verify DB/seed/UI behavior manually with the steps given.
- Run tests with `npm test` (vitest run). A single file: `npx vitest run src/lib/<file>.test.ts`.

---

## Phase 1 — Data model

### Task 1: Schema changes + migration

**Files:**
- Modify: `sand-wiki/prisma/schema.prisma` (Entity model ~13-40, Recipe model ~109-119)
- Create: `sand-wiki/prisma/migrations/<timestamp>_add_entity_curated_recipe_location/migration.sql` (generated)

- [ ] **Step 1: Add `curated` + `craftedAtRecipes` to the Entity model**

In `schema.prisma`, the `Entity` model: add the `curated` field right after the existing `lootCurated` line:

```prisma
  lootCurated Boolean @default(false)
  curated     Boolean @default(false)
```

And in the Entity relations block (after `incomingLinks`), add the inverse relation:

```prisma
  producedBy       RecipeOutput[]
  usedIn           RecipeInput[]
  craftedAtRecipes Recipe[]       @relation("RecipeLocation")
  outgoingLinks    EntityLink[]   @relation("LinkSource")
  incomingLinks    EntityLink[]   @relation("LinkTarget")
```

- [ ] **Step 2: Add `locationId` + `location` to the Recipe model**

Replace the `Recipe` model body with:

```prisma
model Recipe {
  id               String  @id @default(dbgenerated("(gen_random_uuid())::text"))
  slug             String  @unique
  workbench        String?
  tier             Int?
  craftTimeSeconds Float?
  curated          Boolean @default(false)
  locationId       String?
  location         Entity? @relation("RecipeLocation", fields: [locationId], references: [id], onDelete: SetNull)

  inputs  RecipeInput[]
  outputs RecipeOutput[]

  @@index([locationId])
}
```

- [ ] **Step 3: Stop any running dev server, then create the migration**

(Windows Prisma can hit EPERM on `generate` if `next dev` holds the client open.)

Run: `npx prisma migrate dev --name add_entity_curated_recipe_location`

Expected: a new migration folder is created and applied to the Neon dev DB; output ends with "Your database is now in sync with your schema." and regenerates the Prisma client. The generated `migration.sql` should be additive only — roughly:

```sql
ALTER TABLE "Entity" ADD COLUMN "curated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN "locationId" TEXT;
CREATE INDEX "Recipe_locationId_idx" ON "Recipe"("locationId");
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Verify the migration is additive (no DROP / no NOT NULL without default)**

Run: open the generated `migration.sql` and confirm it contains only `ADD COLUMN` / `CREATE INDEX` / `ADD CONSTRAINT`. There must be NO `DROP`, no `DELETE`, no `ALTER COLUMN ... SET NOT NULL`.
Expected: only additive statements present.

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/prisma/schema.prisma sand-wiki/prisma/migrations
git commit -m "feat(db): add Recipe.location + Entity.curated (additive migration)"
```

---

## Phase 2 — Seed safety

### Task 2: Never prune curated rows

The seed deletes entities whose slug left the source JSON (per kind) and asserts post-seed counts. Curated rows (hand-added locations, curated recipes) must be excluded from BOTH.

**Files:**
- Modify: `sand-wiki/prisma/seed.ts` (lines 130, 218, 268, 313, 387-389)

- [ ] **Step 1: Guard the item prune (line ~130)**

Replace:

```ts
  const prunedItems = await prisma.entity.deleteMany({ where: { kind: "item", slug: { notIn: items.map((i) => i.slug) } } });
```

with:

```ts
  const prunedItems = await prisma.entity.deleteMany({ where: { kind: "item", curated: false, slug: { notIn: items.map((i) => i.slug) } } });
```

- [ ] **Step 2: Guard the environment prune (line ~218) — this is the one protecting `sprengstofffabrik`**

Replace:

```ts
  const prunedEnv = await prisma.entity.deleteMany({ where: { kind: "environment", slug: { notIn: envSlugs } } });
```

with:

```ts
  const prunedEnv = await prisma.entity.deleteMany({ where: { kind: "environment", curated: false, slug: { notIn: envSlugs } } });
```

- [ ] **Step 3: Guard the trampler-part prune (line ~268)**

Replace:

```ts
  const prunedTramplers = await prisma.entity.deleteMany({ where: { kind: "trampler-part", slug: { notIn: tramplerSlugs } } });
```

with:

```ts
  const prunedTramplers = await prisma.entity.deleteMany({ where: { kind: "trampler-part", curated: false, slug: { notIn: tramplerSlugs } } });
```

- [ ] **Step 4: Guard the tech-node prune (line ~313)**

Replace:

```ts
  const prunedTech = await prisma.entity.deleteMany({ where: { kind: "tech-node", slug: { notIn: techSlugs } } });
```

with:

```ts
  const prunedTech = await prisma.entity.deleteMany({ where: { kind: "tech-node", curated: false, slug: { notIn: techSlugs } } });
```

- [ ] **Step 5: Scope the count assertions to non-curated rows (lines ~387-389)**

Replace:

```ts
  const [itemCount, scrapedRecipeCount] = await Promise.all([prisma.entity.count({ where: { kind: "item" } }), prisma.recipe.count({ where: { curated: false } })]);
  if (itemCount !== items.length) throw new Error(`Item count mismatch after seed: DB has ${itemCount}, snapshot has ${items.length} (duplicate slugs?)`);
```

with:

```ts
  const [itemCount, scrapedRecipeCount] = await Promise.all([prisma.entity.count({ where: { kind: "item", curated: false } }), prisma.recipe.count({ where: { curated: false } })]);
  if (itemCount !== items.length) throw new Error(`Item count mismatch after seed: DB has ${itemCount}, snapshot has ${items.length} (duplicate slugs?)`);
```

And the tech-node assertion (line ~383-384). Replace:

```ts
  const techNodeCount = await prisma.entity.count({ where: { kind: "tech-node" } });
```

with:

```ts
  const techNodeCount = await prisma.entity.count({ where: { kind: "tech-node", curated: false } });
```

- [ ] **Step 6: Type-check (no test harness for seed.ts)**

Run: `npx tsc --noEmit -p sand-wiki/tsconfig.json`
Expected: no errors introduced by the edits (pre-existing unrelated errors, if any, are out of scope — confirm none reference seed.ts lines you touched).

- [ ] **Step 7: Commit**

```bash
git add sand-wiki/prisma/seed.ts
git commit -m "fix(seed): never prune curated entities/recipes; scope count assertions"
```

---

## Phase 3 — Initial data load

### Task 3: The recipe source JSON

**Files:**
- Create: `sand-wiki/prisma/location-recipes.json`

- [ ] **Step 1: Write the source file**

The slug for each recipe is generated by the loader as `loc-<location>-<primary output slug>`; each output[0] here is unique per location so the slugs don't collide.

```json
{
  "locations": ["kaiserplatz", "rauchwolke", "strudel", "sprengstofffabrik"],
  "recipes": [
    { "location": "kaiserplatz", "inputs": [{ "item": "crystal-handles", "amount": 1 }], "outputs": [{ "item": "energy-bar", "amount": 10 }] },
    { "location": "kaiserplatz", "inputs": [{ "item": "resource-alloy-steel", "amount": 40 }, { "item": "resource-metal-t2", "amount": 300 }], "outputs": [{ "item": "game-packed-auto-turret-t2-container", "amount": 1 }] },
    { "location": "rauchwolke", "inputs": [{ "item": "black-box", "amount": 1 }], "outputs": [{ "item": "resource-metal-t3", "amount": 10 }] },
    { "location": "rauchwolke", "inputs": [{ "item": "resource-coral-piece", "amount": 1 }], "outputs": [{ "item": "resource-coral-dust", "amount": 10 }, { "item": "resource-metal-t1", "amount": 2 }] },
    { "location": "sprengstofffabrik", "inputs": [{ "item": "crystal-handles", "amount": 1 }], "outputs": [{ "item": "energy-bar", "amount": 10 }] },
    { "location": "sprengstofffabrik", "inputs": [{ "item": "resource-alloy-steel", "amount": 40 }, { "item": "resource-metal-t2", "amount": 300 }], "outputs": [{ "item": "game-packed-turret-t2-container", "amount": 1 }] },
    { "location": "sprengstofffabrik", "inputs": [{ "item": "resource-fabric", "amount": 10 }, { "item": "resource-gunpowder", "amount": 10 }], "outputs": [{ "item": "rocket-launcher-ammo-armor-piercing", "amount": 3 }] },
    { "location": "sprengstofffabrik", "inputs": [{ "item": "resource-fabric", "amount": 10 }, { "item": "resource-gunpowder", "amount": 10 }], "outputs": [{ "item": "grenade-contact", "amount": 5 }] },
    { "location": "strudel", "inputs": [{ "item": "resource-alloy-steel", "amount": 40 }, { "item": "resource-metal-t2", "amount": 300 }], "outputs": [{ "item": "game-packed-shotgun-turret-t2-container", "amount": 1 }] }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add sand-wiki/prisma/location-recipes.json
git commit -m "data: confirmed location production recipes (4 locations, 9 recipes)"
```

### Task 4: Idempotent loader script

**Files:**
- Create: `sand-wiki/prisma/load-location-recipes.ts`
- Modify: `sand-wiki/package.json` (scripts)

- [ ] **Step 1: Write the loader**

It mirrors `seed.ts` conventions: fail loudly on any unresolved slug; mark the four locations `curated: true`; upsert each recipe `curated: true` with `locationId`, recreating its lines on every run.

```ts
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

interface Line { item: string; amount: number }
interface LocRecipe { location: string; inputs: Line[]; outputs: Line[] }
interface LocData { locations: string[]; recipes: LocRecipe[] }

/** Generated slug for a location recipe: loc-<location>-<primary output>. */
function slugFor(r: LocRecipe): string {
  return `loc-${r.location}-${r.outputs[0].item}`;
}

async function main() {
  const data: LocData = JSON.parse(
    readFileSync(join(__dirname, "location-recipes.json"), "utf-8"),
  );

  // Resolve + protect each location (must already exist; never auto-create — a real
  // landmark needs a category/description authored elsewhere).
  const locIdBySlug = new Map<string, string>();
  for (const slug of data.locations) {
    const loc = await prisma.entity.findUnique({ where: { slug }, select: { id: true, kind: true } });
    if (!loc) throw new Error(`Location not found: ${slug} (create the landmark first)`);
    if (loc.kind !== "environment") throw new Error(`Location ${slug} has kind="${loc.kind}", expected "environment"`);
    await prisma.entity.update({ where: { slug }, data: { curated: true } });
    locIdBySlug.set(slug, loc.id);
  }

  // Resolve every referenced item id up front.
  const itemSlugs = [...new Set(data.recipes.flatMap((r) => [...r.inputs, ...r.outputs].map((l) => l.item)))];
  const items = await prisma.entity.findMany({ where: { kind: "item", slug: { in: itemSlugs } }, select: { id: true, slug: true } });
  const itemIdBySlug = new Map(items.map((i) => [i.slug, i.id]));
  for (const s of itemSlugs) {
    if (!itemIdBySlug.has(s)) throw new Error(`Recipe references unknown item slug: ${s}`);
  }
  const needItem = (s: string) => itemIdBySlug.get(s)!;

  // Upsert each recipe (curated + location-bound). Lines are recreated each run.
  for (const r of data.recipes) {
    const slug = slugFor(r);
    const locationId = locIdBySlug.get(r.location)!;
    const inputs = { create: r.inputs.map((l) => ({ itemId: needItem(l.item), amount: l.amount })) };
    const outputs = { create: r.outputs.map((l) => ({ itemId: needItem(l.item), amount: l.amount })) };

    const existing = await prisma.recipe.findUnique({ where: { slug }, select: { id: true } });
    if (existing) {
      await prisma.recipeInput.deleteMany({ where: { recipeId: existing.id } });
      await prisma.recipeOutput.deleteMany({ where: { recipeId: existing.id } });
      await prisma.recipe.update({
        where: { slug },
        data: { curated: true, locationId, workbench: null, tier: null, craftTimeSeconds: null, inputs, outputs },
      });
    } else {
      await prisma.recipe.create({ data: { slug, curated: true, locationId, inputs, outputs } });
    }
    console.log(`  ✓ ${slug}`);
  }

  console.log(`Loaded ${data.recipes.length} location recipes across ${data.locations.length} locations.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add after `"db:seed:force"`:

```json
    "db:load-location-recipes": "tsx prisma/load-location-recipes.ts",
```

- [ ] **Step 3: Run the loader against the dev DB**

Run: `npm run db:load-location-recipes`
Expected: nine `✓ loc-…` lines and `Loaded 9 location recipes across 4 locations.` No "not found" / "unknown item slug" errors. (If a location slug error appears, the landmark isn't in the DB yet — stop and confirm the slug.)

- [ ] **Step 4: Verify data landed and locations are protected**

Run:
```bash
npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); (async()=>{const r=await p.recipe.count({where:{curated:true,locationId:{not:null}}}); const l=await p.entity.count({where:{kind:'environment',curated:true}}); console.log('curated location recipes:',r,'curated locations:',l); await p.\$disconnect();})()"
```
(run from `sand-wiki/`)
Expected: `curated location recipes: 9 curated locations: 4`

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/prisma/load-location-recipes.ts sand-wiki/package.json
git commit -m "feat(data): idempotent loader for curated location recipes"
```

---

## Phase 4 — Read plumbing (RecipeCard carries location)

### Task 5: `RecipeCard.location` in the recipes lib

**Files:**
- Modify: `sand-wiki/src/lib/recipes.ts`
- Test: `sand-wiki/src/lib/recipes.test.ts`

- [ ] **Step 1: Add the failing test**

In `recipes.test.ts`, update the fixture to include `location` and assert it flows through. Replace the whole file with:

```ts
import { describe, it, expect } from "vitest";
import { toRecipeCard, type RecipeWithItems } from "./recipes";

const recipe: RecipeWithItems = {
  slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2, location: null,
  inputs: [{ amount: 5, item: { slug: "scraps", name: "Scraps", icon: null, rarity: "Common" } }],
  outputs: [{ amount: 1, item: { slug: "fabric", name: "Fabric", icon: "/icons/icon_fabric.png", rarity: null } }],
};

describe("toRecipeCard", () => {
  it("flattens a recipe into display rows, carrying each item's icon and rarity", () => {
    expect(toRecipeCard(recipe)).toEqual({
      slug: "fabric", workbench: "Utility", tier: 1, craftTimeSeconds: 2, location: null,
      inputs: [{ slug: "scraps", name: "Scraps", icon: null, rarity: "Common", amount: 5 }],
      outputs: [{ slug: "fabric", name: "Fabric", icon: "/icons/icon_fabric.png", rarity: null, amount: 1 }],
    });
  });

  it("carries a location backlink when present", () => {
    const card = toRecipeCard({ ...recipe, location: { slug: "sprengstofffabrik", name: "Sprengstofffabrik" } });
    expect(card.location).toEqual({ slug: "sprengstofffabrik", name: "Sprengstofffabrik" });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/recipes.test.ts`
Expected: FAIL — TS/assertion error because `RecipeWithItems`/`RecipeCard` have no `location`.

- [ ] **Step 3: Add `location` to both interfaces and the mapper**

In `recipes.ts`: add `location` to `RecipeWithItems` and `RecipeCard`, and copy it in `toRecipeCard`.

```ts
export interface RecipeWithItems {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  location: { slug: string; name: string } | null;
  inputs: RecipeLine[];
  outputs: RecipeLine[];
}
```

```ts
export interface RecipeCard {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  location: { slug: string; name: string } | null;
  inputs: RecipeCardRow[];
  outputs: RecipeCardRow[];
}
```

```ts
export function toRecipeCard(r: RecipeWithItems): RecipeCard {
  return {
    slug: r.slug, workbench: r.workbench, tier: r.tier, craftTimeSeconds: r.craftTimeSeconds,
    location: r.location,
    inputs: r.inputs.map(row),
    outputs: r.outputs.map(row),
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/lib/recipes.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/recipes.ts sand-wiki/src/lib/recipes.test.ts
git commit -m "feat(recipes): RecipeCard carries an optional location backlink"
```

### Task 6: Load location in queries

**Files:**
- Modify: `sand-wiki/src/lib/queries.ts` (recipeInclude ~12-19, LoadedRecipe ~23-30, toRecipeWithItems ~34-44, getEnvEntityBySlug ~114-127)

- [ ] **Step 1: Include `location` in `recipeInclude`**

Replace the `recipeInclude` const (lines ~12-19):

```ts
const recipeInclude = {
  recipe: {
    include: {
      inputs: { include: { entity: linkItemSelect } },
      outputs: { include: { entity: linkItemSelect } },
      location: { select: { slug: true, name: true } },
    },
  },
} as const;
```

- [ ] **Step 2: Add `location` to `LoadedRecipe` and carry it in `toRecipeWithItems`**

Replace the `LoadedRecipe` type (lines ~23-30):

```ts
type LoadedRecipe = {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  location: { slug: string; name: string } | null;
  inputs: { amount: number; entity: { slug: string; name: string; icon: string | null; rarity: string | null } }[];
  outputs: { amount: number; entity: { slug: string; name: string; icon: string | null; rarity: string | null } }[];
};
```

Replace the `toRecipeWithItems` return (lines ~36-43) to add `location: r.location,`:

```ts
  return {
    slug: r.slug,
    workbench: r.workbench,
    tier: r.tier,
    craftTimeSeconds: r.craftTimeSeconds,
    location: r.location,
    inputs: r.inputs.map(line),
    outputs: r.outputs.map(line),
  };
```

- [ ] **Step 3: Load the location's own recipes in `getEnvEntityBySlug`**

Replace `getEnvEntityBySlug` (lines ~114-127):

```ts
export async function getEnvEntityBySlug(slug: string) {
  const entity = await prisma.entity.findUnique({
    where: { slug },
    include: {
      outgoingLinks: {
        where: { role: "loot" },
        orderBy: { sortOrder: "asc" },
        include: { target: { select: { slug: true, kind: true, icon: true, rarity: true } } },
      },
      craftedAtRecipes: {
        orderBy: { slug: "asc" },
        include: {
          inputs: { include: { entity: linkItemSelect } },
          outputs: { include: { entity: linkItemSelect } },
        },
      },
    },
  });
  if (!entity || entity.kind !== "environment") return null;
  // We're already on the location page, so each card's location backlink is null.
  const craftedBy = entity.craftedAtRecipes.map((r) =>
    toRecipeCard(toRecipeWithItems({ ...r, location: null })),
  );
  return { ...entity, craftedBy };
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p sand-wiki/tsconfig.json`
Expected: no new errors. (`craftedAtRecipes` now exists on the Prisma type from Task 1's client regen.)

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/queries.ts
git commit -m "feat(queries): load recipe location + location craftedBy recipes"
```

---

## Phase 5 — Read UI

### Task 7: Backlink in the item Craft tab

The item's "Crafted by" tab uses `CraftTable`. Render the producing location (a link) where the workbench badge sits — a location recipe has no workbench, so the two never collide.

**Files:**
- Modify: `sand-wiki/src/components/recipe-cells.tsx`
- Modify: `sand-wiki/src/components/CraftTable.tsx`

- [ ] **Step 1: Add a `LocationLink` cell component**

In `recipe-cells.tsx`, add an import for `Link` at the top and a new component below `WorkbenchBadge`:

```tsx
import Link from "next/link";
```

```tsx
export function LocationLink({ location }: { location: { slug: string; name: string } }) {
  return (
    <Link
      href={`/environment/${location.slug}`}
      className="inline-flex items-center whitespace-nowrap border border-border-strong bg-card-elevated px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground hover:text-foreground"
    >
      {location.name}
    </Link>
  );
}
```

- [ ] **Step 2: Render the location in CraftTable's last column**

Replace `CraftTable.tsx` entirely:

```tsx
import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge, LocationLink } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow, type SortColumn } from "@/components/SortableTable";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
// Sort token (not display text): a stable, monotonic key over (location | workbench, tier).
const sourceKey = (r: RecipeCard) =>
  r.location ? `@${r.location.name}` : r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function CraftTable({ recipes }: { recipes: RecipeCard[] }) {
  const columns: SortColumn[] = [
    { label: "Ingredients" }, { label: "Time" }, { label: "Source" },
  ];
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.inputs), r.craftTimeSeconds, sourceKey(r)],
    cells: [
      <IngredientList key="i" rows={r.inputs} />,
      <span key="t" className="whitespace-nowrap">{r.craftTimeSeconds !== null ? `${r.craftTimeSeconds} sec` : "—"}</span>,
      r.location
        ? <LocationLink key="s" location={r.location} />
        : <WorkbenchBadge key="s" recipe={r} />,
    ],
  }));
  return (
    <SortableTable caption="Recipes that craft this item" columns={columns} rows={rows} />
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit -p sand-wiki/tsconfig.json && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/components/recipe-cells.tsx sand-wiki/src/components/CraftTable.tsx
git commit -m "feat(ui): item Craft tab links back to the producing location"
```

### Task 8: Craft tab on the location page

**Files:**
- Modify: `sand-wiki/src/components/UsedInTable.tsx` (optional caption)
- Modify: `sand-wiki/src/app/environment/[slug]/page.tsx`

- [ ] **Step 1: Make `UsedInTable`'s caption configurable**

Replace `UsedInTable.tsx`'s function signature + return caption (keep the rest):

```tsx
export function UsedInTable({ recipes, caption = "Recipes that use this item" }: { recipes: RecipeCard[]; caption?: string }) {
```

and the return:

```tsx
  return (
    <SortableTable caption={caption} columns={columns} rows={rows} />
  );
```

- [ ] **Step 2: Add the Craft tab to the environment page**

In `environment/[slug]/page.tsx`, add the import:

```tsx
import { UsedInTable } from "@/components/UsedInTable";
```

Then replace the tab-building block (lines ~34-41) with:

```tsx
  // One tab per loot tier (Normal / Rare / …); a "Craft" tab first when the location
  // produces recipes. Locations with neither simply have no tabs.
  const tierGroups = groupLootByTier(lootRows);
  const craftTabs: Tab[] = entity.craftedBy.length > 0
    ? [{
        id: "craft",
        label: "Craft",
        content: <UsedInTable recipes={entity.craftedBy} caption={`Items crafted at ${entity.name}`} />,
      }]
    : [];
  const tabs: Tab[] = [
    ...craftTabs,
    ...tierGroups.map((g) => ({
      id: `loot-${g.tier || "all"}`,
      label: g.tier || "Loot",
      content: <LootTable entries={g.rows.map(lootEntryView).sort(byRarityThenName)} />,
    })),
  ];
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p sand-wiki/tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Manual verification (read path end-to-end)**

Run: `npm run dev`, then visit:
- `http://localhost:3000/environment/sprengstofffabrik` — a **Craft** tab appears listing 4 recipes (Energy Rod, 80mm Cannon T2, Rocket Ammo AP, Grenade) with their inputs.
- `http://localhost:3000/items/rocket-launcher-ammo-armor-piercing` — the **Crafted by** tab shows a recipe whose "Source" column is a **Sprengstofffabrik** link; clicking it returns to the location.

Expected: both render as described. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/components/UsedInTable.tsx "sand-wiki/src/app/environment/[slug]/page.tsx"
git commit -m "feat(ui): Craft tab on location pages"
```

---

## Phase 6 — Editing (proposal flow)

Editing reuses the existing `recipe_new` / `recipe_edit` / `recipe_delete` pipeline. Only `recipe_new` needs to know the location; `recipe_edit`/`recipe_delete` already key on the recipe slug, and `applyRecipeProposal` never overwrites `locationId`, so edits preserve the location automatically.

### Task 9: Location recipe slug helper (pure, tested)

**Files:**
- Modify: `sand-wiki/src/lib/recipe-proposal.ts`
- Test: `sand-wiki/src/lib/recipe-proposal.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `recipe-proposal.test.ts` (and add `locationRecipeSlugBase` to the import list at the top of that file):

```ts
describe("locationRecipeSlugBase", () => {
  it("builds loc-<location>-<output> for a location recipe", () => {
    expect(locationRecipeSlugBase("sprengstofffabrik", "grenade-contact")).toBe("loc-sprengstofffabrik-grenade-contact");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/recipe-proposal.test.ts`
Expected: FAIL — `locationRecipeSlugBase` is not exported.

- [ ] **Step 3: Implement it**

In `recipe-proposal.ts`, add next to `uniqueRecipeSlug`:

```ts
/** Slug base for a location-bound recipe: `loc-<location>-<primary output>`. */
export function locationRecipeSlugBase(locationSlug: string, outputSlug: string): string {
  return `loc-${locationSlug}-${outputSlug}`;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/lib/recipe-proposal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/recipe-proposal.ts sand-wiki/src/lib/recipe-proposal.test.ts
git commit -m "feat(recipe-proposal): locationRecipeSlugBase helper"
```

### Task 10: Thread `locationSlug` through new-recipe submit + apply

**Files:**
- Modify: `sand-wiki/src/app/contribute/actions.ts` (`submitNewRecipe` ~140-179)
- Modify: `sand-wiki/src/lib/proposal-apply.ts` (`RecipeNewChange` ~7, `applyRecipeNew` ~130-166)

- [ ] **Step 1: Carry `locationSlug` in the new-recipe proposal**

In `actions.ts`, inside `submitNewRecipe`, read the hidden field and store it in `changes`. After `const backSlug = ...` add:

```ts
  const locationSlug = String(formData.get("locationSlug") ?? "").trim() || null;
```

and replace the `prisma.proposal.create` call's `changes` line:

```ts
      changes: { new: newSnap, locationSlug } as object,
```

- [ ] **Step 2: Resolve `locationSlug` → `locationId` and use a location-prefixed slug on apply**

In `proposal-apply.ts`:

Add the import (extend the existing `recipe-proposal` import on line 5):

```ts
import { buildLineCreates, uniqueRecipeSlug, locationRecipeSlugBase, type RecipeProposalChange, type RecipeSnapshot } from "./recipe-proposal";
```

Extend the `RecipeNewChange` type (line ~7):

```ts
type RecipeNewChange = { new: RecipeSnapshot; locationSlug?: string | null };
```

In `applyRecipeNew`, after `const snap = (p.changes as unknown as RecipeNewChange).new;` add:

```ts
    const locationSlug = (p.changes as unknown as RecipeNewChange).locationSlug ?? null;
```

Resolve the location before the slug step. Replace the slug+create block (lines ~146-159) with:

```ts
    let locationId: string | null = null;
    if (locationSlug) {
      const loc = await tx.entity.findUnique({ where: { slug: locationSlug }, select: { id: true } });
      if (!loc) throw new Error(`Location not found: ${locationSlug}`);
      locationId = loc.id;
    }

    const existing = await tx.recipe.findMany({ select: { slug: true } });
    const base = locationSlug ? locationRecipeSlugBase(locationSlug, snap.outputs[0].slug) : snap.outputs[0].slug;
    const slug = uniqueRecipeSlug(base, new Set(existing.map((r) => r.slug)));

    await tx.recipe.create({
      data: {
        slug,
        curated: true,
        locationId,
        workbench: snap.workbench,
        tier: snap.tier,
        craftTimeSeconds: snap.craftTimeSeconds,
        inputs: { create: inputCreates },
        outputs: { create: outputCreates },
      },
    });
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p sand-wiki/tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/app/contribute/actions.ts sand-wiki/src/lib/proposal-apply.ts
git commit -m "feat(proposals): new recipes can be bound to a location"
```

### Task 11: Editing UI on the location page

**Files:**
- Modify: `sand-wiki/src/app/contribute/new-recipe/page.tsx`
- Modify: `sand-wiki/src/app/contribute/edit-tabs/page.tsx`

- [ ] **Step 1: Support a `location` param in the new-recipe page**

Replace `new-recipe/page.tsx` entirely:

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { entityHref } from "@/lib/proposal-schema";
import { getRecipeWorkbenches } from "@/lib/proposal-entity";
import { submitNewRecipe } from "@/app/contribute/actions";
import { RecipeEditForm } from "@/components/RecipeEditForm";
import type { RecipeSnapshot } from "@/lib/recipe-proposal";

type SP = Promise<{ type?: string; slug?: string; side?: string; location?: string }>;

export default async function NewRecipePage({ searchParams }: { searchParams: SP }) {
  const { type = "item", slug = "", side = "output", location } = await searchParams;
  if (!slug) notFound();
  await requireUser(`/contribute/new-recipe?type=${type}&slug=${slug}&side=${side}${location ? `&location=${location}` : ""}`);

  const entity = await prisma.entity.findUnique({ where: { slug }, select: { slug: true, name: true } });
  if (!entity) notFound();

  const items = await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true }, orderBy: { name: "asc" } });
  const workbenches = await getRecipeWorkbenches();
  const back = entityHref(type, slug);

  // A location recipe carries its location as a hidden field and seeds no line.
  // A normal recipe pre-fills the originating item on the relevant side.
  const seedLine = { slug: entity.slug, name: entity.name, amount: 1 };
  const snapshot: RecipeSnapshot = location
    ? { workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] }
    : {
        workbench: null, tier: null, craftTimeSeconds: null,
        inputs: side === "input" ? [seedLine] : [],
        outputs: side === "output" ? [seedLine] : [],
      };
  const hiddenFields = location
    ? { backType: type, backSlug: slug, locationSlug: location }
    : { backType: type, backSlug: slug };
  const heading = location ? `Propose a new recipe made at ${entity.name}` : `Propose a new recipe — ${entity.name}`;

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-6">
      <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">{heading}</h1>
      <p className="text-muted-foreground">Describe the recipe. An admin reviews every change before it goes live.</p>
      <RecipeEditForm
        snapshot={snapshot}
        items={items}
        workbenches={workbenches}
        backHref={back}
        action={submitNewRecipe}
        submitLabel="Submit new recipe"
        hiddenFields={hiddenFields}
      />
    </article>
  );
}
```

- [ ] **Step 2: Render a "Crafted here" editor section for locations in edit-tabs**

In `edit-tabs/page.tsx`:

Add `getEnvEntityBySlug` to the queries import (line 6):

```tsx
import { getOutgoingLinks, getItemBySlug, getIncomingLootLinks, listLootSources, getEnvEntityBySlug } from "@/lib/queries";
```

Add `environment` to the recipe-tab kinds (line ~17):

```tsx
const RECIPE_TAB_KINDS = new Set(["item", "environment"]);
```

After the line `const item = showRecipes ? await getItemBySlug(slug) : null;` (line ~46), add:

```tsx
  const envCraft = entity.kind === "environment" ? await getEnvEntityBySlug(slug) : null;
```

Insert this section just before the closing `<Link href={back} ...>Back to page</Link>` (line ~128):

```tsx
      {envCraft && (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">Crafted here</h2>
          {envCraft.craftedBy.length === 0 && <p className="text-sm text-muted-foreground">No recipes yet.</p>}
          <ul className="space-y-2">
            {envCraft.craftedBy.map((r) => (
              <li key={r.slug} className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-sm">{r.outputs.map((o) => o.name).join(", ") || "Recipe"}</span>
                <Link href={`/contribute/edit-recipe?slug=${r.slug}`} className={`${btnGhost} ${btnSm}`}>Edit</Link>
                <form action={submitDeleteRecipe} className="inline">
                  <input type="hidden" name="slug" value={r.slug} />
                  <input type="hidden" name="backType" value={type} />
                  <input type="hidden" name="backSlug" value={slug} />
                  <button type="submit" className={`${btnDestructive} ${btnSm}`}>Delete</button>
                </form>
              </li>
            ))}
          </ul>
          <Link href={`/contribute/new-recipe?type=${type}&slug=${slug}&location=${slug}`} className={`${btnSecondary} ${btnSm}`}>
            + Propose a new recipe made here
          </Link>
        </section>
      )}
```

(The existing `showRecipes && item` block is unaffected: for an environment, `item` is `null`, so it renders nothing and the `envCraft` block handles recipes.)

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit -p sand-wiki/tsconfig.json && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual verification (edit path end-to-end)**

Run `npm run dev` (logged in as a user who can propose). Then:
1. Go to `http://localhost:3000/contribute/edit-tabs?type=envEntity&slug=strudel` — a **Crafted here** section lists the Shotgun Cannon T2 recipe with Edit/Delete, plus "+ Propose a new recipe made here".
2. Click the add link → form opens titled "Propose a new recipe made at Strudel", inputs/outputs empty. Add one input + one output, submit → redirected with `?proposed=1`.
3. Apply the proposal via the admin proposals UI (`/admin/proposals`). After applying, reload `/environment/strudel` → the new recipe appears in the Craft tab, and its slug in the DB starts with `loc-strudel-`.

Expected: all three steps behave as described.

- [ ] **Step 5: Verify location survives apply on EDIT (no orphaning)**

After step 4, edit an existing location recipe (e.g. via the Edit link) changing an amount, submit + apply, then confirm in the DB the recipe still has its `locationId` set:

```bash
npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); (async()=>{const r=await p.recipe.findFirst({where:{slug:{startsWith:'loc-strudel-'}},select:{slug:true,locationId:true}}); console.log(r); await p.\$disconnect();})()"
```
Expected: `locationId` is non-null (edit preserved the location).

- [ ] **Step 6: Commit**

```bash
git add "sand-wiki/src/app/contribute/new-recipe/page.tsx" "sand-wiki/src/app/contribute/edit-tabs/page.tsx"
git commit -m "feat(contribute): add/edit/delete location recipes via proposal flow"
```

---

## Phase 7 — Documentation

### Task 12: Record the seed-safety rule in instructions.md

**Files:**
- Modify: `sand-wiki/instructions.md` (Data pipeline section, after the numbered list ~line 73)

- [ ] **Step 1: Add the rule**

In `instructions.md`, immediately after the numbered Data-pipeline list item 4 (`4. **Refresh data** = …`, line ~73) and before the "Community-wiki content is uneven…" paragraph, insert:

```markdown

> **Re-seed safety (curated rows are never erased).** The seed never prunes a row marked
> `curated: true`. Any hand-added or admin-applied **entity** (e.g. the `sprengstofffabrik`
> landmark) must have `Entity.curated = true`, and any hand-authored **recipe** (including
> location production recipes) must have `Recipe.curated = true`, or a re-seed will delete it.
> Apply-time code (`proposal-apply.ts`) and `prisma/load-location-recipes.ts` set these flags;
> the prune queries in `seed.ts` all filter `curated: false`. Child rows (recipe input/output
> lines, loot/cost/craft links) are always deleted and recreated for **non-curated** parents —
> never hand-edit those directly; edit them through the proposal flow instead.
>
> **Location production recipes** live as `Recipe` rows with `locationId` set (one recipe per
> location). Source of record: `prisma/location-recipes.json`, loaded idempotently via
> `npm run db:load-location-recipes`.
```

- [ ] **Step 2: Commit**

```bash
git add sand-wiki/instructions.md
git commit -m "docs: seed-safety (curated) rule + location recipes"
```

---

## Final verification

- [ ] **Run the full unit suite**

Run: `npm test`
Expected: all tests pass (including the new `recipes.test.ts` and `recipe-proposal.test.ts` cases).

- [ ] **Type-check + lint the whole app**

Run: `npx tsc --noEmit -p sand-wiki/tsconfig.json && npm run lint`
Expected: clean (no new errors).

- [ ] **Re-seed safety smoke test (the core constraint)**

Confirm a forced re-seed does NOT delete the curated locations/recipes. Record counts, force-seed, re-check:

```bash
# before
npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); (async()=>{console.log('locs',await p.entity.count({where:{kind:'environment',curated:true}}),'recipes',await p.recipe.count({where:{curated:true,locationId:{not:null}}})); await p.\$disconnect();})()"
npm run db:seed:force
# after — must match before
npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); (async()=>{console.log('locs',await p.entity.count({where:{kind:'environment',curated:true}}),'recipes',await p.recipe.count({where:{curated:true,locationId:{not:null}}})); await p.\$disconnect();})()"
```
Expected: identical counts before and after (`locs 4 recipes 9`), and the force-seed completes without a count-mismatch error. This proves `sprengstofffabrik` and the 9 recipes survive a destructive re-seed.

---

## Self-review notes (for the implementer)

- **Spec coverage:** §1 data model → Task 1; §2 seed hardening → Task 2 + final smoke test; §3 initial load → Tasks 3-4; §4 Craft tab read → Tasks 6, 8; §5 backlinks → Tasks 5, 7; §6 editing → Tasks 9-11; §7 instructions.md → Task 12. All sections covered.
- **Type consistency:** `location: { slug: string; name: string } | null` is identical across `RecipeWithItems`, `RecipeCard`, `LoadedRecipe`, and the `getEnvEntityBySlug` mapping. The generated recipe slug uses `locationRecipeSlugBase` in BOTH the loader (`slugFor`, equivalent string) and `applyRecipeNew`.
- **Order dependency:** Task 1 (migration → client regen) must run before any task importing the new Prisma fields (6, 10). Task 4 (loader) requires Task 1's columns. Tasks within a phase are independent except as noted.
```
