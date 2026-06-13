# Unified Entity Data Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `Item` / `EnvEntity` / `TramplerPart` into one `Entity` table with typed per-kind stat tables (`ItemStats`, `TramplerStats`) and a single generic `EntityLink` table behind a fixed tab-role catalog; flatten loot tiers into per-row `tier` values, retiring `LootTier` / `LootEntry` / `TramplerPartCost`.

**Architecture:** One data-preserving Prisma migration rewrites the schema and backfills the new tables **reusing existing row ids** so recipe FKs repoint 1:1. The read layer (`queries.ts`), view libs, and pages move from three models to `Entity` + `kind`. `seed.ts`, the Directus snapshot, and tests follow. Recipes stay first-class (hyper-edges); everything else becomes `EntityLink` rows.

**Tech Stack:** Next.js 16.2.7, Prisma 6.19.3 (PostgreSQL/Neon), Directus 11.17.4 (committed snapshot), Vitest (pure-logic unit tests only — DB/UI verified by `next build` + Playwright e2e + manual).

**Design reference:** [`docs/superpowers/specs/2026-06-12-unified-entity-data-model-design.md`](../specs/2026-06-12-unified-entity-data-model-design.md)

---

## Conventions & ground rules (read before starting)

- **Branch:** `feat/unified-entity-model` (already created). The user has taken a DB snapshot.
- **This is a non-standard Next.js (16.2.7).** Per `AGENTS.md`, check `node_modules/next/dist/docs/` before changing anything Next-specific. The page changes here are data-layer only (same component shapes), so risk is low — but do not introduce new Next APIs.
- **No DB unit tests exist** and we will not add any (matches the repo convention: pure logic is unit-tested; DB/CMS/UI is verified by build + e2e + manual). New unit tests go only on **pure transform/grouping functions**.
- **Id preservation is the linchpin.** Entity rows reuse the original `Item`/`EnvEntity`/`TramplerPart` ids. This lets `RecipeInput.itemId` / `RecipeOutput.itemId` keep their values and merely repoint their FK to `Entity`.
- **Commit after every task.** Use the message shown in each task's commit step.
- **Verification commands** (run from `sand-wiki/`):
  - Typecheck/build: `npm run build`
  - Lint: `npm run lint`
  - Unit tests: `npm test`
  - E2E: `npm run test:e2e`
  - Apply migration to dev DB: `npx prisma migrate dev`
  - Regenerate client: `npx prisma generate`

---

## File structure (what each task touches)

| Area | Files |
|---|---|
| Schema + migration | `prisma/schema.prisma`, `prisma/migrations/<ts>_unified_entity_model/migration.sql` |
| Read layer | `src/lib/queries.ts`, `src/lib/item-filter.ts` |
| View libs | `src/lib/item-view.ts`, `src/lib/trampler-view.ts`, `src/lib/loot.ts`, `src/components/StatBox.tsx` |
| Tab catalog (new) | `src/lib/entity-links.ts` (new) |
| Pages | `src/app/items/[slug]/page.tsx`, `src/app/items/page.tsx`, `src/app/environment/[slug]/page.tsx`, `src/app/environment/page.tsx`, `src/app/tramplers/[slug]/page.tsx`, `src/app/tramplers/page.tsx`, `src/app/api/search-index/route.ts` |
| Seed | `prisma/seed.ts` |
| Directus | `directus/snapshots/snapshot.yaml` |
| Tests | `src/lib/loot.test.ts`, `src/lib/entity-links.test.ts` (new), existing `*.test.ts` |

---

# Phase 0 — Pre-flight checks

### Task 0: Verify migration preconditions

**Files:** none (read-only DB checks)

- [ ] **Step 1: Confirm no cross-kind slug collisions**

The new `Entity.slug` is globally unique; today each table is unique only within itself. Run against the dev DB (psql or a throwaway `tsx` script using `prisma.$queryRaw`):

```sql
SELECT slug, count(*) FROM (
  SELECT slug FROM "Item"
  UNION ALL SELECT slug FROM "EnvEntity"
  UNION ALL SELECT slug FROM "TramplerPart"
) s GROUP BY slug HAVING count(*) > 1;
```

Expected: **0 rows.** If any rows return, STOP and report to the user — the merge needs a disambiguation rule (e.g. suffix `-env`) before proceeding.

- [ ] **Step 2: Record baseline row counts** (for post-migration reconciliation)

```sql
SELECT 'item' k, count(*) FROM "Item"
UNION ALL SELECT 'env', count(*) FROM "EnvEntity"
UNION ALL SELECT 'trampler', count(*) FROM "TramplerPart"
UNION ALL SELECT 'recipeIn', count(*) FROM "RecipeInput"
UNION ALL SELECT 'recipeOut', count(*) FROM "RecipeOutput"
UNION ALL SELECT 'lootEntry', count(*) FROM "LootEntry"
UNION ALL SELECT 'cost', count(*) FROM "TramplerPartCost";
```

Save the output in the task notes — Phase 1 Task 3 reconciles against it.

- [ ] **Step 3: Commit** (nothing to commit; record counts in the PR/branch notes instead)

---

# Phase 1 — Schema & data-preserving migration

### Task 1: Rewrite `prisma/schema.prisma`

**Files:**
- Modify: `prisma/schema.prisma` (replace `Item`, `EnvEntity`, `TramplerPart`, `LootTier`, `LootEntry`, `TramplerPartCost`; edit `RecipeInput`, `RecipeOutput`; keep `Recipe`, `SteamUser`, `Proposal`, datasource, generator unchanged)

- [ ] **Step 1: Replace the three entity models + loot/cost models with the unified models**

Delete the `Item`, `EnvEntity`, `TramplerPart`, `LootTier`, `LootEntry`, `TramplerPartCost` blocks. Add:

```prisma
model Entity {
  id          String  @id @default(dbgenerated("(gen_random_uuid())::text"))
  slug        String  @unique
  kind        String  // "item" | "environment" | "trampler-part"
  name        String
  description String?
  category    String
  rarity      String?
  icon        String?
  iconFile    String? @db.Uuid
  imageAlt    String?
  derivedName String? // original scraper name; item search matches against it
  sourceUrl   String?
  lootCurated Boolean @default(false) // env entities: seed skips loot recreate when true

  itemStats     ItemStats?
  tramplerStats TramplerStats?

  producedBy    RecipeOutput[]
  usedIn        RecipeInput[]
  outgoingLinks EntityLink[] @relation("LinkSource") // tabs shown ON this entity (loot, cost…)
  incomingLinks EntityLink[] @relation("LinkTarget") // reverse: where this entity is dropped/used

  @@index([kind])
  @@index([category])
  @@index([rarity])
}

model ItemStats {
  entityId       String  @id
  entity         Entity  @relation(fields: [entityId], references: [id], onDelete: Cascade)
  storageStack   Int?
  workbenchTier  Int?
  statType       String?
  statValue      Int?
  damage         Int?
  playerDamage   Int?
  tramplerDamage Int?
  splashDamage   Int?
  magazine       Int?
  ammoName       String?

  @@index([workbenchTier])
}

model TramplerStats {
  entityId           String  @id
  entity             Entity  @relation(fields: [entityId], references: [id], onDelete: Cascade)
  dimensions         String?
  health             Int?
  weight             Int?
  weightCapacity     Int?
  weightCompensation Int?
  energyConsumption  Int?
  energyCapacity     Int?
  ratedPower         Int?
  crewSlots          Int?
  itemSlots          Int?
  researchNode       String?
  researchName       String?
  researchTier       Int?

  @@index([researchTier])
}

model EntityLink {
  id        String  @id @default(dbgenerated("(gen_random_uuid())::text"))
  sourceId  String
  source    Entity  @relation("LinkSource", fields: [sourceId], references: [id], onDelete: Cascade)
  targetId  String?
  target    Entity? @relation("LinkTarget", fields: [targetId], references: [id], onDelete: SetNull)
  role      String  // "loot" | "cost"
  name      String  // display fallback when targetId is null
  amount    Int?    // cost quantity
  tier      String? // loot drop tier: "Normal" | "Rare" | "Very Rare"
  value1    String? // free-form loot amount strings (e.g. "10-20")
  value2    String?
  value3    String?
  sortOrder Int

  @@index([sourceId, role])
  @@index([targetId])
}
```

- [ ] **Step 2: Repoint `RecipeInput` / `RecipeOutput` from `Item` to `Entity`**

In both models rename the relation field `item Item` → `entity Entity` and FK field `itemId` stays the same name but references `Entity`:

```prisma
model RecipeInput {
  id       String @id @default(dbgenerated("(gen_random_uuid())::text"))
  recipeId String
  recipe   Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  itemId   String
  entity   Entity @relation(fields: [itemId], references: [id], onDelete: Cascade)
  amount   Int

  @@index([itemId])
  @@index([recipeId])
}

model RecipeOutput {
  id       String @id @default(dbgenerated("(gen_random_uuid())::text"))
  recipeId String
  recipe   Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  itemId   String
  entity   Entity @relation(fields: [itemId], references: [id], onDelete: Cascade)
  amount   Int

  @@index([itemId])
  @@index([recipeId])
}
```

> Keeping the column name `itemId` avoids a column rename in the FK repoint SQL. The Prisma relation field is `entity`; query code in Phase 2 uses `entity` instead of `item`.

- [ ] **Step 3: Create the migration as SQL-only (do not let Prisma auto-generate a destructive diff)**

Run: `npx prisma migrate dev --create-only --name unified_entity_model`
Expected: creates `prisma/migrations/<ts>_unified_entity_model/migration.sql` containing Prisma's drop/create guesses. **Discard its body** — Task 2 replaces it with a hand-written, data-preserving script.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(wiki): unified Entity schema (models only, migration pending)"
```

---

### Task 2: Write the data-preserving migration SQL

**Files:**
- Replace: `prisma/migrations/<ts>_unified_entity_model/migration.sql`

- [ ] **Step 1: Write the full migration body**

Replace the file contents with the following. It creates the new tables, backfills **reusing original ids**, repoints recipe FKs, folds loot/cost into `EntityLink`, then drops the old tables.

```sql
-- 1. New tables -------------------------------------------------------------
CREATE TABLE "Entity" (
  "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "slug"        TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT NOT NULL,
  "rarity"      TEXT,
  "icon"        TEXT,
  "iconFile"    UUID,
  "imageAlt"    TEXT,
  "derivedName" TEXT,
  "sourceUrl"   TEXT,
  "lootCurated" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Entity_slug_key" ON "Entity"("slug");
CREATE INDEX "Entity_kind_idx" ON "Entity"("kind");
CREATE INDEX "Entity_category_idx" ON "Entity"("category");
CREATE INDEX "Entity_rarity_idx" ON "Entity"("rarity");

CREATE TABLE "ItemStats" (
  "entityId"       TEXT NOT NULL,
  "storageStack"   INTEGER,
  "workbenchTier"  INTEGER,
  "statType"       TEXT,
  "statValue"      INTEGER,
  "damage"         INTEGER,
  "playerDamage"   INTEGER,
  "tramplerDamage" INTEGER,
  "splashDamage"   INTEGER,
  "magazine"       INTEGER,
  "ammoName"       TEXT,
  CONSTRAINT "ItemStats_pkey" PRIMARY KEY ("entityId")
);
CREATE INDEX "ItemStats_workbenchTier_idx" ON "ItemStats"("workbenchTier");

CREATE TABLE "TramplerStats" (
  "entityId"           TEXT NOT NULL,
  "dimensions"         TEXT,
  "health"             INTEGER,
  "weight"             INTEGER,
  "weightCapacity"     INTEGER,
  "weightCompensation" INTEGER,
  "energyConsumption"  INTEGER,
  "energyCapacity"     INTEGER,
  "ratedPower"         INTEGER,
  "crewSlots"          INTEGER,
  "itemSlots"          INTEGER,
  "researchNode"       TEXT,
  "researchName"       TEXT,
  "researchTier"       INTEGER,
  CONSTRAINT "TramplerStats_pkey" PRIMARY KEY ("entityId")
);
CREATE INDEX "TramplerStats_researchTier_idx" ON "TramplerStats"("researchTier");

CREATE TABLE "EntityLink" (
  "id"        TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "sourceId"  TEXT NOT NULL,
  "targetId"  TEXT,
  "role"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "amount"    INTEGER,
  "tier"      TEXT,
  "value1"    TEXT,
  "value2"    TEXT,
  "value3"    TEXT,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "EntityLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EntityLink_sourceId_role_idx" ON "EntityLink"("sourceId", "role");
CREATE INDEX "EntityLink_targetId_idx" ON "EntityLink"("targetId");

-- 2. Backfill Entity (REUSE original ids) ----------------------------------
INSERT INTO "Entity" ("id","slug","kind","name","description","category","rarity","icon","iconFile","imageAlt","derivedName","sourceUrl","lootCurated")
SELECT "id","slug",'item',"name","description","category","rarity","icon","iconFile","imageAlt","derivedName",NULL,false FROM "Item";

INSERT INTO "Entity" ("id","slug","kind","name","description","category","rarity","icon","iconFile","imageAlt","derivedName","sourceUrl","lootCurated")
SELECT "id","slug",'environment',"name","description","category",NULL,"icon","iconFile",NULL,NULL,"sourceUrl","lootCurated" FROM "EnvEntity";

INSERT INTO "Entity" ("id","slug","kind","name","description","category","rarity","icon","iconFile","imageAlt","derivedName","sourceUrl","lootCurated")
SELECT "id","slug",'trampler-part',"name","description","category",NULL,"icon","iconFile",NULL,NULL,"sourceUrl",false FROM "TramplerPart";

-- 3. Backfill stat extensions ----------------------------------------------
INSERT INTO "ItemStats" ("entityId","storageStack","workbenchTier","statType","statValue","damage","playerDamage","tramplerDamage","splashDamage","magazine","ammoName")
SELECT "id","storageStack","workbenchTier","statType","statValue","damage","playerDamage","tramplerDamage","splashDamage","magazine","ammoName" FROM "Item";

INSERT INTO "TramplerStats" ("entityId","dimensions","health","weight","weightCapacity","weightCompensation","energyConsumption","energyCapacity","ratedPower","crewSlots","itemSlots","researchNode","researchName","researchTier")
SELECT "id","dimensions","health","weight","weightCapacity","weightCompensation","energyConsumption","energyCapacity","ratedPower","crewSlots","itemSlots","researchNode","researchName","researchTier" FROM "TramplerPart";

-- 4. Fold TramplerPartCost -> EntityLink (role 'cost') ----------------------
INSERT INTO "EntityLink" ("sourceId","targetId","role","name","amount","sortOrder")
SELECT "partId","itemId",'cost',"name","amount","sortOrder" FROM "TramplerPartCost";

-- 5. Fold LootTier+LootEntry -> EntityLink (role 'loot') --------------------
-- Global sortOrder = tier rank * 1000 + entry sortOrder, so tiers stay grouped & ordered.
INSERT INTO "EntityLink" ("sourceId","targetId","role","name","amount","tier","value1","value2","value3","sortOrder")
SELECT lt."envEntityId",
       COALESCE(le."itemId", le."containerId"),
       'loot',
       le."name",
       NULL,
       lt."tier",
       le."value1", le."value2", le."value3",
       (lt."sortOrder" * 1000 + le."sortOrder")
FROM "LootEntry" le
JOIN "LootTier" lt ON lt."id" = le."lootTierId";

-- 6. Repoint Recipe FKs from Item -> Entity (ids unchanged) -----------------
ALTER TABLE "RecipeInput"  DROP CONSTRAINT "RecipeInput_itemId_fkey";
ALTER TABLE "RecipeOutput" DROP CONSTRAINT "RecipeOutput_itemId_fkey";
ALTER TABLE "RecipeInput"  ADD CONSTRAINT "RecipeInput_itemId_fkey"  FOREIGN KEY ("itemId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeOutput" ADD CONSTRAINT "RecipeOutput_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. New FK constraints for stat + link tables ------------------------------
ALTER TABLE "ItemStats"     ADD CONSTRAINT "ItemStats_entityId_fkey"     FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TramplerStats" ADD CONSTRAINT "TramplerStats_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntityLink"    ADD CONSTRAINT "EntityLink_sourceId_fkey"    FOREIGN KEY ("sourceId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntityLink"    ADD CONSTRAINT "EntityLink_targetId_fkey"    FOREIGN KEY ("targetId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Drop old tables (order respects FKs) -----------------------------------
DROP TABLE "TramplerPartCost";
DROP TABLE "LootEntry";
DROP TABLE "LootTier";
DROP TABLE "Item";
DROP TABLE "EnvEntity";
DROP TABLE "TramplerPart";
```

> If Task 0 surfaced slug collisions, the corresponding `INSERT INTO "Entity"` for the colliding rows must disambiguate the slug first — add the agreed rule here before running.

- [ ] **Step 2: Apply the migration to the dev DB**

Run: `npx prisma migrate dev`
Expected: applies cleanly, no drift error. If it reports the DB is out of sync, do NOT `migrate reset` (it would wipe Directus-curated data) — debug the SQL.

- [ ] **Step 3: Regenerate the client**

Run: `npx prisma generate`
Expected: success; `Entity`, `ItemStats`, `TramplerStats`, `EntityLink` available on `prisma`.

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations
git commit -m "feat(wiki): data-preserving migration to unified Entity model"
```

---

### Task 3: Reconcile row counts

**Files:** none (verification)

- [ ] **Step 1: Verify the backfill preserved everything**

```sql
SELECT 'entity' k, count(*) FROM "Entity"                       -- = item+env+trampler baseline
UNION ALL SELECT 'entity_item', count(*) FROM "Entity" WHERE kind='item'
UNION ALL SELECT 'itemstats', count(*) FROM "ItemStats"          -- = item baseline
UNION ALL SELECT 'tramplerstats', count(*) FROM "TramplerStats"  -- = trampler baseline
UNION ALL SELECT 'link_cost', count(*) FROM "EntityLink" WHERE role='cost'   -- = cost baseline
UNION ALL SELECT 'link_loot', count(*) FROM "EntityLink" WHERE role='loot';  -- = lootEntry baseline
```

Compare to Task 0 Step 2 baselines. Any mismatch → STOP and debug before touching app code.

- [ ] **Step 2: Spot-check a loot entity and a trampler part**

```sql
SELECT s.slug, l.tier, l.name, l.sortOrder FROM "EntityLink" l
JOIN "Entity" s ON s.id = l."sourceId" WHERE l.role='loot' AND s.slug='crate-of-shells' ORDER BY l.sortOrder;
```
Expected: rows grouped by tier in the original order.

---

# Phase 2 — Read layer (`queries.ts`, `item-filter.ts`)

> All queries move to `prisma.entity` with a `kind` filter. The Prisma relation field on `RecipeInput`/`RecipeOutput` is now `entity` (was `item`). 1:1 stat tables are filtered/included via the `itemStats` / `tramplerStats` relation.

### Task 4: Add the tab-role catalog module

**Files:**
- Create: `src/lib/entity-links.ts`
- Create: `src/lib/entity-links.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { groupLootByTier, type LinkRow } from "./entity-links";

const row = (over: Partial<LinkRow>): LinkRow => ({
  targetSlug: null, targetKind: null, name: "x", icon: null, rarity: null,
  amount: null, tier: null, value1: null, sortOrder: 0, ...over,
});

describe("groupLootByTier", () => {
  it("groups rows into tiers in canonical order, preserving row order", () => {
    const groups = groupLootByTier([
      row({ name: "B", tier: "Rare", sortOrder: 1001 }),
      row({ name: "A", tier: "Normal", sortOrder: 1 }),
      row({ name: "C", tier: "Normal", sortOrder: 2 }),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["Normal", "Rare"]);
    expect(groups[0].rows.map((r) => r.name)).toEqual(["A", "C"]);
  });

  it("puts unknown tiers last and null tier under 'Other'", () => {
    const groups = groupLootByTier([
      row({ name: "Z", tier: null, sortOrder: 5 }),
      row({ name: "A", tier: "Normal", sortOrder: 1 }),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["Normal", "Other"]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- entity-links`
Expected: FAIL — `Cannot find module './entity-links'`.

- [ ] **Step 3: Implement the module**

```ts
/** A flattened EntityLink row as the app consumes it (target resolved to slug/kind/icon). */
export interface LinkRow {
  targetSlug: string | null;
  targetKind: string | null;
  name: string;
  icon: string | null;
  rarity: string | null;
  amount: number | null;
  tier: string | null;
  value1: string | null;
  sortOrder: number;
}

/** Fixed catalog of tab roles. Adding a tab TYPE = add an entry here + a renderer in the page. */
export const LINK_ROLES = {
  loot: { label: "Loot" },
  cost: { label: "Build Cost" },
} as const;
export type LinkRole = keyof typeof LINK_ROLES;

const TIER_ORDER = ["Normal", "Rare", "Very Rare"];

export interface LootTierGroup { tier: string; rows: LinkRow[] }

/** Group loot rows by `tier` into canonical tier order; null tier → "Other" (last). */
export function groupLootByTier(rows: LinkRow[]): LootTierGroup[] {
  const byTier = new Map<string, LinkRow[]>();
  for (const r of rows) {
    const tier = r.tier ?? "Other";
    (byTier.get(tier) ?? byTier.set(tier, []).get(tier)!).push(r);
  }
  const rank = (t: string) => {
    const i = TIER_ORDER.indexOf(t);
    return i === -1 ? TIER_ORDER.length + (t === "Other" ? 1 : 0) : i;
  };
  return [...byTier.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([tier, rs]) => ({ tier, rows: rs.sort((a, b) => a.sortOrder - b.sortOrder) }));
}

/** Map an entity `kind` to its detail-page href prefix. */
export function entityHref(kind: string | null, slug: string): string | null {
  switch (kind) {
    case "item": return `/items/${slug}`;
    case "environment": return `/environment/${slug}`;
    case "trampler-part": return `/tramplers/${slug}`;
    default: return null;
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- entity-links`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/entity-links.ts src/lib/entity-links.test.ts
git commit -m "feat(wiki): tab-role catalog + loot tier grouping helper"
```

---

### Task 5: Rewrite `queries.ts` onto `Entity`

**Files:**
- Modify: `src/lib/queries.ts`

Convert each function as enumerated below. The shapes (icon/rarity/slug selects) are unchanged; only the model and relation names change. The page layer (Phase 3) maps `outgoingLinks` rows through `entity-links.ts`.

- [ ] **Step 1: Item detail + recipe queries**

- `getItemBySlug(slug)` → `prisma.entity.findUnique({ where: { slug }, include: { itemStats: true, producedBy: { include: { recipe: { include: { inputs: { include: { entity: <linkItemSelect> } }, outputs: { include: { entity: <linkItemSelect> } } } } } }, usedIn: { include: { recipe: { include: { inputs: {...}, outputs: {...} } } } } } })` then guard `kind === "item"` (return null otherwise). Where the old code read `recipeInput.item`, read `recipeInput.entity`. Spread `itemStats` fields where `itemStatCells`/`itemDetailRows` expect them (Phase 3 maps this).
  - `<linkItemSelect>` = `{ select: { slug: true, name: true, icon: true, rarity: true } }`.
- `getAmmoByCaliber(caliber)` → `prisma.entity.findMany({ where: { kind: "item", category: "ammo" }, select: { slug, name, icon, rarity, itemStats: { select: { ammoName: true } } } })` then filter by `ammoCaliber(name)` as today. (Caliber is derived from `name`, so `ammoName` may not even be needed here — keep parity with current logic.)
- `getWeaponsByCaliber(caliber)` → `prisma.entity.findMany({ where: { kind: "item", category: { in: ["weapons","artillery"] } }, select: { slug, name, icon, rarity, itemStats: { select: { ammoName: true } } } })` then filter by `weaponCaliber(slug, itemStats?.ammoName)`.

- [ ] **Step 2: Item list/catalog queries**

- `listItems(filter)` → uses `buildItemQuery` (updated in Task 6) which now returns a `where` on `Entity` (with `kind:"item"`); include `itemStats: true` so post-query `applyItemView` / weaponClass filtering can read `ammoName`. Map results so downstream view code sees the stat fields (flatten `itemStats` into the row, or update `applyItemView` to read `row.itemStats?.ammoName`).
- `listRarities(filter)` → `prisma.entity.findMany({ where: <itemWhere>, select: { rarity: true }, distinct: ["rarity"] })`.
- `listWorkbenchTiers(filter)` → `prisma.itemStats.findMany({ where: { entity: <itemWhere>, workbenchTier: { not: null } }, select: { workbenchTier: true }, distinct: ["workbenchTier"], orderBy: { workbenchTier: "asc" } })`.
- `listItemClasses(filter)` → `prisma.entity.findMany({ where: <itemWhere>, select: { slug: true, name: true, itemStats: { select: { ammoName: true } } } })` then `itemClasses(...)` reading `ammoName` from `itemStats`.

- [ ] **Step 3: Environment queries**

- `listEnvEntities(category?)` → `prisma.entity.findMany({ where: { kind: "environment", ...(category ? { category } : {}) }, orderBy: { name: "asc" } })`.
- `envCategoryCounts()` → `prisma.entity.groupBy({ by: ["category"], where: { kind: "environment" }, _count: true })`.
- `getEnvEntityBySlug(slug)` → `prisma.entity.findUnique({ where: { slug }, include: { outgoingLinks: { where: { role: "loot" }, include: { target: { select: { slug: true, kind: true, icon: true, rarity: true } } } } } })` then guard `kind === "environment"`. (Phase 3 maps `outgoingLinks` → `LinkRow[]` → `groupLootByTier`.)
- `getCratesContaining(itemSlug)` → `prisma.entityLink.findMany({ where: { role: "loot", target: { slug: itemSlug } }, include: { source: { select: { slug: true, name: true, kind: true } }, } })` → map to `{ crateSlug: source.slug, crateName: source.name, tier }`. (Drops the `category:"loot-containers"` filter implicitly handled before — keep it by adding `source: { category: "loot-containers" }` to the `where` if the current behavior must be preserved; confirm against `getCratesContaining`'s current filter.)

- [ ] **Step 4: Trampler queries**

- `listTramplerParts(category?)` → `prisma.entity.findMany({ where: { kind: "trampler-part", ...(category ? { category } : {}) }, include: { tramplerStats: true }, orderBy: { name: "asc" } })` (list cards read `dimensions`/research from `tramplerStats`).
- `tramplerCategoryCounts()` → `prisma.entity.groupBy({ by: ["category"], where: { kind: "trampler-part" }, _count: true })`.
- `getTramplerPartBySlug(slug)` → `prisma.entity.findUnique({ where: { slug }, include: { tramplerStats: true, outgoingLinks: { where: { role: "cost" }, include: { target: { select: { slug: true, kind: true, icon: true, rarity: true } } }, orderBy: { sortOrder: "asc" } } } })` then guard `kind === "trampler-part"`.

- [ ] **Step 5: Cross-entity link resolution**

- `getLinkTargetsBySlugs(slugs)` → collapses from 3 queries to 1: `prisma.entity.findMany({ where: { slug: { in: slugs } }, select: { slug: true, name: true, kind: true, rarity: true } })` → `Map(slug → { name, href: entityHref(kind, slug), rarity })`. Use `entityHref` from `entity-links.ts`. Preserve the prior priority only if duplicate slugs were possible — they no longer are (slug is globally unique), so priority logic is removed.

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: errors ONLY in Phase 3 files (pages/views) that still reference old shapes — `queries.ts` itself should type-check. Note remaining errors; they are Phase 3's worklist. (If you prefer an isolated check, the build error list is the to-do.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(wiki): rewrite query layer onto unified Entity"
```

---

### Task 6: Update `item-filter.ts`

**Files:**
- Modify: `src/lib/item-filter.ts`

- [ ] **Step 1: Point `buildItemQuery` at `Entity` + `itemStats`**

`buildItemQuery(filter)` returns `{ where, orderBy }` for `prisma.entity`. Changes:
- Add `kind: "item"` to `where`.
- `name`/`derivedName` substring filters stay on `Entity` (both columns now live on `Entity`).
- `category`, `rarity` stay on `Entity`.
- `workbenchTier` moves under the relation: `where.itemStats = { workbenchTier: filter.workbenchTier }`.
- `applyItemView<T>` post-filter: where it reads `item.ammoName`, read `item.itemStats?.ammoName` (update the `ViewItem` type accordingly), OR have `listItems` flatten `itemStats` onto the row before calling `applyItemView`. Pick flattening for the smallest blast radius and document it in a code comment.

- [ ] **Step 2: Typecheck + existing tests**

Run: `npm test` then `npm run build`
Expected: `item-filter` unit tests (if any) pass; build errors confined to pages/views.

- [ ] **Step 3: Commit**

```bash
git add src/lib/item-filter.ts
git commit -m "feat(wiki): item filter targets Entity + itemStats relation"
```

---

# Phase 3 — View libs & pages

### Task 7: Adapt view libs to the stat-extension shape

**Files:**
- Modify: `src/components/StatBox.tsx`, `src/lib/item-view.ts`, `src/lib/trampler-view.ts`, `src/lib/loot.ts`

- [ ] **Step 1: Keep the view interfaces; change only the call sites' inputs**

The view functions already take narrow field-bag interfaces (`ItemStatFields`, `TramplerStatFields`, `ItemFacts`, `TramplerResearchFields`, `LootEntryRef`). **Do not change these interfaces.** The pages (Task 8–10) pass `entity.itemStats` / `entity.tramplerStats` into them. Verify the field names on those interfaces match the new `ItemStats`/`TramplerStats` columns exactly (they do — same names). No code change expected here unless build flags a mismatch.

- [ ] **Step 2: Update `loot.ts` to the `LinkRow` source**

`lootEntryView(e)` currently takes `{ name, item, container }`. Replace its input with a `LinkRow` (from `entity-links.ts`): derive `href = entityHref(targetKind, targetSlug)` when `targetSlug` is set, else `null`; `icon`/`rarity`/`name` from the row. Update `LootEntryView` consumers in Task 9. Keep `byRarityThenName` sorting usage.

- [ ] **Step 3: Run tests + typecheck**

Run: `npm test` then `npm run build`
Expected: `loot.test.ts` updated (Task 12) — for now build errors localize to pages.

- [ ] **Step 4: Commit**

```bash
git add src/lib/loot.ts src/lib/item-view.ts src/lib/trampler-view.ts src/components/StatBox.tsx
git commit -m "feat(wiki): view libs consume stat-extension + LinkRow shapes"
```

---

### Task 8: Item detail page

**Files:**
- Modify: `src/app/items/[slug]/page.tsx`

- [ ] **Step 1: Adapt to the new `getItemBySlug` shape**

- `item.itemStats` now holds `storageStack`/`workbenchTier`/`statValue`/`damage`/`magazine`/`ammoName`/`statType`. Pass `item.itemStats` to `itemStatCells(...)` and build `ItemFacts` from `item.itemStats` (`storageStack`, `workbenchTier`, `value: item.itemStats?.statValue`).
- `isAmmo`/caliber: `item.category === "ammo"` unchanged; `weaponCaliber(item.slug, item.itemStats?.ammoName)`.
- Recipe cards: `classifyTrades` consumes `item.craftedBy`/`item.usedIn` which are now built from `recipeOutput.entity`/`recipeInput.entity` in `getItemBySlug` — ensure `toRecipeCard` mapping reads `.entity` (do this inside `getItemBySlug` so the page is unaffected).
- Tabs (`crafted-by`, `used-in`, `ammo`, `used-by`, `loot`): unchanged logic; `drops` still from `getCratesContaining`.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: this page compiles. Fix any field-path errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/items/[slug]/page.tsx src/lib/queries.ts
git commit -m "feat(wiki): item detail page on unified Entity"
```

---

### Task 9: Environment detail page — single Loot tab

**Files:**
- Modify: `src/app/environment/[slug]/page.tsx`, `src/components/LootTable.tsx`

- [ ] **Step 1: Map `outgoingLinks` → one Loot tab grouped by tier**

Replace the per-`lootTier` tab mapping with:

```tsx
const lootRows: LinkRow[] = entity.outgoingLinks.map((l) => ({
  targetSlug: l.target?.slug ?? null,
  targetKind: l.target?.kind ?? null,
  name: l.name,
  icon: l.target?.icon ?? null,
  rarity: l.target?.rarity ?? null,
  amount: l.amount,
  tier: l.tier,
  value1: l.value1,
  sortOrder: l.sortOrder,
}));
const tierGroups = groupLootByTier(lootRows);
const tabs: Tab[] = tierGroups.length > 0 ? [{
  id: "loot",
  label: "Loot",
  content: (
    <div className="space-y-4">
      {tierGroups.map((g) => (
        <section key={g.tier}>
          <h3 className="text-sm font-semibold text-base-content/70 mb-2">{g.tier}</h3>
          <LootTable entries={g.rows.map(lootEntryView).sort(byRarityThenName)} />
        </section>
      ))}
    </div>
  ),
}] : [];
```

> This delivers the user's goal — one Loot tab, tier shown per group (a `<h3>` heading per tier) instead of one tab per tier. `LootTable` itself is unchanged (still an icon grid); only its wrapper changes. If a flat single grid with per-icon tier badges is preferred over per-tier subsections, that is a rendering-only follow-up (spec open question) — do the subsection version now.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: environment page compiles.

- [ ] **Step 3: Commit**

```bash
git add src/app/environment/[slug]/page.tsx src/components/LootTable.tsx src/lib/loot.ts
git commit -m "feat(wiki): environment loot as a single tier-grouped tab"
```

---

### Task 10: Trampler detail + all list pages + search index

**Files:**
- Modify: `src/app/tramplers/[slug]/page.tsx`, `src/app/tramplers/page.tsx`, `src/app/items/page.tsx`, `src/app/environment/page.tsx`, `src/app/api/search-index/route.ts`

- [ ] **Step 1: Trampler detail page**

- Stats: pass `part.tramplerStats` to `tramplerStatCells(...)` and `tramplerDetailRows(...)`.
- Build Cost tab: `part.outgoingLinks` (role `"cost"`) → `ItemIconLink` per row: `slug = l.target?.slug`, `name = l.name`, `icon = l.target?.icon`, `amount = l.amount`, `rarity = l.target?.rarity`.

- [ ] **Step 2: Trampler list page** — cards read `part.tramplerStats?.dimensions` / research fields (now nested). Confirm `listTramplerParts` includes `tramplerStats`.

- [ ] **Step 3: Items + environment list pages** — these call `listItems`/`listEnvEntities`/count queries whose return rows are still `Entity` rows; verify card components read fields that remain on `Entity` (name, slug, icon, rarity, category). If a card reads `workbenchTier`, source it from the flattened `itemStats` (Task 6 Step 1).

- [ ] **Step 4: Search index route** —
  - items: `prisma.entity.findMany({ where: { kind: "item" }, select: { slug, name, category, derivedName } })`.
  - places: `prisma.entity.findMany({ where: { kind: "environment", category: { in: ["loot-containers","landmarks"] } }, select: { slug, name, category } })`.

- [ ] **Step 5: Full build + lint**

Run: `npm run build && npm run lint`
Expected: **clean build, no type errors, no lint errors.** This is the gate that the entire read+view+page layer is consistent.

- [ ] **Step 6: Commit**

```bash
git add src/app
git commit -m "feat(wiki): trampler/list/search pages on unified Entity"
```

---

# Phase 4 — Seed rewrite

### Task 11: Rewrite `prisma/seed.ts`

**Files:**
- Modify: `prisma/seed.ts`

The seed reads the same JSON inputs (`data.json`, `gear.json`, `icons.json`, `trampler-icons.json`, `wiki-enrichment.json`, `env-content.json`) — **input shapes do not change.** Only the write target changes.

- [ ] **Step 1: Items → `Entity(kind:"item")` + `ItemStats`**

Replace the `prisma.item.upsert` with an `Entity` upsert (by `slug`) writing identity fields (set `kind:"item"`, `derivedName: i.name`), and a nested/`itemStats` upsert for the stat fields. Pattern:

```ts
await prisma.entity.upsert({
  where: { slug: i.slug },
  create: {
    slug: i.slug, kind: "item", name: i.displayName ?? i.name, derivedName: i.name,
    description: opt(i.description), category: categoryForItem(i.type, i.displayName ?? i.name, i.slug),
    icon: iconFor(i.id), rarity,
    itemStats: { create: { storageStack: opt(i.storageStack), workbenchTier: opt(i.workbenchTier),
      statType: opt(flat.statType), statValue: opt(flat.statValue), damage: opt(flat.damage),
      playerDamage: opt(flat.playerDamage), tramplerDamage: opt(flat.tramplerDamage),
      splashDamage: opt(flat.splashDamage), magazine: opt(flat.magazine), ammoName: opt(flat.ammoName) } },
  },
  update: {
    name: i.displayName ?? i.name, derivedName: i.name, description: opt(i.description),
    category: categoryForItem(...), icon: iconFor(i.id), rarity,
    itemStats: { upsert: { create: {/* same stat fields */}, update: {/* same stat fields */} } },
  },
});
```

Preserve the `opt()` helper (omits null/undefined to keep Directus edits). Pruning: `prisma.entity.deleteMany({ where: { kind: "item", slug: { notIn: items.map(i=>i.slug) } } })`.

- [ ] **Step 2: Recipes** — replace `itemId: need(l.item)` mapping unchanged (column name `itemId` kept). The nested `create` for `inputs`/`outputs` still uses `{ itemId, amount }`. Recipe pruning unchanged.

- [ ] **Step 3: Env entities → `Entity(kind:"environment")` + loot as `EntityLink`**

- Entity upsert by slug with `kind:"environment"`, `category`, `name`, `description`, `sourceUrl`.
- Loot: respect `lootCurated` exactly as today — read current `entity.lootCurated` from DB; if `true`, skip. Else delete + recreate **EntityLink role 'loot'** rows for that source:
  ```ts
  await prisma.entityLink.deleteMany({ where: { sourceId: entity.id, role: "loot" } });
  // for each tier t (rank index ti) and entry en (index ei):
  await prisma.entityLink.create({ data: {
    sourceId: entity.id, role: "loot",
    targetId: en.itemSlug ? idBySlug.get(en.itemSlug) ?? null : null,
    name: en.name, tier: t.tier, value1: en.value1, value2: en.value2, value3: en.value3,
    sortOrder: ti * 1000 + ei,
  }});
  ```
  (`idBySlug` now maps slug→Entity id; build it once from `prisma.entity.findMany({ where:{kind:"item"}, select:{id,slug} })`.) Drop `col1Label`/`col2Label`/`col3Label` — they no longer exist.
- Pruning: `prisma.entity.deleteMany({ where: { kind: "environment", slug: { notIn: envSlugs } } })`.

- [ ] **Step 4: Trampler parts → `Entity(kind:"trampler-part")` + `TramplerStats` + cost as `EntityLink`**

- Entity upsert by slug (`kind:"trampler-part"`, identity fields, `icon: tramplerIconFor(slug) ?? opt(t.icon)`); nested `tramplerStats` upsert for the stat/research fields.
- Cost: delete + recreate **EntityLink role 'cost'**:
  ```ts
  await prisma.entityLink.deleteMany({ where: { sourceId: part.id, role: "cost" } });
  await prisma.entityLink.createMany({ data: rows.map((c, i) => ({
    sourceId: part.id, role: "cost",
    targetId: c.itemSlug ? idBySlug.get(c.itemSlug) ?? null : null,
    name: c.name, amount: c.amount, sortOrder: c.sortOrder ?? i,
  })) });
  ```
- Pruning: `prisma.entity.deleteMany({ where: { kind: "trampler-part", slug: { notIn: tramplerSlugs } } })`.

- [ ] **Step 5: Run the seed against the dev DB and verify idempotency**

Run: `npm run db:seed` (twice)
Expected: completes without error both times; second run is a no-op-ish upsert (no duplicate links — the delete-recreate guarantees this). Spot-check counts unchanged vs Phase 1 Task 3.

> CAUTION: the seed prunes by `kind`. Confirm with the user before running against any DB holding Directus-curated rows that aren't in the JSON — pruning would delete them. The user's snapshot covers rollback.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(wiki): seed writes unified Entity + ItemStats/TramplerStats + EntityLink"
```

---

# Phase 5 — Directus snapshot

### Task 12: Reconfigure `directus/snapshots/snapshot.yaml`

**Files:**
- Modify: `directus/snapshots/snapshot.yaml`

Mirror the existing `Recipe.inputs/outputs` nested-editing pattern (O2M alias + `relations:` entry + M2O dropdown). This is config-only; no app code.

- [ ] **Step 1: Remove old collections, add new ones**

- Delete `collections`/`fields`/`relations` entries for `Item`, `EnvEntity`, `TramplerPart`, `LootTier`, `LootEntry`, `TramplerPartCost`.
- Add `Entity` collection (`display_template: '{{name}}'`), carrying the identity fields. Re-use the previous `Item` field configs for `rarity` (select-dropdown choices), `category` (choices — now the union of item+env+trampler categories), `icon` (`display: image-path`), `iconFile` (`interface: file-image`, `special:[file]`), `id` (readonly). Add a `kind` select-dropdown (`item`/`environment`/`trampler-part`) and a `lootCurated` boolean (note: *"On = importer won't overwrite this entity's loot"*).
- Add `ItemStats` + `TramplerStats` collections with their scalar fields, and an O2M alias on `Entity` (`itemStats`, `tramplerStats`) wired via `relations:` with `one_field` — OR present them as M2O-from-child; simplest is to expose them as related collections editable from the Entity form via O2M alias (1:1 modeled as O2M with a single row). Reuse the `Item.statType`/`ammoName`/`workbenchTier` dropdown choices on the `ItemStats` fields.
- Add `EntityLink` collection. Fields: `sourceId` (M2O→Entity), `targetId` (M2O→Entity, nullable, `display: related-values` `{{name}}`), `role` (select-dropdown: `loot`/`cost`), `name`, `amount`, `tier` (select-dropdown: Normal/Rare/Very Rare), `value1-3`, `sortOrder`.

- [ ] **Step 2: Wire nested editing (mirror Recipe)**

- O2M alias `outgoingLinks` on `Entity` (`interface: list-o2m`, `special:[o2m]`, template `'{{role}}: {{name}}'`, sorted by `sortOrder`).
- `relations:` entry: `EntityLink.sourceId → Entity` with `meta.one_field: outgoingLinks`, `on_delete: CASCADE`.
- `relations:` entry: `EntityLink.targetId → Entity` (M2O, `one_deselect_action: nullify`, `on_delete: SET NULL`).
- `relations:` entries: `RecipeInput.itemId → Entity` and `RecipeOutput.itemId → Entity` (update the existing `foreign_key_table: Item` → `Entity`; M2O display template `{{name}}`).
- `relations:` entries: `ItemStats.entityId → Entity`, `TramplerStats.entityId → Entity` with `one_field` aliases.

- [ ] **Step 3: Apply and verify in Studio**

Run: `npm run directus:up` then `npm run directus:apply`
Expected: applies without error. Manually open Directus Studio (`http://localhost:8055`): confirm an `Entity` row shows its stat extension + nested `outgoingLinks` editor; confirm the `EntityLink` target picker resolves entity names; confirm a recipe still edits inputs/outputs.

- [ ] **Step 4: Re-snapshot to normalize and commit**

Run: `npm run directus:snapshot` (captures the applied state back to YAML)
```bash
git add directus/snapshots/snapshot.yaml
git commit -m "feat(wiki): Directus snapshot for unified Entity + EntityLink"
```

---

# Phase 6 — Tests & full verification

### Task 13: Update affected unit tests

**Files:**
- Modify: `src/lib/loot.test.ts` (if it asserts the old `LootEntryRef` shape), `src/lib/trades.test.ts` (fixtures use `RecipeCard` — unaffected, confirm), any `prisma/*.test.ts` data-validation tests that read old field names.

- [ ] **Step 1: Update `loot.test.ts` to the `LinkRow` input**

Rewrite `lootEntryView` test fixtures from `{ name, item, container }` to the `LinkRow` shape; assert `href` derivation (item → `/items/slug`, environment → `/environment/slug`, name-only → null).

- [ ] **Step 2: Run the full unit suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/lib/loot.test.ts
git commit -m "test(wiki): loot view tests on LinkRow shape"
```

---

### Task 14: End-to-end + manual acceptance

**Files:** none

- [ ] **Step 1: Build + e2e**

Run: `npm run build && npm run test:e2e`
Expected: build clean; Playwright suite (`tests/e2e/wiki.spec.ts`) passes. If any e2e asserts on per-rarity loot tabs, update it to the single "Loot" tab with tier subsections.

- [ ] **Step 2: Manual smoke (dev server)**

Run: `npm run dev`, then verify:
- An item page: stats grid, detail sidebar (stack/tier/value/trades), Crafted-by/Used-in/Ammo/Loot tabs all render.
- An environment container (`crate-of-shells`): a single **Loot** tab with Normal/Rare/Very Rare subsections, icons linking correctly.
- A landmark with curated loot: loot preserved.
- A trampler part: stats grid, research detail rows, Build Cost tab with amounts.
- Search autocomplete returns items + places.
- A `[[slug]]` description link resolves for an item, an env entity, and a trampler part.

- [ ] **Step 3: Final commit / branch ready**

```bash
git commit --allow-empty -m "chore(wiki): unified Entity migration verified (build+e2e+manual)"
```

Then hand off to `superpowers:finishing-a-development-branch` for merge/PR.

---

## Self-review notes (coverage map)

| Spec section | Covered by |
|---|---|
| Generic `Entity` core | Task 1, 2 |
| Typed per-kind stat tables | Task 1, 2, 7, 11 |
| All relations repoint at `Entity` | Task 2 (FK repoint), 5, 11 |
| Generic `EntityLink` + role catalog | Task 1, 4, 5, 9, 10, 11 |
| Loot flattened to per-row `tier`, single tab | Task 2 (SQL), 4, 9, 11 |
| Recipes stay first-class | Task 1, 5 (relation `entity`), 8 |
| Directus de-fragmentation | Task 12 |
| Landmark-loot interaction (curated, container target) | Task 11 Step 3 (`lootCurated`), Task 2 (`COALESCE(itemId, containerId)`) |
| Page boilerplate reduction | Task 5, 8–10 |
| Verification (build/lint/test/e2e/manual) | Task 10 Step 5, Task 13, 14 |

**Decisions deferred to execution (flag if blocking):**
- Loot rendering: per-tier subsections now vs. flat grid with per-icon tier badge later (Task 9 picks subsections).
- `getCratesContaining` source-category filter: confirm whether to keep the `loot-containers` restriction (Task 5 Step 3).
- Landmark-loot sequencing (ship-first vs supersede): this plan **supersedes** by building loot directly on `EntityLink`; the approved landmark-loot plan's container + curated features are folded in here.
