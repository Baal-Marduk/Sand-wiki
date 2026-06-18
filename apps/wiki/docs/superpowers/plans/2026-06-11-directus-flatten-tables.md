# Directus Table Flattening + Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three JSON blob columns (`Item.stats`, `EnvEntity.loot`, `TramplerPart.cost`) with flat relational tables, make the seed upsert-by-slug (stable IDs, edits survive re-seeds), and stand up Directus locally in Docker as the admin backoffice on the shared Neon dev DB.

**Architecture:** Two migrations bracket the work so every commit compiles: an *additive* migration first (new columns + `LootTier`/`LootEntry`/`TramplerPartCost` tables), then app code moves off the JSON blobs, then a *cleanup* migration drops them. A pure transform module (`prisma/seed-transform.ts`) converts the committed JSON snapshots to the flat shapes and is unit-tested without a DB. Directus runs via docker-compose with `DB_SEARCH_PATH=directus,public` so its system tables stay out of Prisma's `public` schema.

**Tech Stack:** Next.js 16 / React 19 / Prisma 6 / Neon Postgres / vitest / Playwright / Directus 11 (Docker).

**Spec:** `docs/superpowers/specs/2026-06-11-directus-flatten-tables-design.md`

**Worth knowing before you start:**
- All commands run from `sand-wiki/`. The dev DB is Neon (remote); re-seeding it is normal.
- `prisma generate` can EPERM on Windows if a dev server holds the engine DLL — the client still updates; verify with a query instead of killing processes (`instructions.md` → Gotchas).
- Data facts already verified against the committed JSON: stats has exactly 9 keys, all numerics are integers; loot tiers have 1–3 columns; **39 of 69 loot entries have fewer `values` than their tier has columns (some have `[]`)** — that's why `value1` is nullable; every loot entry has a `slug`; 66 of 233 trampler cost lines have no slug (Crowns).

---

### Task 1: Pure seed-transform module (TDD)

**Files:**
- Create: `prisma/seed-transform.ts`
- Test: `prisma/seed-transform.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `prisma/seed-transform.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { flattenStats, lootToTiers, costToRows } from "./seed-transform";

describe("flattenStats", () => {
  it("maps wiki stat keys to flat column names", () => {
    expect(
      flattenStats({
        type: "Revolver", value: 25, damage: 15, pDamage: 1, tDamage: 2,
        sDamage: 3, magazine: 6, ammoSlug: "pistol-ammo", ammoName: "8x21 mm Ammo",
      }),
    ).toEqual({
      statType: "Revolver", statValue: 25, damage: 15, playerDamage: 1, tramplerDamage: 2,
      splashDamage: 3, magazine: 6, ammoSlug: "pistol-ammo", ammoName: "8x21 mm Ammo",
    });
  });

  it("returns all-null when there are no stats", () => {
    expect(flattenStats(undefined)).toEqual({
      statType: null, statValue: null, damage: null, playerDamage: null, tramplerDamage: null,
      splashDamage: null, magazine: null, ammoSlug: null, ammoName: null,
    });
  });
});

describe("lootToTiers", () => {
  const loot = {
    tiers: [
      {
        tier: "Normal",
        columns: ["Lesser", "Normal", "Greater"],
        entries: [
          { slug: "canned-food", name: "Canned Food", values: ["4-5", "5-6"] }, // short row (real data)
          { name: "Crowns", values: [] },                                       // empty row (real data)
        ],
      },
      { tier: "Rare", columns: ["Count", "Chance"], entries: [] },
    ],
  };

  it("flattens tiers with column labels and array-index sort order", () => {
    const tiers = lootToTiers(loot);
    expect(tiers).toHaveLength(2);
    expect(tiers[0]).toMatchObject({
      tier: "Normal", col1Label: "Lesser", col2Label: "Normal", col3Label: "Greater", sortOrder: 0,
    });
    expect(tiers[1]).toMatchObject({
      tier: "Rare", col1Label: "Count", col2Label: "Chance", col3Label: null, sortOrder: 1,
    });
  });

  it("pads short value rows with null and keeps slug-less entries", () => {
    const [t] = lootToTiers(loot);
    expect(t.entries[0]).toEqual({
      itemSlug: "canned-food", name: "Canned Food", value1: "4-5", value2: "5-6", value3: null, sortOrder: 0,
    });
    expect(t.entries[1]).toEqual({
      itemSlug: null, name: "Crowns", value1: null, value2: null, value3: null, sortOrder: 1,
    });
  });

  it("returns [] when there is no loot", () => {
    expect(lootToTiers(undefined)).toEqual([]);
    expect(lootToTiers({})).toEqual([]);
  });

  it("throws on more than 3 columns", () => {
    expect(() =>
      lootToTiers({ tiers: [{ tier: "X", columns: ["a", "b", "c", "d"], entries: [] }] }),
    ).toThrow(/expected 1-3/);
  });
});

describe("costToRows", () => {
  it("maps cost lines, keeping slug-less currency lines", () => {
    expect(
      costToRows([
        { name: "Crowns", amount: 500 },
        { slug: "resource-metal-t1", name: "Mechanical Parts", amount: 20 },
      ]),
    ).toEqual([
      { itemSlug: null, name: "Crowns", amount: 500, sortOrder: 0 },
      { itemSlug: "resource-metal-t1", name: "Mechanical Parts", amount: 20, sortOrder: 1 },
    ]);
  });

  it("returns [] when there is no cost", () => {
    expect(costToRows(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run prisma/seed-transform.test.ts`
Expected: FAIL — cannot resolve `./seed-transform`.

- [ ] **Step 3: Write the implementation**

Create `prisma/seed-transform.ts`:

```ts
/** Pure transforms from the committed JSON snapshot shapes (wiki-enrichment.json,
 *  env-content.json, tramplers.json) to the flat relational shapes seeded into
 *  Postgres. No Prisma imports — unit-testable without a DB. */

export interface RawStats {
  type?: string; value?: number; damage?: number; pDamage?: number; tDamage?: number;
  sDamage?: number; magazine?: number; ammoSlug?: string; ammoName?: string;
}

export interface FlatStats {
  statType: string | null; statValue: number | null; damage: number | null;
  playerDamage: number | null; tramplerDamage: number | null; splashDamage: number | null;
  magazine: number | null; ammoSlug: string | null; ammoName: string | null;
}

export function flattenStats(stats: RawStats | null | undefined): FlatStats {
  return {
    statType: stats?.type ?? null,
    statValue: stats?.value ?? null,
    damage: stats?.damage ?? null,
    playerDamage: stats?.pDamage ?? null,
    tramplerDamage: stats?.tDamage ?? null,
    splashDamage: stats?.sDamage ?? null,
    magazine: stats?.magazine ?? null,
    ammoSlug: stats?.ammoSlug ?? null,
    ammoName: stats?.ammoName ?? null,
  };
}

export interface RawLoot {
  tiers?: { tier: string; columns: string[]; entries: { slug?: string; name: string; values: string[] }[] }[];
}

export interface FlatLootEntry {
  itemSlug: string | null; name: string;
  value1: string | null; value2: string | null; value3: string | null; sortOrder: number;
}

export interface FlatLootTier {
  tier: string; col1Label: string; col2Label: string | null; col3Label: string | null;
  sortOrder: number; entries: FlatLootEntry[];
}

export function lootToTiers(loot: RawLoot | null | undefined): FlatLootTier[] {
  return (loot?.tiers ?? []).map((t, ti) => {
    if (t.columns.length < 1 || t.columns.length > 3)
      throw new Error(`Loot tier "${t.tier}" has ${t.columns.length} columns — expected 1-3`);
    return {
      tier: t.tier,
      col1Label: t.columns[0],
      col2Label: t.columns[1] ?? null,
      col3Label: t.columns[2] ?? null,
      sortOrder: ti,
      entries: t.entries.map((e, ei) => ({
        itemSlug: e.slug ?? null,
        name: e.name,
        value1: e.values[0] ?? null,
        value2: e.values[1] ?? null,
        value3: e.values[2] ?? null,
        sortOrder: ei,
      })),
    };
  });
}

export interface RawCostLine { slug?: string; name: string; amount: number }
export interface FlatCostRow { itemSlug: string | null; name: string; amount: number; sortOrder: number }

export function costToRows(cost: RawCostLine[] | null | undefined): FlatCostRow[] {
  return (cost ?? []).map((c, i) => ({
    itemSlug: c.slug ?? null, name: c.name, amount: c.amount, sortOrder: i,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run prisma/seed-transform.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-transform.ts prisma/seed-transform.test.ts
git commit -m "feat(wiki): pure transforms from JSON snapshots to flat relational shapes"
```

---

### Task 2: Additive Prisma migration (new columns + tables, JSON blobs kept for now)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update the schema**

In `prisma/schema.prisma`, replace the `Item` model with (note: `stats Json?` is **kept** until Task 6):

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
  icon          String?
  derivedName   String?
  rarity        String?
  stats         Json?

  statType       String?
  statValue      Int?
  damage         Int?
  playerDamage   Int?
  tramplerDamage Int?
  splashDamage   Int?
  magazine       Int?
  ammoName       String?
  ammoItemId     String?
  ammoItem       Item?   @relation("ItemAmmo", fields: [ammoItemId], references: [id], onDelete: SetNull)
  ammoForWeapons Item[]  @relation("ItemAmmo")

  producedBy    RecipeOutput[]
  usedIn        RecipeInput[]
  lootEntries   LootEntry[]
  tramplerCosts TramplerPartCost[]

  @@index([category])
  @@index([workbenchTier])
  @@index([rarity])
}
```

Add `lootTiers LootTier[]` to `EnvEntity` (keep `loot Json?` for now):

```prisma
model EnvEntity {
  id          String  @id @default(cuid())
  slug        String  @unique
  category    String
  name        String
  description String?
  sourceUrl   String?
  icon        String?
  loot        Json?

  lootTiers   LootTier[]

  @@index([category])
}
```

Add `costEntries TramplerPartCost[]` to `TramplerPart` (keep `cost Json?` for now) — insert after the `cost Json?` line:

```prisma
  cost Json?

  costEntries TramplerPartCost[]
```

Append the three new models at the end of the file:

```prisma
model LootTier {
  id          String    @id @default(cuid())
  envEntityId String
  envEntity   EnvEntity @relation(fields: [envEntityId], references: [id], onDelete: Cascade)
  tier        String // "Normal" | "Rare" | "Very Rare"
  col1Label   String
  col2Label   String?
  col3Label   String?
  sortOrder   Int
  entries     LootEntry[]

  @@unique([envEntityId, tier])
}

model LootEntry {
  id         String   @id @default(cuid())
  lootTierId String
  lootTier   LootTier @relation(fields: [lootTierId], references: [id], onDelete: Cascade)
  itemId     String?
  item       Item?    @relation(fields: [itemId], references: [id], onDelete: SetNull)
  name       String // display fallback when itemId is null
  value1     String? // wiki amounts are strings ("10-20"); rows can have fewer values than columns
  value2     String?
  value3     String?
  sortOrder  Int

  @@index([lootTierId])
  @@index([itemId])
}

model TramplerPartCost {
  id        String       @id @default(cuid())
  partId    String
  part      TramplerPart @relation(fields: [partId], references: [id], onDelete: Cascade)
  itemId    String?
  item      Item?        @relation(fields: [itemId], references: [id], onDelete: SetNull)
  name      String // "Crowns" lines have no item
  amount    Int
  sortOrder Int

  @@index([partId])
  @@index([itemId])
}
```

- [ ] **Step 2: Create the migration without applying it**

Run: `npx prisma migrate dev --name flatten_relational_tables --create-only`
Expected: a new folder `prisma/migrations/<timestamp>_flatten_relational_tables/` with `migration.sql` containing only `ALTER TABLE "Item" ADD COLUMN ...` and `CREATE TABLE "LootTier"/"LootEntry"/"TramplerPartCost"` — **no DROP statements**. If any DROP appears, stop and fix the schema before applying.

- [ ] **Step 3: Apply and regenerate the client**

Run: `npx prisma migrate deploy` then `npx prisma generate`
Expected: `migrate deploy` reports 1 migration applied. (`generate` may EPERM on Windows if a dev server is running — the client still updates; see Gotchas.)

- [ ] **Step 4: Verify nothing broke**

Run: `npm test` and `npx tsc --noEmit`
Expected: both pass (the migration was purely additive).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(wiki): additive migration for flat stats columns + loot/cost tables"
```

---

### Task 3: Seed rewrite — upsert-by-slug, populate the flat tables

**Files:**
- Modify: `prisma/seed.ts` (full rewrite below)

- [ ] **Step 1: Replace `prisma/seed.ts` with the upsert version**

```ts
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryForItem, isItemCategory, isEnvCategory, isTramplerCategory } from "../src/lib/taxonomy";
import { isRarity, DEFAULT_RARITY } from "../src/lib/rarity";
import { flattenStats, lootToTiers, costToRows, type RawStats, type RawLoot, type RawCostLine } from "./seed-transform";

interface EnvContent { category: string; name: string; description?: string; sourceUrl?: string; loot?: RawLoot }

interface TramplerContent {
  slug: string; name: string; category: string; description?: string; icon?: string; sourceUrl?: string;
  dimensions?: string; health?: number; weight?: number; weightCapacity?: number; weightCompensation?: number;
  energyConsumption?: number; energyCapacity?: number; ratedPower?: number; crewSlots?: number; itemSlots?: number;
  researchNode?: string; researchName?: string; researchTier?: number; cost?: RawCostLine[];
}

const prisma = new PrismaClient();

interface Enrichment { rarity?: string; stats?: RawStats }

interface ScrapItem {
  slug: string; id: string; name: string; displayName?: string | null;
  description?: string | null; type: string | null;
  isResource: boolean; storageStack: number | null; workbenchTier: number | null; fromCatalog: boolean;
}
interface ScrapLine { item: string; amount: number }
interface ScrapRecipe {
  slug: string; workbench: string | null; tier: number | null; craftTimeSeconds: number | null;
  inputs: ScrapLine[]; outputs: ScrapLine[];
}
interface ScrapData { items: ScrapItem[]; recipes: ScrapRecipe[] }

const INTENDED_MISC = new Set(["KEY", "MONEY", "LARGE_VALUABLE", "SMALL_VALUABLE"]);

/** null/undefined → undefined: omit the field from the upsert payload instead of writing
 *  NULL, so a manual (Directus) edit survives a re-seed when the source has no value. */
const opt = <T>(v: T | null | undefined): T | undefined => v ?? undefined;

async function main() {
  const file = process.env.SEED_FILE ?? join(__dirname, "data.json");
  const data: ScrapData = JSON.parse(readFileSync(file, "utf-8"));

  const iconRel: Record<string, string> = JSON.parse(
    readFileSync(join(__dirname, "icons.json"), "utf-8"),
  );
  const iconFor = (id: string): string | undefined => {
    const rel = iconRel[id];
    return rel ? "/icons/" + rel.split("/").pop() : undefined;
  };

  const enrichment: Record<string, Enrichment> = JSON.parse(
    readFileSync(join(__dirname, "wiki-enrichment.json"), "utf-8"),
  );

  // --- Items: upsert by slug (stable ids), prune slugs gone from the scrape ---
  for (const i of data.items) {
    const category = categoryForItem(i.type, i.displayName ?? i.name, i.slug);
    if (!isItemCategory(category)) throw new Error(`Mapped category "${category}" is not a known category`);
    if (i.type && category === "misc" && !INTENDED_MISC.has(i.type)) {
      console.warn(`Unmapped type "${i.type}" -> misc (${i.slug})`);
    }
    const e = enrichment[i.slug];
    let rarity = DEFAULT_RARITY;
    if (e?.rarity) {
      if (isRarity(e.rarity)) rarity = e.rarity;
      else console.warn(`Unknown rarity "${e.rarity}" for ${i.slug} — defaulting to ${DEFAULT_RARITY}`);
    }
    const flat = flattenStats(e?.stats);
    const scraped = {
      name: i.displayName ?? i.name,
      derivedName: i.name,
      description: opt(i.description),
      category,
      isResource: i.isResource,
      storageStack: opt(i.storageStack),
      workbenchTier: opt(i.workbenchTier),
      icon: iconFor(i.id),
      rarity,
      statType: opt(flat.statType),
      statValue: opt(flat.statValue),
      damage: opt(flat.damage),
      playerDamage: opt(flat.playerDamage),
      tramplerDamage: opt(flat.tramplerDamage),
      splashDamage: opt(flat.splashDamage),
      magazine: opt(flat.magazine),
      ammoName: opt(flat.ammoName),
    };
    await prisma.item.upsert({ where: { slug: i.slug }, create: { slug: i.slug, ...scraped }, update: scraped });
  }
  const prunedItems = await prisma.item.deleteMany({ where: { slug: { notIn: data.items.map((i) => i.slug) } } });
  if (prunedItems.count > 0) console.log(`Pruned ${prunedItems.count} item(s) no longer in the scrape`);

  const idBySlug = new Map(
    (await prisma.item.findMany({ select: { slug: true, id: true } })).map((it) => [it.slug, it.id]),
  );
  const need = (slug: string) => {
    const id = idBySlug.get(slug);
    if (!id) throw new Error(`Recipe references unknown item slug: ${slug}`);
    return id;
  };

  // --- ammoSlug → ammoItem self-relation (second pass: every item now exists) ---
  for (const i of data.items) {
    const ammoSlug = enrichment[i.slug]?.stats?.ammoSlug;
    if (!ammoSlug) continue;
    const ammoItemId = idBySlug.get(ammoSlug) ?? null;
    if (!ammoItemId) console.warn(`ammoSlug "${ammoSlug}" on ${i.slug} does not resolve to an item`);
    await prisma.item.update({ where: { slug: i.slug }, data: { ammoItemId } });
  }

  // --- Recipes: line rows are scraper-owned → recreate; recipe rows keep stable ids ---
  await prisma.recipeInput.deleteMany();
  await prisma.recipeOutput.deleteMany();
  for (const r of data.recipes) {
    const scraped = { workbench: opt(r.workbench), tier: opt(r.tier), craftTimeSeconds: opt(r.craftTimeSeconds) };
    const lines = {
      inputs: { create: r.inputs.map((l) => ({ itemId: need(l.item), amount: l.amount })) },
      outputs: { create: r.outputs.map((l) => ({ itemId: need(l.item), amount: l.amount })) },
    };
    await prisma.recipe.upsert({
      where: { slug: r.slug },
      create: { slug: r.slug, ...scraped, ...lines },
      update: { ...scraped, ...lines },
    });
  }
  const prunedRecipes = await prisma.recipe.deleteMany({ where: { slug: { notIn: data.recipes.map((r) => r.slug) } } });
  if (prunedRecipes.count > 0) console.log(`Pruned ${prunedRecipes.count} recipe(s) no longer in the scrape`);

  // --- Environment entities + loot tiers/entries (tiers/entries are scraper-owned → recreate) ---
  const envContent: Record<string, EnvContent> = JSON.parse(
    readFileSync(join(__dirname, "env-content.json"), "utf-8"),
  );
  let envCount = 0;
  const envSlugs: string[] = [];
  for (const [slug, e] of Object.entries(envContent)) {
    if (!isEnvCategory(e.category)) {
      console.warn(`Unknown env category "${e.category}" for ${slug} — skipped`);
      continue;
    }
    envSlugs.push(slug);
    const scraped = { category: e.category, name: e.name, description: opt(e.description), sourceUrl: opt(e.sourceUrl) };
    const entity = await prisma.envEntity.upsert({ where: { slug }, create: { slug, ...scraped }, update: scraped });
    await prisma.lootTier.deleteMany({ where: { envEntityId: entity.id } });
    for (const t of lootToTiers(e.loot)) {
      await prisma.lootTier.create({
        data: {
          envEntityId: entity.id,
          tier: t.tier,
          col1Label: t.col1Label,
          col2Label: t.col2Label,
          col3Label: t.col3Label,
          sortOrder: t.sortOrder,
          entries: {
            create: t.entries.map((en) => {
              const itemId = en.itemSlug ? idBySlug.get(en.itemSlug) ?? null : null;
              if (en.itemSlug && !itemId) console.warn(`Loot slug "${en.itemSlug}" in ${slug}/${t.tier} does not resolve to an item`);
              return { itemId, name: en.name, value1: en.value1, value2: en.value2, value3: en.value3, sortOrder: en.sortOrder };
            }),
          },
        },
      });
    }
    envCount++;
  }
  const prunedEnv = await prisma.envEntity.deleteMany({ where: { slug: { notIn: envSlugs } } });
  if (prunedEnv.count > 0) console.log(`Pruned ${prunedEnv.count} env entit(ies) no longer in the scrape`);

  // --- Trampler parts + cost rows (cost rows are scraper-owned → recreate) ---
  const tramplers: Record<string, TramplerContent> = JSON.parse(
    readFileSync(join(__dirname, "tramplers.json"), "utf-8"),
  );
  let tramplerCount = 0;
  const tramplerSlugs: string[] = [];
  for (const [slug, t] of Object.entries(tramplers)) {
    if (!isTramplerCategory(t.category)) {
      console.warn(`Unknown trampler category "${t.category}" for ${slug} — skipped`);
      continue;
    }
    tramplerSlugs.push(slug);
    const scraped = {
      name: t.name, category: t.category,
      description: opt(t.description), icon: opt(t.icon), sourceUrl: opt(t.sourceUrl),
      dimensions: opt(t.dimensions),
      health: opt(t.health), weight: opt(t.weight),
      weightCapacity: opt(t.weightCapacity), weightCompensation: opt(t.weightCompensation),
      energyConsumption: opt(t.energyConsumption), energyCapacity: opt(t.energyCapacity),
      ratedPower: opt(t.ratedPower), crewSlots: opt(t.crewSlots), itemSlots: opt(t.itemSlots),
      researchNode: opt(t.researchNode), researchName: opt(t.researchName), researchTier: opt(t.researchTier),
    };
    const part = await prisma.tramplerPart.upsert({ where: { slug }, create: { slug, ...scraped }, update: scraped });
    await prisma.tramplerPartCost.deleteMany({ where: { partId: part.id } });
    const rows = costToRows(t.cost);
    if (rows.length > 0) {
      await prisma.tramplerPartCost.createMany({
        data: rows.map((c) => {
          const itemId = c.itemSlug ? idBySlug.get(c.itemSlug) ?? null : null;
          if (c.itemSlug && !itemId) console.warn(`Cost slug "${c.itemSlug}" on ${slug} does not resolve to an item`);
          return { partId: part.id, itemId, name: c.name, amount: c.amount, sortOrder: c.sortOrder };
        }),
      });
    }
    tramplerCount++;
  }
  const prunedTramplers = await prisma.tramplerPart.deleteMany({ where: { slug: { notIn: tramplerSlugs } } });
  if (prunedTramplers.count > 0) console.log(`Pruned ${prunedTramplers.count} trampler part(s) no longer in the scrape`);

  console.log(`Seeded ${data.items.length} items, ${data.recipes.length} recipes, ${envCount} environment entities, ${tramplerCount} trampler parts.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

Notes on intent (don't "fix" these):
- The old `deleteMany`-everything block is gone — that destructiveness is the point of this task.
- The JSON columns (`stats`/`loot`/`cost`) are no longer written. They go stale in the dev DB until Task 6 drops them; the app still reads them until Task 5. That mid-sequence inconsistency is accepted.
- `rarity` always has a value (defaulted), so it always overwrites — scraper wins where it has data.

- [ ] **Step 2: Type-check and run the seed**

Run: `npx tsc --noEmit` then `npm run db:seed`
Expected: type-check clean; seed prints `Seeded N items, ...` plus possibly known warnings. First run prunes nothing.

- [ ] **Step 3: Verify ID stability across re-seeds**

```bash
OUT=/tmp/ids-a.json npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
Promise.all([
  p.item.findMany({ select: { slug: true, id: true }, orderBy: { slug: 'asc' } }),
  p.envEntity.findMany({ select: { slug: true, id: true }, orderBy: { slug: 'asc' } }),
  p.tramplerPart.findMany({ select: { slug: true, id: true }, orderBy: { slug: 'asc' } }),
  p.recipe.findMany({ select: { slug: true, id: true }, orderBy: { slug: 'asc' } }),
]).then((r) => { require('node:fs').writeFileSync(process.env.OUT, JSON.stringify(r)); return p.\$disconnect(); })"
npm run db:seed
OUT=/tmp/ids-b.json npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
Promise.all([
  p.item.findMany({ select: { slug: true, id: true }, orderBy: { slug: 'asc' } }),
  p.envEntity.findMany({ select: { slug: true, id: true }, orderBy: { slug: 'asc' } }),
  p.tramplerPart.findMany({ select: { slug: true, id: true }, orderBy: { slug: 'asc' } }),
  p.recipe.findMany({ select: { slug: true, id: true }, orderBy: { slug: 'asc' } }),
]).then((r) => { require('node:fs').writeFileSync(process.env.OUT, JSON.stringify(r)); return p.\$disconnect(); })"
diff /tmp/ids-a.json /tmp/ids-b.json && echo IDS-STABLE
```

Expected: `IDS-STABLE` (no diff output). Also spot-check the flat data landed:

```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
Promise.all([p.lootTier.count(), p.lootEntry.count(), p.tramplerPartCost.count(),
  p.item.count({ where: { damage: { not: null } } }), p.item.count({ where: { ammoItemId: { not: null } } })])
  .then((r) => { console.log({ lootTiers: r[0], lootEntries: r[1], costRows: r[2], withDamage: r[3], withAmmo: r[4] }); return p.\$disconnect(); })"
```

Expected: `lootTiers: 18, lootEntries: 69, costRows: 233`, `withDamage` and `withAmmo` both > 0.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(wiki): upsert-by-slug seed populating flat stats/loot/cost tables"
```

---

### Task 4: Switch caliber-class derivation from `stats` JSON to the `ammoName` column

**Files:**
- Modify: `src/lib/ammo.ts:56-69`, `src/lib/item-filter.ts:33-44`
- Test: `src/lib/ammo.test.ts`, `src/lib/item-filter.test.ts`

- [ ] **Step 1: Update the tests first**

In `src/lib/ammo.test.ts`, the `itemClass`/`itemClasses` tests pass `stats` objects — change them to pass `ammoName` strings. The fixture block around lines 71–74 becomes:

```ts
      { slug: "a", name: "11x54 mm Ammo", ammoName: null },     // Sniper
      { slug: "b", name: "Rifle", ammoName: "9x42 mm Ammo" },   // Rifle
      { slug: "c", name: "Pistol", ammoName: "8x21 mm Ammo" },  // Pistol
      { slug: "d", name: "Bandages", ammoName: null },          // none
```

and every `itemClass(slug, name, { ammoName: "..." })` / `itemClass(slug, name, null)` call site passes the string (or null) directly: `itemClass(slug, name, "9x42 mm Ammo")`.

In `src/lib/item-filter.test.ts` line 30, the row factory `stats: ammoName ? { ammoName } : null` becomes `ammoName: ammoName ?? null`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ammo.test.ts src/lib/item-filter.test.ts`
Expected: FAIL (type/shape mismatch).

- [ ] **Step 3: Update the implementations**

`src/lib/ammo.ts` — replace `itemClass`/`itemClasses` (lines 53–69):

```ts
/** The caliber-class label for an item. Weapons/turrets derive from ammoName/slug; ammo items
 *  fall back to their own name. Null when no caliber can be derived. Single source used by both
 *  the class filter and the class option list. */
export function itemClass(slug: string, name: string, ammoName: string | null | undefined): string | null {
  return caliberLabel(weaponCaliber(slug, ammoName) ?? ammoCaliber(name));
}

/** Distinct caliber-class labels present in the given rows, in CLASS_ORDER. */
export function itemClasses(rows: { slug: string; name: string; ammoName: string | null }[]): string[] {
  const present = new Set<string>();
  for (const r of rows) {
    const c = itemClass(r.slug, r.name, r.ammoName);
    if (c) present.add(c);
  }
  return CLASS_ORDER.filter((c) => present.has(c));
}
```

`src/lib/item-filter.ts` — `ViewItem` (line 33) and the filter call (line 44):

```ts
type ViewItem = { slug: string; name: string; rarity: string | null; ammoName: string | null };
```
```ts
    out = out.filter((i) => itemClass(i.slug, i.name, i.ammoName) === opts.weaponClass);
```

`src/lib/queries.ts` — `listItemClasses` (line 54) selects the column instead of the blob:

```ts
    select: { slug: true, name: true, ammoName: true },
```

and `getWeaponsByCaliber` (lines 154–159):

```ts
    select: { slug: true, name: true, icon: true, ammoName: true },
    orderBy: { name: "asc" },
  });
  return rows
    .filter((r) => weaponCaliber(r.slug, r.ammoName) === caliber)
    .map(({ slug, name, icon }) => ({ slug, name, icon }));
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/lib` and `npx tsc --noEmit`
Expected: both PASS — the `Item.stats` JSON column still exists at this point (dropped in Task 6), so the not-yet-touched pages in `src/app/` still compile.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ammo.ts src/lib/ammo.test.ts src/lib/item-filter.ts src/lib/item-filter.test.ts src/lib/queries.ts
git commit -m "refactor(wiki): derive caliber class from ammoName column instead of stats JSON"
```

---

### Task 5: Read paths — item detail, environment loot, trampler cost off the JSON blobs

**Files:**
- Modify: `src/components/StatBox.tsx`, `src/app/items/[slug]/page.tsx`, `src/lib/queries.ts`, `src/app/environment/[slug]/page.tsx`, `src/components/LootTable.tsx`, `src/app/tramplers/[slug]/page.tsx`

- [ ] **Step 1: StatBox reads flat fields**

Replace `src/components/StatBox.tsx` entirely:

```tsx
/** The flat wiki-stat columns on Item that StatBox renders. */
export interface ItemStatFields {
  statType: string | null;
  damage: number | null;
  playerDamage: number | null;
  tramplerDamage: number | null;
  splashDamage: number | null;
  magazine: number | null;
}

/** Prominent grid of wiki-sourced gameplay stats, shown under the detail header.
 *  Renders nothing when there are no displayable stats. */
export function StatBox({ item, typeLabel }: { item: ItemStatFields; typeLabel?: string }) {
  const cells: { label: string; node: React.ReactNode }[] = [];
  if (item.damage != null) cells.push({ label: "Damage", node: item.damage });
  if (item.playerDamage != null) cells.push({ label: "Damage (Player)", node: item.playerDamage });
  if (item.tramplerDamage != null) cells.push({ label: "Damage (Trampler)", node: item.tramplerDamage });
  if (item.splashDamage != null) cells.push({ label: "Splash Damage", node: item.splashDamage });
  if (item.magazine != null) cells.push({ label: "Magazine", node: item.magazine });
  const typeValue = typeLabel ?? item.statType;
  if (typeValue) cells.push({ label: "Type", node: typeValue });
  if (cells.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-base-300 rounded-box overflow-hidden">
      {cells.map((c) => (
        <div key={c.label} className="bg-base-200 px-3 py-2">
          <dt className="text-[0.65rem] uppercase tracking-wide text-base-content/60">{c.label}</dt>
          <dd className="font-medium">{c.node}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 2: Item detail page reads flat columns**

In `src/app/items/[slug]/page.tsx`:
- Change the import on line 9 to `import { StatBox } from "@/components/StatBox";`
- Delete line 30 (`const stats = item.stats as unknown as ItemStats | null;`)
- Line 32 becomes: `const caliber = isAmmo ? ammoCaliber(item.name) : weaponCaliber(item.slug, item.ammoName);`
- Line 61 becomes: `value: item.statValue,`
- Line 82 becomes: `<StatBox item={item} typeLabel={isAmmo ? caliberLabel(caliber) ?? undefined : undefined} />`

- [ ] **Step 3: Queries read the relational loot/cost**

In `src/lib/queries.ts`:

`getEnvEntityBySlug` (lines 67–69) becomes:

```ts
export async function getEnvEntityBySlug(slug: string) {
  return prisma.envEntity.findUnique({
    where: { slug },
    include: {
      lootTiers: {
        orderBy: { sortOrder: "asc" },
        include: {
          entries: {
            orderBy: { sortOrder: "asc" },
            include: { item: { select: { slug: true, icon: true } } },
          },
        },
      },
    },
  });
}
```

`getCratesContaining` + the `LootShape` interface (lines 104–124) become (the `CrateDrop` interface on line 102 is unchanged):

```ts
/** Crates (with tier + amounts) whose loot tables contain the given item slug. */
export async function getCratesContaining(itemSlug: string): Promise<CrateDrop[]> {
  const rows = await prisma.lootEntry.findMany({
    where: { item: { slug: itemSlug }, lootTier: { envEntity: { category: "loot-containers" } } },
    include: { lootTier: { include: { envEntity: { select: { slug: true, name: true } } } } },
    orderBy: [{ lootTier: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  return rows.map((r) => {
    const t = r.lootTier;
    const columns = [t.col1Label, t.col2Label, t.col3Label].filter((c): c is string => c !== null);
    const values = [r.value1, r.value2, r.value3].slice(0, columns.length).map((v) => v ?? "");
    return { crateSlug: t.envEntity.slug, crateName: t.envEntity.name, tier: t.tier, columns, values };
  });
}
```

`getTramplerPartBySlug` (lines 92–94) becomes:

```ts
export async function getTramplerPartBySlug(slug: string) {
  return prisma.tramplerPart.findUnique({
    where: { slug },
    include: {
      costEntries: {
        orderBy: { sortOrder: "asc" },
        include: { item: { select: { slug: true, icon: true } } },
      },
    },
  });
}
```

Delete `getItemIconMap` (lines 71–76) — after Steps 4–5 nothing uses it (verify with grep before deleting; if something still imports it, fix that call site instead).

- [ ] **Step 4: Environment detail page uses `lootTiers`**

In `src/app/environment/[slug]/page.tsx`, replace the imports of `getItemIconMap` and the `LootShape`/tier/icons block (lines 3, 9, 16–23) so the component reads:

```tsx
import { getEnvEntityBySlug } from "@/lib/queries";
```
```tsx
  const tabs: Tab[] = entity.lootTiers.map((t) => ({
    id: t.tier.toLowerCase().replace(/\s+/g, "-"),
    label: t.tier,
    content: (
      <LootTable
        entries={t.entries.map((e) => ({ slug: e.item?.slug ?? null, name: e.name, icon: e.item?.icon ?? null }))}
      />
    ),
  }));
```

Delete the `LootShape` interface (line 9) and the `LootEntry` type import — the import on line 5 becomes `import { LootTable } from "@/components/LootTable";`.

- [ ] **Step 5: LootTable takes resolved entries**

Replace `src/components/LootTable.tsx`:

```tsx
import { ItemIconLink } from "@/components/ItemIconLink";

export interface LootEntryView { slug: string | null; name: string; icon: string | null }

/** One tier's loot, as an icon grid (icon + name tooltip, linked to the item when matched).
 *  Amounts are intentionally not shown. */
export function LootTable({ entries }: { entries: LootEntryView[] }) {
  if (entries.length === 0) return <p className="text-base-content/50">—</p>;
  return (
    <div className="flex flex-wrap gap-3">
      {entries.map((e, i) => (
        <ItemIconLink key={`${e.slug ?? e.name}-${i}`} slug={e.slug ?? undefined} name={e.name} icon={e.icon} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Trampler part page uses `costEntries`**

In `src/app/tramplers/[slug]/page.tsx`:
- Line 3 import becomes `import { getTramplerPartBySlug } from "@/lib/queries";`
- Delete the `CostEntry` interface (line 10) and lines 17–18 (`const cost = ...` / `const icons = ...`); replace with `const cost = part.costEntries;`
- The Build Cost map (lines 71–73) becomes:

```tsx
            {cost.map((c) => (
              <ItemIconLink key={c.name} slug={c.item?.slug ?? undefined} name={c.name} icon={c.item?.icon ?? null} amount={c.amount} />
            ))}
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: all clean — no remaining reads of `item.stats`, `entity.loot`, `part.cost` (`grep -rn "\.stats\b\|entity\.loot\|part\.cost" src/` returns nothing relevant).

Then a smoke check in the real app: `npm run dev`, visit an artillery item (e.g. `/items/turret-ammo`), a crate (`/environment/weapon-crate`), and a trampler part (`/tramplers/captain-crew-module`) — stats grid, loot tier tabs, and build cost icons all render as before. Stop the dev server after.

- [ ] **Step 8: Commit**

```bash
git add src/
git commit -m "refactor(wiki): read flat stat columns and relational loot/cost tables"
```

---

### Task 6: Drop the JSON blob columns

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Remove the columns from the schema**

Delete these three lines from `prisma/schema.prisma`:
- `stats         Json?` (Item)
- `loot        Json?` (EnvEntity)
- `cost Json?` (TramplerPart)

- [ ] **Step 2: Confirm nothing references them**

Run: `grep -rn "stats\s*:\s*true\|InputJsonValue\|\.loot\b\|\.cost\b" src/ prisma/seed.ts prisma/seed-transform.ts`
Expected: no matches (test files asserting on JSON snapshot shapes — `loot-resolution.test.ts`, `wiki-text.test.ts` — don't count; they read the JSON files, not the DB).

- [ ] **Step 3: Create, inspect, apply the migration**

Run: `npx prisma migrate dev --name drop_json_blobs --create-only`
Expected: `migration.sql` containing exactly three `ALTER TABLE ... DROP COLUMN` statements.

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: applied cleanly.

- [ ] **Step 4: Full verification**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: all pass — including `prisma/loot-resolution.test.ts`, which reads the JSON snapshots (unchanged pipeline) and needs no rewrite.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(wiki): drop stats/loot/cost JSON blobs — flat tables are the source"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Make sure no stale dev server is running on :3000**

Playwright's `reuseExistingServer` will happily test a stale server (see Gotchas). Check with `Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue` (PowerShell) and stop anything found.

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e`
Expected: all pass, including the axe accessibility gates in both themes. These suites cover item stat rendering, loot tier tabs, and trampler costs — the read paths this work rewired.

- [ ] **Step 3: Commit (only if fixes were needed)**

If any e2e fix was required, commit it: `git commit -m "fix(wiki): <what>"`. Otherwise nothing to commit.

---

### Task 8: Directus in Docker on the shared Neon DB

**Files:**
- Create: `docker-compose.yml`, `directus/snapshots/` (snapshot committed at the end)
- Modify: `.env` (and `.env.example` — both gitignored, no secrets committed), `package.json`

- [ ] **Step 1: Add Directus env vars**

Append to `.env` (real values) and `.env.example` (placeholders):

```
# Directus backoffice (local Docker)
DIRECTUS_SECRET="<any-long-random-string>"
DIRECTUS_ADMIN_EMAIL="admin@example.com"
DIRECTUS_ADMIN_PASSWORD="<choose-a-password>"
```

Generate the secret with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

- [ ] **Step 2: Create the `directus` Postgres schema**

Directus puts its system tables in the first schema of its search path — that schema must exist before first boot, and keeping it out of `public` is what prevents Prisma drift:

```powershell
'CREATE SCHEMA IF NOT EXISTS directus;' | npx prisma db execute --stdin --schema prisma/schema.prisma
```

Expected: exits 0.

- [ ] **Step 3: Write `docker-compose.yml`** (repo: `sand-wiki/docker-compose.yml`)

```yaml
services:
  directus:
    image: directus/directus:11
    ports:
      - "8055:8055"
    volumes:
      - ./directus/snapshots:/directus/snapshots
    environment:
      SECRET: ${DIRECTUS_SECRET}
      ADMIN_EMAIL: ${DIRECTUS_ADMIN_EMAIL}
      ADMIN_PASSWORD: ${DIRECTUS_ADMIN_PASSWORD}
      DB_CLIENT: pg
      DB_CONNECTION_STRING: ${DATABASE_URL}
      # System tables land in the "directus" schema; content stays in "public".
      # This keeps prisma migrate's drift detection blind to Directus.
      DB_SEARCH_PATH: directus,public
      PUBLIC_URL: http://localhost:8055
      WEBSOCKETS_ENABLED: "false"
```

Compose reads `.env` from the same directory automatically; `DATABASE_URL` (Neon, includes `sslmode=require`) is already there.

- [ ] **Step 4: Add npm scripts**

In `package.json` scripts:

```json
    "directus:up": "docker compose up -d directus",
    "directus:down": "docker compose down",
    "directus:snapshot": "docker compose exec directus npx directus schema snapshot --yes ./snapshots/snapshot.yaml",
    "directus:apply": "docker compose exec directus npx directus schema apply --yes ./snapshots/snapshot.yaml"
```

- [ ] **Step 5: Boot and verify schema placement**

Run: `npm run directus:up`, then `docker compose logs -f directus` until `Server started at http://0.0.0.0:8055` (first boot runs its installer — give it a minute). Then verify the system tables landed in the right schema:

```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.\$queryRawUnsafe(\"SELECT schemaname, COUNT(*)::int AS n FROM pg_tables WHERE tablename LIKE 'directus_%' GROUP BY schemaname\")
  .then((r) => { console.log(r); return p.\$disconnect(); })"
```

Expected: one row, `schemaname: 'directus'`, n ≈ 25+. **If a `public` row appears, STOP** — the search-path mitigation failed. Tear down (`npm run directus:down`), drop the leaked tables, and fall back to the documented alternative: point Directus at a dedicated Neon branch instead of the shared dev DB. Record the outcome in `instructions.md`.

- [ ] **Step 6: Drift check**

Run: `npx prisma migrate dev --create-only --name drift_check`
Expected: "No schema changes found" (or equivalent already-in-sync message) and **no drift warning mentioning `directus_*` tables**. Delete any empty migration folder it may have created.

- [ ] **Step 7: Register the content tables as Directus collections**

Existing `public` tables are "unmanaged" until registered. Try the API route first:

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8055/auth/login -ContentType 'application/json' `
  -Body (@{ email = $env:DIRECTUS_ADMIN_EMAIL; password = $env:DIRECTUS_ADMIN_PASSWORD } | ConvertTo-Json)
$token = $login.data.access_token
foreach ($c in 'Item','Recipe','RecipeInput','RecipeOutput','EnvEntity','LootTier','LootEntry','TramplerPart','TramplerPartCost') {
  try {
    Invoke-RestMethod -Method Post -Uri http://localhost:8055/collections -Headers @{ Authorization = "Bearer $token" } `
      -ContentType 'application/json' -Body (@{ collection = $c } | ConvertTo-Json) | Out-Null
    Write-Host "registered $c"
  } catch { Write-Host "$c -> $($_.Exception.Message)" }
}
```

(Read `DIRECTUS_ADMIN_EMAIL`/`PASSWORD` from `.env` if not in the shell env.) If the API refuses to register pre-existing tables, do it once via the UI instead: http://localhost:8055 → Settings → Data Model → each table has an add/configure affordance. Leave `_prisma_migrations` unmanaged either way. Directus reads the real FK constraints, so M2O relations (LootEntry→Item, LootEntry→LootTier, etc.) come along automatically.

Verify: `Invoke-RestMethod -Uri 'http://localhost:8055/items/Item?limit=1' -Headers @{ Authorization = "Bearer $token" }` returns an item row.

- [ ] **Step 8: Manual edit-survival check (the point of all this)**

In the Directus UI, edit one item's `description` to a sentinel value, then `npm run db:seed`, then re-read the item. Expected: the description is **overwritten** if that item's source has a description, and **preserved** if the source has none (pick an item with an empty description for the positive case — find one via `npx tsx -e "...findFirst({ where: { description: null }, select: { slug: true } })..."`). Revert the sentinel after.

- [ ] **Step 9: Snapshot the Directus config and commit**

Run: `npm run directus:snapshot`
Expected: `directus/snapshots/snapshot.yaml` appears.

```bash
git add docker-compose.yml directus/snapshots/snapshot.yaml package.json
git commit -m "feat(wiki): local Directus backoffice via docker-compose on the shared dev DB"
```

---

### Task 9: Documentation

**Files:**
- Modify: `instructions.md`, `TODO.md`

- [ ] **Step 1: Update `instructions.md`**

In the **Data model** section, replace the three bullets to describe the flat shape:
- `Item`: replace the `**stats** (JSON: weapon/ammo fields)` mention with: flat wiki-stat columns `statType`, `statValue`, `damage`, `playerDamage`, `tramplerDamage`, `splashDamage`, `magazine`, `ammoName`, plus `ammoItem` (self-relation resolved from the wiki's `ammoSlug`).
- `EnvEntity`: replace the `**loot** (JSON: ...)` mention with: `lootTiers LootTier[]` → `LootTier` (`tier`, `col1–3Label`, `sortOrder`, unique per entity+tier) → `LootEntry` (`item?`, `name` fallback, `value1–3` strings, `sortOrder`).
- Add: `TramplerPart.costEntries` → `TramplerPartCost` (`item?` null for Crowns, `name`, `amount`, `sortOrder`).

In **Data pipeline** step 3, replace the "deletes + recreates" sentence with: seed **upserts by `slug`** (stable row IDs across re-seeds; update payloads omit fields the source lacks, so manual edits to source-empty fields survive; rows whose slug leaves the snapshot are pruned with a log line); fully scraper-owned child rows (recipe lines, loot tiers/entries, cost rows) are recreated each seed.

Add a new section after **Data pipeline**:

```markdown
## Backoffice (Directus, local Docker)

- `npm run directus:up` → http://localhost:8055 (admin creds in `.env`: `DIRECTUS_*`).
- Runs against the same Neon dev DB. System tables live in the `directus` Postgres schema
  (`DB_SEARCH_PATH=directus,public`) so `prisma migrate` never sees them — do NOT move them
  to `public`. The schema must exist before first boot
  (`'CREATE SCHEMA IF NOT EXISTS directus;' | npx prisma db execute --stdin --schema prisma/schema.prisma`).
- Collection config is snapshotted to `directus/snapshots/snapshot.yaml`
  (`npm run directus:snapshot` / `directus:apply`).
- Edits made in Directus survive `npm run db:seed` (upsert-by-slug), except fields the
  scraper has a value for — those are overwritten. Scraper-owned child rows (recipe lines,
  loot tiers/entries, cost rows) are always recreated.
```

- [ ] **Step 2: Update `TODO.md`**

Mark line 13 done:

```markdown
- [x] Flatening tables for directus and integration (flat stat columns + LootTier/LootEntry/TramplerPartCost; upsert-by-slug seed; local Directus via docker-compose)
```

- [ ] **Step 3: Commit**

```bash
git add instructions.md TODO.md
git commit -m "docs(wiki): document flat data model, upsert seed, and Directus backoffice"
```
