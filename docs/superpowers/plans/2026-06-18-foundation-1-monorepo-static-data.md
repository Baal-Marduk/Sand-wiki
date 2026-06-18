# Foundation Part 1 — Monorepo Skeleton + Static Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an npm-workspaces monorepo, move the wiki into `apps/wiki`, build a `@sandlabs/data` package that serves entity/recipe/link data from committed JSON, and rewrite the wiki's read path to use it — leaving the Postgres entity tables in place so output can be compared 1:1.

**Architecture:** A one-time export reads today's dev Neon DB and writes denormalized JSON into `packages/data/generated/`. `@sandlabs/data` imports that JSON at build time, builds in-memory `Map` indexes, and exposes typed accessors. The wiki's `src/lib/queries.ts` keeps its exact public signatures but swaps its internals from `prisma.entity.*` to `@sandlabs/data` accessors. No DB drop happens in this plan.

**Tech Stack:** npm workspaces, Next.js 16, React 19, TypeScript 5, Prisma 6 (for the export only), Vitest 4, tsx.

**Spec:** `docs/superpowers/specs/2026-06-18-monorepo-static-foundation-design.md`
**Branch:** `feat/monorepo-static-foundation` (already created)

---

## File Structure (created/modified by this plan)

```
SandLabs/
  package.json                                  # CREATE — workspaces root
  apps/
    wiki/                                        # MOVE (git mv sand-wiki apps/wiki)
      next.config.ts                             # MODIFY — transpilePackages: ["@sandlabs/data"]
      package.json                               # MODIFY — add @sandlabs/data dep + export script
      scripts/export-entities.ts                 # CREATE — one-time dev-DB → JSON export
      src/lib/queries.ts                          # MODIFY — internals swapped to @sandlabs/data
  packages/
    data/
      package.json                               # CREATE — name @sandlabs/data
      tsconfig.json                              # CREATE
      vitest.config.ts                           # CREATE
      generated/                                 # CREATE (committed export output)
        entities.json
        recipes.json
        links.json
      src/
        types.ts                                 # CREATE — Entity/stats/link/recipe types
        store.ts                                 # CREATE — load JSON + build indexes
        accessors.ts                             # CREATE — typed query accessors
        index.ts                                 # CREATE — public surface
        store.test.ts                            # CREATE
        accessors.test.ts                        # CREATE
        fixtures.ts                              # CREATE — small in-memory fixture for tests
```

> **Note on the export script location:** the spec places datamining in `packages/datamine`. The one-time export depends on the Prisma client + `.env`, which live in `apps/wiki` during this phase, so the bridge script lives in `apps/wiki/scripts/`. The real per-patch pipeline (spec #2) supersedes it; this script can be deleted/relocated then.

---

## Task 1: Create the npm-workspaces root

**Files:**
- Create: `package.json` (repo root)

- [ ] **Step 1: Inspect the current root for an existing package.json**

Run: `ls -la package.json 2>/dev/null; cat package.json 2>/dev/null`
Expected: no root `package.json` yet (only `node_modules/` exists from prior tooling). If one exists, STOP and reconcile manually.

- [ ] **Step 2: Create the workspaces root `package.json`**

```json
{
  "name": "sandlabs",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=apps/wiki",
    "build": "npm run build --workspace=apps/wiki",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspace=apps/wiki"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(monorepo): add npm workspaces root"
```

---

## Task 2: Move the wiki into `apps/wiki`

**Files:**
- Move: `sand-wiki/` → `apps/wiki/` (history-preserving)

- [ ] **Step 1: Move the directory with git**

```bash
mkdir -p apps
git mv sand-wiki apps/wiki
```

- [ ] **Step 2: Remove the wiki's nested node_modules and lockfile so the workspace install is authoritative**

The root install will hoist dependencies. Remove the per-app install artifacts (they are gitignored, so this only touches the working tree):

```bash
rm -rf apps/wiki/node_modules apps/wiki/package-lock.json
```

- [ ] **Step 3: Install from the root to create the workspace symlinks**

Run: `npm install`
Expected: completes; creates root `node_modules` with `apps/wiki` resolvable. Prisma `postinstall` (`prisma generate`) runs for `apps/wiki`.

> If `prisma generate` fails because it can't find the schema, that is expected to still work — the schema is at `apps/wiki/prisma/schema.prisma` and the postinstall runs in that workspace's cwd.

- [ ] **Step 4: Verify the wiki still builds in its new location (still on Prisma)**

Run: `npm run build --workspace=apps/wiki`
Expected: a successful Next.js production build. If it fails, do NOT proceed — fix path/config breakage from the move first.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(monorepo): move sand-wiki to apps/wiki"
```

---

## Task 3: Scaffold the `@sandlabs/data` package

**Files:**
- Create: `packages/data/package.json`
- Create: `packages/data/tsconfig.json`
- Create: `packages/data/vitest.config.ts`
- Create: `packages/data/generated/.gitkeep` (placeholder until Task 6 fills it)

- [ ] **Step 1: Create `packages/data/package.json`**

```json
{
  "name": "@sandlabs/data",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run --passWithNoTests"
  },
  "devDependencies": {
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Create `packages/data/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "generated"]
}
```

- [ ] **Step 3: Create `packages/data/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 4: Create the generated dir placeholder**

```bash
mkdir -p packages/data/generated
printf '[]' > packages/data/generated/entities.json
printf '[]' > packages/data/generated/recipes.json
printf '[]' > packages/data/generated/links.json
```

(Empty arrays let the package typecheck and tests run before the real export in Task 6.)

- [ ] **Step 5: Install so the workspace is linked**

Run: `npm install`
Expected: `@sandlabs/data` appears as a workspace; no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/data package.json package-lock.json
git commit -m "feat(data): scaffold @sandlabs/data package"
```

---

## Task 4: Define the data-layer types

**Files:**
- Create: `packages/data/src/types.ts`

These mirror the Prisma models but are hand-authored (Prisma's generated types go away in Plan 2). Field names and nullability match `apps/wiki/prisma/schema.prisma` exactly so the wiki's consumers compile unchanged.

- [ ] **Step 1: Create `packages/data/src/types.ts`**

```ts
// Hand-authored static-data types. Field names/nullability mirror the (soon-removed)
// Prisma entity models so the wiki's existing consumers compile unchanged.

export interface ItemStats {
  storageStack: number | null;
  workbenchTier: number | null;
  statType: string | null;
  statValue: number | null;
  damage: number | null;
  playerDamage: number | null;
  tramplerDamage: number | null;
  splashDamage: number | null;
  magazine: number | null;
  ammoName: string | null;
  ammoType: string | null;
  reloadSeconds: number | null;
  rangeFull: number | null;
  rangeMax: number | null;
  rangeMinMult: number | null;
  rangeFalloff: boolean | null;
  penetrates: boolean | null;
  armorRating: number | null;
  armorRegenDelay: number | null;
  armorRegenSpeed: number | null;
  armorDurability: number | null;
  fireRate: number | null;
  projectileVelocity: number | null;
}

export interface TramplerStats {
  dimensions: string | null;
  health: number | null;
  weight: number | null;
  weightCapacity: number | null;
  weightCompensation: number | null;
  energyConsumption: number | null;
  energyCapacity: number | null;
  ratedPower: number | null;
  crewSlots: number | null;
  itemSlots: number | null;
  researchNode: string | null;
  researchName: string | null;
  researchTier: number | null;
}

export interface TechNodeStats {
  faction: string;
  tier: number;
  sortOrder: number | null;
}

export interface Entity {
  id: string;
  slug: string;
  kind: string; // "item" | "environment" | "trampler-part" | "tech-node"
  name: string;
  description: string | null;
  category: string;
  rarity: string | null;
  icon: string | null;
  imageAlt: string | null;
  derivedName: string | null;
  sourceUrl: string | null;
  disabled: boolean;
  itemStats: ItemStats | null;
  tramplerStats: TramplerStats | null;
  techNodeStats: TechNodeStats | null;
}

/** A directed link between two entities (or a name-only link with no target). */
export interface EntityLink {
  sourceSlug: string;
  targetSlug: string | null;
  role: string;
  name: string;
  amount: number | null;
  tier: string | null;
  value1: string | null;
  value2: string | null;
  value3: string | null;
  sortOrder: number;
  buyGroup: number | null;
}

export interface RecipeLineRow {
  itemSlug: string;
  amount: number;
}

export interface Recipe {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  locationSlug: string | null;
  inputs: RecipeLineRow[];
  outputs: RecipeLineRow[];
}

/** The full on-disk dataset shape (one per generated/*.json file). */
export interface DataSet {
  entities: Entity[];
  recipes: Recipe[];
  links: EntityLink[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p packages/data/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/data/src/types.ts
git commit -m "feat(data): add static-data types"
```

---

## Task 5: Build the store (load JSON + indexes)

**Files:**
- Create: `packages/data/src/fixtures.ts`
- Create: `packages/data/src/store.ts`
- Test: `packages/data/src/store.test.ts`

The store builds the indexes every accessor relies on. It accepts an injected `DataSet` (for tests) and defaults to the generated JSON.

- [ ] **Step 1: Write the test fixture**

`packages/data/src/fixtures.ts`:

```ts
import type { DataSet } from "./types";

/** Minimal hand-built dataset exercising every index: an item produced by a recipe,
 *  a container that loots it, a trampler part with a cost link, a tech node, and a
 *  disabled item that must be scrubbed. */
export const fixture: DataSet = {
  entities: [
    {
      id: "1", slug: "iron", kind: "item", name: "Iron", description: null,
      category: "resources", rarity: "Common", icon: "/i/iron.png", imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: null, tramplerStats: null, techNodeStats: null,
    },
    {
      id: "2", slug: "rifle", kind: "item", name: "Rifle", description: null,
      category: "weapons", rarity: "Rare", icon: "/i/rifle.png", imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: { ...nullStats(), workbenchTier: 2, ammoType: "9x42 mm" },
      tramplerStats: null, techNodeStats: null,
    },
    {
      id: "3", slug: "ammo-9x42", kind: "item", name: "9x42 mm Ammo", description: null,
      category: "ammo", rarity: "Common", icon: "/i/ammo.png", imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: { ...nullStats(), ammoType: "9x42 mm" },
      tramplerStats: null, techNodeStats: null,
    },
    {
      id: "4", slug: "crate", kind: "environment", name: "Crate", description: null,
      category: "loot-containers", rarity: null, icon: "/i/crate.png", imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: null, tramplerStats: null, techNodeStats: null,
    },
    {
      id: "5", slug: "hull", kind: "trampler-part", name: "Hull", description: null,
      category: "chassis", rarity: "Common", icon: "/i/hull.png", imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: null,
      tramplerStats: { ...nullTrampler(), researchTier: 1 },
      techNodeStats: null,
    },
    {
      id: "6", slug: "tech-kaiser-t1a-hull", kind: "tech-node", name: "Hull Tech",
      description: null, category: "tech", rarity: null, icon: null, imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: false,
      itemStats: null, tramplerStats: null,
      techNodeStats: { faction: "kaiser", tier: 1, sortOrder: 0 },
    },
    {
      id: "7", slug: "ghost", kind: "item", name: "Ghost", description: null,
      category: "resources", rarity: "Common", icon: null, imageAlt: null,
      derivedName: null, sourceUrl: null, disabled: true,
      itemStats: null, tramplerStats: null, techNodeStats: null,
    },
  ],
  recipes: [
    {
      slug: "rifle-recipe", workbench: "Bench", tier: 2, craftTimeSeconds: 5,
      locationSlug: null,
      inputs: [{ itemSlug: "iron", amount: 3 }],
      outputs: [{ itemSlug: "rifle", amount: 1 }],
    },
  ],
  links: [
    { sourceSlug: "crate", targetSlug: "iron", role: "loot", name: "Iron", amount: null, tier: "Tier 1", value1: "50", value2: null, value3: null, sortOrder: 0, buyGroup: null },
    { sourceSlug: "crate", targetSlug: "ghost", role: "loot", name: "Ghost", amount: null, tier: "Tier 1", value1: "1", value2: null, value3: null, sortOrder: 1, buyGroup: null },
    { sourceSlug: "hull", targetSlug: "iron", role: "cost", name: "Iron", amount: 10, tier: null, value1: null, value2: null, value3: null, sortOrder: 0, buyGroup: null },
    { sourceSlug: "tech-kaiser-t1a-hull", targetSlug: "hull", role: "tech-unlocks", name: "Hull", amount: null, tier: null, value1: null, value2: null, value3: null, sortOrder: 0, buyGroup: null },
  ],
};

function nullStats() {
  return {
    storageStack: null, workbenchTier: null, statType: null, statValue: null,
    damage: null, playerDamage: null, tramplerDamage: null, splashDamage: null,
    magazine: null, ammoName: null, ammoType: null, reloadSeconds: null,
    rangeFull: null, rangeMax: null, rangeMinMult: null, rangeFalloff: null,
    penetrates: null, armorRating: null, armorRegenDelay: null, armorRegenSpeed: null,
    armorDurability: null, fireRate: null, projectileVelocity: null,
  };
}
function nullTrampler() {
  return {
    dimensions: null, health: null, weight: null, weightCapacity: null,
    weightCompensation: null, energyConsumption: null, energyCapacity: null,
    ratedPower: null, crewSlots: null, itemSlots: null,
    researchNode: null, researchName: null, researchTier: null,
  };
}
```

- [ ] **Step 2: Write the failing test**

`packages/data/src/store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createStore } from "./store";
import { fixture } from "./fixtures";

describe("store indexes", () => {
  const s = createStore(fixture);

  it("indexes entities by slug", () => {
    expect(s.bySlug.get("rifle")?.name).toBe("Rifle");
    expect(s.bySlug.get("nope")).toBeUndefined();
  });

  it("indexes entities by kind", () => {
    expect(s.byKind.get("item")?.map((e) => e.slug).sort()).toEqual(["ammo-9x42", "ghost", "iron", "rifle"]);
    expect(s.byKind.get("trampler-part")?.length).toBe(1);
  });

  it("indexes outgoing and incoming links", () => {
    expect(s.linksFrom.get("crate")?.length).toBe(2);
    expect(s.linksTo.get("iron")?.map((l) => l.role).sort()).toEqual(["cost", "loot"]);
  });

  it("indexes recipes by output, input and location", () => {
    expect(s.recipesByOutput.get("rifle")?.[0].slug).toBe("rifle-recipe");
    expect(s.recipesByInput.get("iron")?.[0].slug).toBe("rifle-recipe");
    expect(s.recipesByLocation.get("nowhere")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test --workspace=packages/data`
Expected: FAIL — `createStore` is not exported from `./store`.

- [ ] **Step 4: Implement the store**

`packages/data/src/store.ts`:

```ts
import type { DataSet, Entity, EntityLink, Recipe } from "./types";

export interface Store {
  entities: Entity[];
  recipes: Recipe[];
  links: EntityLink[];
  bySlug: Map<string, Entity>;
  byKind: Map<string, Entity[]>;
  linksFrom: Map<string, EntityLink[]>;
  linksTo: Map<string, EntityLink[]>;
  recipesByOutput: Map<string, Recipe[]>;
  recipesByInput: Map<string, Recipe[]>;
  recipesByLocation: Map<string, Recipe[]>;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

/** Build all in-memory indexes from a dataset. Pure — no I/O. */
export function createStore(data: DataSet): Store {
  const bySlug = new Map<string, Entity>();
  const byKind = new Map<string, Entity[]>();
  for (const e of data.entities) {
    bySlug.set(e.slug, e);
    push(byKind, e.kind, e);
  }

  const linksFrom = new Map<string, EntityLink[]>();
  const linksTo = new Map<string, EntityLink[]>();
  for (const l of data.links) {
    push(linksFrom, l.sourceSlug, l);
    if (l.targetSlug !== null) push(linksTo, l.targetSlug, l);
  }

  const recipesByOutput = new Map<string, Recipe[]>();
  const recipesByInput = new Map<string, Recipe[]>();
  const recipesByLocation = new Map<string, Recipe[]>();
  for (const r of data.recipes) {
    for (const o of r.outputs) push(recipesByOutput, o.itemSlug, r);
    for (const i of r.inputs) push(recipesByInput, i.itemSlug, r);
    if (r.locationSlug !== null) push(recipesByLocation, r.locationSlug, r);
  }

  return {
    entities: data.entities, recipes: data.recipes, links: data.links,
    bySlug, byKind, linksFrom, linksTo,
    recipesByOutput, recipesByInput, recipesByLocation,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test --workspace=packages/data`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/store.ts packages/data/src/store.test.ts packages/data/src/fixtures.ts
git commit -m "feat(data): in-memory store with slug/kind/link/recipe indexes"
```

---

## Task 6: One-time export — dev DB → committed JSON

**Files:**
- Create: `apps/wiki/scripts/export-entities.ts`
- Modify: `apps/wiki/package.json` (add `data:export` script)
- Output (committed): `packages/data/generated/{entities,recipes,links}.json`

This is a script, not a TDD unit (it talks to the live dev DB). It is verified by a round-trip test in Task 7.

- [ ] **Step 1: Add the export script to `apps/wiki/package.json` scripts**

Add this line to the `"scripts"` block:

```json
    "data:export": "tsx scripts/export-entities.ts",
```

- [ ] **Step 2: Write the export script**

`apps/wiki/scripts/export-entities.ts`:

```ts
// One-time bridge: read today's dev Neon DB and write denormalized JSON into
// packages/data/generated. Run from apps/wiki (needs DATABASE_URL + the Prisma client).
// Superseded by the unified pipeline (spec #2).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OUT = resolve(__dirname, "../../../packages/data/generated");

async function main() {
  const entityRows = await prisma.entity.findMany({
    include: { itemStats: true, tramplerStats: true, techNodeStats: true },
    orderBy: { slug: "asc" },
  });

  const entities = entityRows.map((e) => ({
    id: e.id, slug: e.slug, kind: e.kind, name: e.name, description: e.description,
    category: e.category, rarity: e.rarity, icon: e.icon, imageAlt: e.imageAlt,
    derivedName: e.derivedName, sourceUrl: e.sourceUrl, disabled: e.disabled,
    itemStats: e.itemStats
      ? stripId(e.itemStats)
      : null,
    tramplerStats: e.tramplerStats ? stripId(e.tramplerStats) : null,
    techNodeStats: e.techNodeStats
      ? { faction: e.techNodeStats.faction, tier: e.techNodeStats.tier, sortOrder: e.techNodeStats.sortOrder }
      : null,
  }));

  const recipeRows = await prisma.recipe.findMany({
    include: { inputs: { include: { entity: { select: { slug: true } } } },
               outputs: { include: { entity: { select: { slug: true } } } },
               location: { select: { slug: true } } },
    orderBy: { slug: "asc" },
  });
  const recipes = recipeRows.map((r) => ({
    slug: r.slug, workbench: r.workbench, tier: r.tier, craftTimeSeconds: r.craftTimeSeconds,
    locationSlug: r.location?.slug ?? null,
    inputs: r.inputs.map((i) => ({ itemSlug: i.entity.slug, amount: i.amount })),
    outputs: r.outputs.map((o) => ({ itemSlug: o.entity.slug, amount: o.amount })),
  }));

  const linkRows = await prisma.entityLink.findMany({
    include: { source: { select: { slug: true } }, target: { select: { slug: true } } },
    orderBy: [{ sourceId: "asc" }, { role: "asc" }, { sortOrder: "asc" }],
  });
  const links = linkRows.map((l) => ({
    sourceSlug: l.source.slug, targetSlug: l.target?.slug ?? null, role: l.role,
    name: l.name, amount: l.amount, tier: l.tier, value1: l.value1, value2: l.value2,
    value3: l.value3, sortOrder: l.sortOrder, buyGroup: l.buyGroup,
  }));

  write("entities.json", entities);
  write("recipes.json", recipes);
  write("links.json", links);
  console.log(`exported ${entities.length} entities, ${recipes.length} recipes, ${links.length} links`);
}

// Drop the relational `entityId` PK from a stats row; keep all stat fields.
function stripId<T extends { entityId: string }>(row: T): Omit<T, "entityId"> {
  const { entityId: _drop, ...rest } = row;
  return rest;
}

function write(file: string, data: unknown) {
  writeFileSync(resolve(OUT, file), JSON.stringify(data, null, 2) + "\n");
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run the export against the dev DB**

Run (from repo root): `npm run data:export --workspace=apps/wiki`
Expected: prints `exported N entities, M recipes, K links` with non-zero counts; `packages/data/generated/*.json` now contain real data.

> Requires `apps/wiki/.env` with `DATABASE_URL` pointing at the **dev** Neon DB. This is read-only; it never writes to the DB.

> **Icons:** the app renders images via `ItemIcon`, which does `<img src={icon}>` using the `icon` **string** field. The Directus `iconFile` (Uuid) is only Directus Studio's own thumbnail relation and is intentionally NOT exported. As long as `icon` holds an app-resolvable path (it does today — the running site renders from it), images keep working with Directus gone. Task 14's visual check confirms icons render.

- [ ] **Step 4: Sanity-check the output is non-empty**

Run: `node -e "const e=require('./packages/data/generated/entities.json'); console.log(e.length, e[0]?.slug)"`
Expected: a count > 0 and a slug string.

- [ ] **Step 5: Commit the script and the generated data**

```bash
git add apps/wiki/scripts/export-entities.ts apps/wiki/package.json packages/data/generated
git commit -m "feat(data): one-time dev-DB export to committed JSON"
```

---

## Task 7: Round-trip test — JSON reproduces the DB entity set

**Files:**
- Create: `packages/data/src/store.roundtrip.test.ts`

Loads the real generated JSON through the store and asserts structural integrity (no dangling slugs, indexes built). This guards the export against silent shape drift.

- [ ] **Step 1: Write the test**

`packages/data/src/store.roundtrip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createStore } from "./store";
import type { DataSet } from "./types";
import entities from "../generated/entities.json";
import recipes from "../generated/recipes.json";
import links from "../generated/links.json";

const data = { entities, recipes, links } as unknown as DataSet;

describe("generated data round-trip", () => {
  const s = createStore(data);

  it("has entities and a slug index covering all of them", () => {
    expect(s.entities.length).toBeGreaterThan(0);
    expect(s.bySlug.size).toBe(s.entities.length); // slugs are unique
  });

  it("every recipe line references a known entity slug", () => {
    for (const r of s.recipes) {
      for (const line of [...r.inputs, ...r.outputs]) {
        expect(s.bySlug.has(line.itemSlug)).toBe(true);
      }
      if (r.locationSlug) expect(s.bySlug.has(r.locationSlug)).toBe(true);
    }
  });

  it("every link source resolves; targets resolve when present", () => {
    for (const l of s.links) {
      expect(s.bySlug.has(l.sourceSlug)).toBe(true);
      if (l.targetSlug) expect(s.bySlug.has(l.targetSlug)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm run test --workspace=packages/data`
Expected: PASS. If a "references a known entity slug" assertion fails, the export omitted rows or a slug differs — fix the export, re-run Task 6, before continuing.

- [ ] **Step 3: Commit**

```bash
git add packages/data/src/store.roundtrip.test.ts
git commit -m "test(data): round-trip integrity over generated JSON"
```

---

## Task 8: Public accessors + index entry

**Files:**
- Create: `packages/data/src/accessors.ts`
- Create: `packages/data/src/index.ts`
- Test: `packages/data/src/accessors.test.ts`

`index.ts` constructs the singleton store from the generated JSON (memoized at module load). `accessors.ts` holds pure functions over a `Store` (so tests inject the fixture). `index.ts` re-exports bound versions.

- [ ] **Step 1: Write the failing accessor test**

`packages/data/src/accessors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createStore } from "./store";
import { fixture } from "./fixtures";
import * as a from "./accessors";

const s = createStore(fixture);

describe("accessors", () => {
  it("getEntity / listByKind respect existence", () => {
    expect(a.getEntity(s, "rifle")?.name).toBe("Rifle");
    expect(a.getEntity(s, "missing")).toBeNull();
    expect(a.listByKind(s, "item").length).toBe(4);
  });

  it("listByCategory filters by kind+category", () => {
    expect(a.listByCategory(s, "item", "ammo").map((e) => e.slug)).toEqual(["ammo-9x42"]);
  });

  it("categoryCounts excludes disabled rows", () => {
    // 'ghost' is disabled → resources count is 1 (iron only)
    expect(a.categoryCounts(s, "item")["resources"]).toBe(1);
  });

  it("linksForRoles returns sorted matching outgoing links", () => {
    const loot = a.outgoingLinks(s, "crate", ["loot"]);
    expect(loot.map((l) => l.targetSlug)).toEqual(["iron", "ghost"]);
  });

  it("incomingLinks finds links pointing at a slug", () => {
    expect(a.incomingLinks(s, "iron", ["loot"]).map((l) => l.sourceSlug)).toEqual(["crate"]);
  });

  it("recipesProducing / recipesUsing / recipesAtLocation", () => {
    expect(a.recipesProducing(s, "rifle").map((r) => r.slug)).toEqual(["rifle-recipe"]);
    expect(a.recipesUsing(s, "iron").map((r) => r.slug)).toEqual(["rifle-recipe"]);
    expect(a.recipesAtLocation(s, "crate")).toEqual([]);
  });

  it("isEntityEnabled / targetEnabled drive visibility scrubbing", () => {
    expect(a.isEntityEnabled(s, "ghost")).toBe(false);
    expect(a.isEntityEnabled(s, "iron")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test --workspace=packages/data`
Expected: FAIL — `./accessors` has no exports yet.

- [ ] **Step 3: Implement `packages/data/src/accessors.ts`**

```ts
import type { Store } from "./store";
import type { Entity, EntityLink, Recipe } from "./types";

export function getEntity(s: Store, slug: string): Entity | null {
  return s.bySlug.get(slug) ?? null;
}

export function listByKind(s: Store, kind: string): Entity[] {
  return s.byKind.get(kind) ?? [];
}

export function listByCategory(s: Store, kind: string, category: string): Entity[] {
  return listByKind(s, kind).filter((e) => e.category === category);
}

/** Count of enabled entities per category for one kind (mirrors the old groupBy). */
export function categoryCounts(s: Store, kind: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of listByKind(s, kind)) {
    if (e.disabled) continue;
    out[e.category] = (out[e.category] ?? 0) + 1;
  }
  return out;
}

/** Outgoing links from `slug` whose role is in `roles`, sorted by sortOrder. */
export function outgoingLinks(s: Store, slug: string, roles: string[]): EntityLink[] {
  const set = new Set(roles);
  return (s.linksFrom.get(slug) ?? [])
    .filter((l) => set.has(l.role))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Incoming links pointing at `slug` whose role is in `roles`. Unsorted (callers sort). */
export function incomingLinks(s: Store, slug: string, roles: string[]): EntityLink[] {
  const set = new Set(roles);
  return (s.linksTo.get(slug) ?? []).filter((l) => set.has(l.role));
}

export function recipesProducing(s: Store, slug: string): Recipe[] {
  return s.recipesByOutput.get(slug) ?? [];
}
export function recipesUsing(s: Store, slug: string): Recipe[] {
  return s.recipesByInput.get(slug) ?? [];
}
export function recipesAtLocation(s: Store, slug: string): Recipe[] {
  return (s.recipesByLocation.get(slug) ?? []).slice().sort((a, b) => a.slug.localeCompare(b.slug));
}

/** True iff the slug exists and is not disabled. Used for cross-ref scrubbing. */
export function isEntityEnabled(s: Store, slug: string): boolean {
  const e = s.bySlug.get(slug);
  return !!e && !e.disabled;
}
```

- [ ] **Step 4: Implement `packages/data/src/index.ts`**

```ts
import { createStore, type Store } from "./store";
import type { DataSet } from "./types";
import entities from "../generated/entities.json";
import recipes from "../generated/recipes.json";
import links from "../generated/links.json";
import * as accessors from "./accessors";

// Singleton store, built once per process at module load (the Node server caches it
// across requests). The JSON is imported (build-time static), never read at runtime.
const store: Store = createStore({ entities, recipes, links } as unknown as DataSet);

export * from "./types";
export { store };

// Bound accessors — same names as accessors.ts but with the singleton store applied.
export const getEntity = (slug: string) => accessors.getEntity(store, slug);
export const listByKind = (kind: string) => accessors.listByKind(store, kind);
export const listByCategory = (kind: string, category: string) => accessors.listByCategory(store, kind, category);
export const categoryCounts = (kind: string) => accessors.categoryCounts(store, kind);
export const outgoingLinks = (slug: string, roles: string[]) => accessors.outgoingLinks(store, slug, roles);
export const incomingLinks = (slug: string, roles: string[]) => accessors.incomingLinks(store, slug, roles);
export const recipesProducing = (slug: string) => accessors.recipesProducing(store, slug);
export const recipesUsing = (slug: string) => accessors.recipesUsing(store, slug);
export const recipesAtLocation = (slug: string) => accessors.recipesAtLocation(store, slug);
export const isEntityEnabled = (slug: string) => accessors.isEntityEnabled(store, slug);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test --workspace=packages/data`
Expected: PASS (all accessor + store + round-trip tests).

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/accessors.ts packages/data/src/index.ts packages/data/src/accessors.test.ts
git commit -m "feat(data): typed accessors and singleton public surface"
```

---

## Task 9: Wire the wiki to consume `@sandlabs/data`

**Files:**
- Modify: `apps/wiki/package.json` (add dependency)
- Modify: `apps/wiki/next.config.ts` (transpilePackages)

- [ ] **Step 1: Add the workspace dependency to `apps/wiki/package.json`**

In `"dependencies"`, add:

```json
    "@sandlabs/data": "*",
```

- [ ] **Step 2: Add transpilePackages to `apps/wiki/next.config.ts`**

Read the current file first (`apps/wiki/next.config.ts`). Add `transpilePackages: ["@sandlabs/data"]` to the exported config object. For example, if the config is `const nextConfig = { ... }`, it becomes:

```ts
const nextConfig = {
  // ...existing options unchanged...
  transpilePackages: ["@sandlabs/data"],
};
```

> Next 16 needs `transpilePackages` to compile the workspace package's TS/JSON. Do not remove existing options.

- [ ] **Step 3: Install to link the dependency**

Run: `npm install`
Expected: `apps/wiki` now resolves `@sandlabs/data`.

- [ ] **Step 4: Verify the import resolves**

Run: `node -e "process.exit(0)"` then add a temporary check — instead, confirm via typecheck in the next task. Commit the wiring now.

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/package.json apps/wiki/next.config.ts package-lock.json
git commit -m "chore(wiki): depend on @sandlabs/data + transpilePackages"
```

---

## Task 10: Rewrite `queries.ts` internals — items + filters

**Files:**
- Modify: `apps/wiki/src/lib/queries.ts`

The public signatures stay identical; only internals change from Prisma to `@sandlabs/data`. This task covers the item-list functions. A helper applies the visibility rule (admins see disabled, public does not) in TS instead of `visibilityWhere`.

- [ ] **Step 1: Add imports and a visibility helper at the top of `queries.ts`**

Replace the Prisma import line `import { prisma } from "./db";` with:

```ts
import * as data from "@sandlabs/data";
import type { Entity } from "@sandlabs/data";
```

Then add this helper near the top (after the existing type/const declarations):

```ts
/** Hide disabled entities from the public; admins see everything. Mirrors the old
 *  visibilityWhere() applied in-memory. */
function visible(rows: Entity[], isAdmin: boolean): Entity[] {
  return isAdmin ? rows : rows.filter((e) => !e.disabled);
}

/** Matcher for ItemFilter's name/derivedName/category/workbenchTier/rarity, in-memory.
 *  Mirrors buildItemQuery's WHERE (case-insensitive name match). */
function matchesItemFilter(e: Entity, f: ItemFilter): boolean {
  if (f.query) {
    const q = f.query.toLowerCase();
    const inName = e.name.toLowerCase().includes(q);
    const inDerived = (e.derivedName ?? "").toLowerCase().includes(q);
    if (!inName && !inDerived) return false;
  }
  if (f.category && e.category !== f.category) return false;
  if (f.workbenchTier !== undefined && e.itemStats?.workbenchTier !== f.workbenchTier) return false;
  if (f.rarity && e.rarity !== f.rarity) return false;
  return true;
}
```

> `buildItemQuery` / `ItemQuery` in `item-filter.ts` build Prisma `where` objects that are no longer used by these functions. Leave `item-filter.ts` as-is for now except `applyItemView`, `caliberLabel`, `rarityTier`, and `ItemFilter` which are still consumed. `buildItemQuery` becomes dead after this task; it is removed in Task 14's cleanup step.

- [ ] **Step 2: Rewrite `listItems`**

```ts
export async function listItems(filter: ItemFilter, isAdmin = false) {
  const rows = visible(data.listByKind("item"), isAdmin)
    .filter((e) => matchesItemFilter(e, filter))
    .sort((a, b) => a.name.localeCompare(b.name)); // name-asc base order
  const flat = rows.map((i) => ({ ...i, ammoType: i.itemStats?.ammoType ?? null }));
  return applyItemView(flat, { sort: filter.sort, weaponClass: filter.weaponClass });
}
```

- [ ] **Step 3: Rewrite `listRarities`, `listWorkbenchTiers`, `listItemClasses`, `itemCategoryCounts`**

```ts
export async function listRarities(filter: ItemFilter): Promise<string[]> {
  const rest = { ...filter };
  delete rest.rarity;
  const rarities = new Set<string>();
  for (const e of data.listByKind("item")) {
    if (e.disabled || e.rarity == null) continue;
    if (matchesItemFilter(e, rest)) rarities.add(e.rarity);
  }
  return [...rarities];
}

export async function listWorkbenchTiers(filter: ItemFilter): Promise<number[]> {
  const rest = { ...filter };
  delete rest.workbenchTier;
  const tiers = new Set<number>();
  for (const e of data.listByKind("item")) {
    if (e.disabled) continue;
    const t = e.itemStats?.workbenchTier;
    if (t == null) continue;
    if (matchesItemFilter(e, rest)) tiers.add(t);
  }
  return [...tiers].sort((a, b) => a - b);
}

export async function listItemClasses(filter: ItemFilter): Promise<string[]> {
  const rows = data.listByKind("item")
    .filter((e) => !e.disabled && matchesItemFilter(e, filter))
    .map((e) => ({ ammoType: e.itemStats?.ammoType ?? null }));
  return itemClasses(rows);
}

export async function itemCategoryCounts(): Promise<Record<string, number>> {
  return data.categoryCounts("item");
}
```

- [ ] **Step 4: Typecheck the wiki**

Run: `npx tsc -p apps/wiki/tsconfig.json --noEmit`
Expected: errors ONLY in the not-yet-rewritten functions further down `queries.ts` (env/trampler/links/tech) and in files that import `buildItemQuery` indirectly — that's fine mid-task. The four functions above must not be among the errors.

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/lib/queries.ts
git commit -m "refactor(wiki): item-list queries read from @sandlabs/data"
```

---

## Task 11: Rewrite `queries.ts` — environment, trampler, recipe composition

**Files:**
- Modify: `apps/wiki/src/lib/queries.ts`

These functions compose recipes and links into page shapes. The existing `toRecipeWithItems`/`toRecipeCard` helpers stay; they now receive data assembled from accessors. Add a recipe-assembly helper that resolves line item slugs to `{slug,name,icon,rarity}` and scrubs disabled targets.

- [ ] **Step 1: Add recipe + link resolution helpers (after the `visible`/`matchesItemFilter` helpers)**

```ts
import type { Recipe } from "@sandlabs/data";

/** Resolve a recipe's line slugs to display rows, dropping any line whose entity is
 *  disabled (mirrors the old `enabledLine` include filter). */
function resolveRecipe(r: Recipe): LoadedRecipe {
  const line = (l: { itemSlug: string; amount: number }) => {
    const e = data.getEntity(l.itemSlug);
    return e && !e.disabled
      ? { amount: l.amount, entity: { slug: e.slug, name: e.name, icon: e.icon, rarity: e.rarity } }
      : null;
  };
  const loc = r.locationSlug ? data.getEntity(r.locationSlug) : null;
  return {
    slug: r.slug, workbench: r.workbench, tier: r.tier, craftTimeSeconds: r.craftTimeSeconds,
    location: loc ? { slug: loc.slug, name: loc.name } : null,
    inputs: r.inputs.map(line).filter((x): x is NonNullable<typeof x> => x !== null),
    outputs: r.outputs.map(line).filter((x): x is NonNullable<typeof x> => x !== null),
  };
}
```

- [ ] **Step 2: Rewrite `listEnvEntities`, `getEnvEntityBySlug`, `envCategoryCounts`**

```ts
export async function listEnvEntities(category?: string, isAdmin = false) {
  const rows = category
    ? data.listByCategory("environment", category)
    : data.listByKind("environment");
  return visible(rows, isAdmin).slice().sort((a, b) => a.name.localeCompare(b.name));
}

export const getEnvEntityBySlug = cache(async (slug: string) => {
  const entity = data.getEntity(slug);
  if (entity === null || entity.kind !== "environment") return null;

  const linkRoles = ["loot", "requires-key", "rewards-key"];
  const allLinks = data.outgoingLinks(slug, linkRoles)
    .filter((l) => l.targetSlug === null || data.isEntityEnabled(l.targetSlug));

  const resolveTarget = (l: (typeof allLinks)[number]) => {
    const t = l.targetSlug ? data.getEntity(l.targetSlug) : null;
    return {
      ...l,
      target: t ? { slug: t.slug, kind: t.kind, name: t.name, icon: t.icon, rarity: t.rarity, category: t.category } : null,
    };
  };
  const linksResolved = allLinks.map(resolveTarget);
  const lootLinks = linksResolved.filter((l) => l.role === "loot");
  const keyLinks = linksResolved.filter((l) => l.role === "requires-key" || l.role === "rewards-key");

  const craftedBy = data.recipesAtLocation(slug).map((r) =>
    toRecipeCard(toRecipeWithItems({ ...resolveRecipe(r), location: null })),
  );

  return { ...entity, outgoingLinks: lootLinks, keyLinks, craftedBy };
});

export async function envCategoryCounts(): Promise<Record<string, number>> {
  return data.categoryCounts("environment");
}
```

> The page reads `entity.outgoingLinks[].target.{…}` and `entity.keyLinks`/`craftedBy`. The resolved shape above provides exactly those. The spread `...l` preserves `name`, `amount`, `tier`, `value1..3`, `sortOrder`, `buyGroup` that loot/key renderers read.

- [ ] **Step 3: Rewrite `listTramplerParts`, `getTramplerPartBySlug`, `tramplerCategoryCounts`**

```ts
export async function listTramplerParts(category?: string, isAdmin = false) {
  const rows = category
    ? data.listByCategory("trampler-part", category)
    : data.listByKind("trampler-part");
  return visible(rows, isAdmin).slice().sort((a, b) => {
    const ta = a.tramplerStats?.researchTier ?? Number.MAX_SAFE_INTEGER;
    const tb = b.tramplerStats?.researchTier ?? Number.MAX_SAFE_INTEGER;
    return ta - tb || a.name.localeCompare(b.name);
  });
}

export const getTramplerPartBySlug = cache(async (slug: string) => {
  const part = data.getEntity(slug);
  if (!part || part.kind !== "trampler-part") return null;
  const costLinks = data.outgoingLinks(slug, ["cost"])
    .filter((l) => l.targetSlug === null || data.isEntityEnabled(l.targetSlug))
    .map((l) => {
      const t = l.targetSlug ? data.getEntity(l.targetSlug) : null;
      return { ...l, target: t ? { slug: t.slug, kind: t.kind, icon: t.icon, rarity: t.rarity } : null };
    });
  return { ...part, outgoingLinks: costLinks };
});

export async function tramplerCategoryCounts(): Promise<Record<string, number>> {
  return data.categoryCounts("trampler-part");
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p apps/wiki/tsconfig.json --noEmit`
Expected: remaining errors only in the still-unconverted lower functions (loot/buy/tech/getItemBySlug/etc.). The env/trampler functions above must be clean.

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/lib/queries.ts
git commit -m "refactor(wiki): env + trampler queries read from @sandlabs/data"
```

---

## Task 12: Rewrite `queries.ts` — items detail, loot/key cross-refs, ammo

**Files:**
- Modify: `apps/wiki/src/lib/queries.ts`

- [ ] **Step 1: Rewrite `getItemBySlug`**

```ts
export const getItemBySlug = cache(async (slug: string) => {
  const item = data.getEntity(slug);
  if (!item || item.kind !== "item") return null;
  const craftedBy = data.recipesProducing(slug).map((r) => toRecipeCard(toRecipeWithItems(resolveRecipe(r))));
  const usedIn = data.recipesUsing(slug).map((r) => toRecipeCard(toRecipeWithItems(resolveRecipe(r))));
  return { ...item, craftedBy, usedIn };
});
```

- [ ] **Step 2: Rewrite `getIncomingLootLinks`, `listLootSources`, `listEntityPaths`**

```ts
export async function getIncomingLootLinks(itemSlug: string) {
  const item = data.getEntity(itemSlug);
  if (!item || item.kind !== "item") return null;
  return data.incomingLinks(itemSlug, ["loot"])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => {
      const src = data.getEntity(l.sourceSlug)!;
      return { tier: l.tier, value1: l.value1, sortOrder: l.sortOrder, source: { slug: src.slug, name: src.name } };
    });
}

export async function listLootSources(): Promise<LinkOption[]> {
  return data.listByKind("environment")
    .filter((e) => e.category === "loot-containers" || e.category === "landmarks")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ slug: e.slug, name: e.name, rarity: e.rarity, icon: e.icon, category: e.category }));
}

export async function listEntityPaths(): Promise<{ slug: string; kind: string }[]> {
  return data.entityPaths();
}
```

> Add a small accessor for the sitemap. In `packages/data/src/accessors.ts` add:
> ```ts
> export function entityPaths(s: Store): { slug: string; kind: string }[] {
>   const kinds = new Set(["item", "environment", "trampler-part"]);
>   return s.entities
>     .filter((e) => kinds.has(e.kind) && !e.disabled)
>     .map((e) => ({ slug: e.slug, kind: e.kind }))
>     .sort((a, b) => a.slug.localeCompare(b.slug));
> }
> ```
> and in `packages/data/src/index.ts`:
> ```ts
> export const entityPaths = () => accessors.entityPaths(store);
> ```
> Add a test for it in `accessors.test.ts`:
> ```ts
> it("entityPaths excludes tech-nodes and disabled rows", () => {
>   const paths = a.entityPaths(s).map((p) => p.slug);
>   expect(paths).not.toContain("tech-kaiser-t1a-hull"); // tech-node excluded
>   expect(paths).not.toContain("ghost");                // disabled excluded
>   expect(paths).toContain("rifle");
> });
> ```

- [ ] **Step 3: Rewrite `getCratesContaining`, `getKeyUsage`**

```ts
export async function getCratesContaining(itemSlug: string): Promise<CrateDrop[]> {
  return data.incomingLinks(itemSlug, ["loot"])
    .map((l) => ({ l, src: data.getEntity(l.sourceSlug)! }))
    .filter(({ src }) => src.kind === "environment"
      && (src.category === "loot-containers" || src.category === "landmarks")
      && !src.disabled)
    .sort((x, y) => x.src.name.localeCompare(y.src.name) || x.l.sortOrder - y.l.sortOrder)
    .map(({ l, src }) => ({
      crateSlug: src.slug, crateName: src.name, tier: l.tier ?? "",
      chance: l.value1 == null ? null : `${l.value1}%`,
    }));
}

export async function getKeyUsage(itemSlug: string): Promise<KeyUsage> {
  const rows = data.incomingLinks(itemSlug, ["requires-key", "rewards-key"])
    .map((l) => ({ l, src: data.getEntity(l.sourceSlug)! }))
    .filter(({ src }) => src.kind === "environment" && !src.disabled)
    .sort((x, y) => x.src.name.localeCompare(y.src.name) || x.l.sortOrder - y.l.sortOrder);
  const toLoc = ({ src }: (typeof rows)[number]): KeyUsageLocation => ({
    slug: src.slug, name: src.name, icon: src.icon, rarity: src.rarity, category: src.category,
  });
  return {
    opens: rows.filter(({ l }) => l.role === "requires-key").map(toLoc),
    rewardedBy: rows.filter(({ l }) => l.role === "rewards-key").map(toLoc),
  };
}
```

- [ ] **Step 4: Rewrite `getAmmoByCaliber`, `getWeaponsByCaliber`, `getLinkTargetsBySlugs`**

```ts
export async function getAmmoByCaliber(caliber: string): Promise<LinkItem[]> {
  return data.listByKind("item")
    .filter((e) => e.category === "ammo" && !e.disabled && e.itemStats?.ammoType === caliber)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ slug: e.slug, name: e.name, icon: e.icon, rarity: e.rarity }));
}

export async function getWeaponsByCaliber(caliber: string): Promise<LinkItem[]> {
  return data.listByKind("item")
    .filter((e) => (e.category === "weapons" || e.category === "artillery") && !e.disabled && e.itemStats?.ammoType === caliber)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ slug: e.slug, name: e.name, icon: e.icon, rarity: e.rarity }));
}

export async function getLinkTargetsBySlugs(
  slugs: string[],
): Promise<Map<string, { name: string; href: string; rarity: string | null }>> {
  const result = new Map<string, { name: string; href: string; rarity: string | null }>();
  for (const slug of slugs) {
    const e = data.getEntity(slug);
    if (!e || e.disabled) continue;
    const href = entityHref(e.kind, e.slug);
    if (href) result.set(e.slug, { name: e.name, href, rarity: e.rarity });
  }
  return result;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p apps/wiki/tsconfig.json --noEmit`
Expected: remaining errors only in `getOutgoingLinks`, `getBuyOptions`, `getBuyOptionsForEdit`, `getTechTree`, `getUnlockingNode`, `getLastEditor`, `getBuyUnlockedItems` (Task 13). Add the new `entityPaths` accessor test passes: `npm run test --workspace=packages/data` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/wiki/src/lib/queries.ts packages/data/src/accessors.ts packages/data/src/index.ts packages/data/src/accessors.test.ts
git commit -m "refactor(wiki): item-detail, loot/key, ammo queries on @sandlabs/data"
```

---

## Task 13: Rewrite `queries.ts` — links editor, buy options, tech tree

**Files:**
- Modify: `apps/wiki/src/lib/queries.ts`

`getLastEditor` reads the `Proposal` table, which is removed in Plan 2. For this plan it must still compile and behave; since the proposal-correction feature is being dropped, **stub it to return null** (last-editor credit goes away with corrections). This is the one intentional behavior change in Plan 1.

- [ ] **Step 1: Rewrite `getOutgoingLinks`**

```ts
export async function getOutgoingLinks(slug: string, role: string) {
  const entity = data.getEntity(slug);
  if (!entity) return null;
  const outgoingLinks = data.outgoingLinks(slug, [role]).map((l) => ({
    name: l.name, amount: l.amount, tier: l.tier, value1: l.value1, sortOrder: l.sortOrder,
    target: l.targetSlug ? { slug: l.targetSlug } : null,
  }));
  return { id: entity.id, name: entity.name, kind: entity.kind, outgoingLinks };
}
```

- [ ] **Step 2: Rewrite `getBuyOptions`, `getBuyOptionsForEdit`**

```ts
export async function getBuyOptions(itemSlug: string): Promise<BuyOptionView[]> {
  const entity = data.getEntity(itemSlug);
  if (!entity) return [];
  const rows = data.outgoingLinks(itemSlug, ["buy-cost", "buy-yield", "buy-unlock"])
    .filter((l) => l.targetSlug === null || data.isEntityEnabled(l.targetSlug))
    .sort((a, b) => (a.buyGroup ?? 0) - (b.buyGroup ?? 0) || a.sortOrder - b.sortOrder)
    .map((l) => {
      const t = l.targetSlug ? data.getEntity(l.targetSlug) : null;
      return {
        role: l.role, buyGroup: l.buyGroup, amount: l.amount, name: l.name,
        target: t ? { slug: t.slug, kind: t.kind, icon: t.icon, rarity: t.rarity } : null,
      };
    });
  return groupBuyOptions(rows as BuyLinkRow[]);
}

export async function getBuyOptionsForEdit(itemSlug: string) {
  const item = data.getEntity(itemSlug);
  if (!item || item.kind !== "item") return null;
  const options = await getBuyOptions(itemSlug);
  return { item: { id: item.id, name: item.name, kind: item.kind }, options };
}
```

- [ ] **Step 3: Rewrite `getTechTree`, `getUnlockingNode`, `getBuyUnlockedItems`**

```ts
export async function getTechTree(): Promise<TechTree> {
  const rows = data.listByKind("tech-node")
    .filter((e) => !e.disabled)
    .map((e) => ({
      slug: e.slug,
      name: e.name,
      techNodeStats: e.techNodeStats,
      outgoingLinks: data.outgoingLinks(e.slug, ["tech-prereq", "tech-unlock-cost", "tech-unlocks"])
        .filter((l) => l.targetSlug === null || data.isEntityEnabled(l.targetSlug))
        .map((l) => {
          const t = l.targetSlug ? data.getEntity(l.targetSlug) : null;
          return {
            role: l.role, name: l.name, amount: l.amount, sortOrder: l.sortOrder,
            target: t ? { slug: t.slug, name: t.name, icon: t.icon, kind: t.kind, techNodeStats: t.techNodeStats } : null,
          };
        }),
    }));

  const rootSlugs = Object.values(FACTION_ROOT_PART);
  const rootParts = Object.fromEntries(
    rootSlugs
      .map((slug) => data.getEntity(slug))
      .filter((e): e is NonNullable<typeof e> => !!e && !e.disabled)
      .map((e) => [e.slug, { name: e.name, icon: e.icon, kind: e.kind }]),
  );

  return toTechTree(rows, rootParts);
}

export async function getUnlockingNode(entitySlug: string): Promise<{ slug: string } | null> {
  const link = data.incomingLinks(entitySlug, ["tech-unlocks"])
    .filter((l) => data.isEntityEnabled(l.sourceSlug))
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return link ? { slug: link.sourceSlug } : null;
}

export async function getBuyUnlockedItems(techSlug: string) {
  const node = data.getEntity(techSlug);
  if (!node) return [];
  const seen = new Set<string>();
  return data.incomingLinks(techSlug, ["buy-unlock"])
    .map((l) => data.getEntity(l.sourceSlug))
    .filter((s): s is NonNullable<typeof s> => !!s && s.kind === "item" && !seen.has(s.slug) && seen.add(s.slug))
    .map((s) => ({ slug: s.slug, name: s.name, icon: s.icon, kind: s.kind }));
}
```

> `toTechTree` expects `techNodeStats.sortOrder` to be `number | null`; our `TechNodeStats` type matches. The mapped `rows` satisfy `RawTechRow[]` (slug, name, techNodeStats, outgoingLinks with target carrying `techNodeStats: {faction}`).

- [ ] **Step 4: Stub `getLastEditor` (corrections feature removed)**

```ts
/** Last-editor credit was sourced from applied Proposals; the proposal-correction
 *  feature is removed in this restructure, so there is no edit history. Always null.
 *  (Kept for call-site compatibility; callers render nothing when null.) */
export async function getLastEditor(
  _targetType: "item" | "envEntity" | "tramplerPart",
  _slug: string,
): Promise<{ steamId: string; personaName: string | null } | null> {
  return null;
}
```

- [ ] **Step 5: Typecheck the whole wiki**

Run: `npx tsc -p apps/wiki/tsconfig.json --noEmit`
Expected: `queries.ts` is now Prisma-free and type-clean. Any remaining errors will be in OTHER files that still import `prisma` for entity reads (admin/contribute) — those are removed in Plan 2 and may still error here. **Record the list of remaining errors**; if any are in *page* files that render public routes (not admin/contribute), fix them by pointing at the new query functions. Admin/contribute errors are expected and deferred.

- [ ] **Step 6: Commit**

```bash
git add apps/wiki/src/lib/queries.ts
git commit -m "refactor(wiki): buy options + tech tree on @sandlabs/data; stub getLastEditor"
```

---

## Task 14: Remove dead query plumbing + verify the public site renders from JSON

**Files:**
- Modify: `apps/wiki/src/lib/item-filter.ts` (drop now-dead `buildItemQuery`/`ItemQuery`)
- Modify: `apps/wiki/src/lib/visibility.ts` (no longer used by queries — verify no other importers)

- [ ] **Step 1: Find remaining importers of the dead helpers**

Run: `grep -rn "buildItemQuery\|visibilityWhere\|linkTargetEnabled" apps/wiki/src`
Expected: identify every importer. `buildItemQuery` should now only be referenced (if at all) by admin/contribute code slated for Plan 2 removal.

- [ ] **Step 2: Decide per helper**

- If `buildItemQuery`/`ItemQuery` have no importers outside Plan-2-doomed files, delete them from `item-filter.ts` (keep `ItemFilter`, `applyItemView`, `ViewItem`). If admin/contribute still import them, leave them until Plan 2 and note it.
- `visibilityWhere`/`linkTargetEnabled` return Prisma `where` fragments; if only Plan-2-doomed files import them, leave the file untouched (it'll be deleted/trimmed in Plan 2). Do not break compilation.

> Rule: this task must not introduce new type errors. Only delete a helper when grep shows it has zero live importers.

- [ ] **Step 3: Build the wiki**

Run: `npm run build --workspace=apps/wiki`
Expected: If admin/contribute pages still import `prisma` for entity tables, the build may fail compiling those routes. If so, this confirms they must be handled now or temporarily neutralized. **Preferred:** proceed to Plan 2 to remove them. **If a green build is required to validate Plan 1 in isolation:** temporarily comment the admin/contribute route bodies to `return null`/`notFound()` and note it — Plan 2 deletes them outright. Capture which routes needed neutralizing.

- [ ] **Step 4: Run the public site and spot-check against the DB-backed version**

Run: `npm run dev --workspace=apps/wiki`
Then verify these routes render with real data (entities now come from JSON):
- `/items` — list, rarity/tier/class filters, sorting
- `/items/<a-known-weapon-slug>` — stats, crafted-by, used-in, loot "found in", ammo tabs, buy options
- `/environment/<a-known-crate-slug>` — loot table, key tabs, crafted-here
- `/tramplers/<a-known-part-slug>` — stats, build cost
- `/tech` — the interactive tree renders nodes/costs/unlocks
- the sitemap / any `[[slug]]` description links resolve

Expected: visually identical to the DB-backed site. The DB tables still exist, so if anything differs, you can diff directly.

- [ ] **Step 5: Run the full wiki test suite**

Run: `npm run test --workspace=apps/wiki`
Expected: PASS (or only failures in admin/contribute tests doomed for Plan 2 — record them).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(wiki): remove dead query plumbing; site renders from static JSON"
```

---

## Self-Review Notes (for the executor)

- **Behavior parity is the bar.** The DB tables remain in Plan 1 specifically so every page can be diffed against the previous behavior. Treat any visual/logic difference as a bug in the rewrite, not an acceptable change — except `getLastEditor` (intentionally → null) which is part of dropping corrections.
- **Sort-order fidelity:** the old Prisma queries ordered by `name asc` (and trampler by `researchTier asc, name asc`; recipes-at-location by `slug asc`). The in-memory rewrites replicate these — keep them.
- **Disabled scrubbing:** public callers must never see `disabled` entities, and disabled link *targets* are scrubbed universally (admins too). The `visible()` helper handles list-level; per-link scrubbing uses `isEntityEnabled`. Preserve both.
- **Admin/contribute fallout is expected.** Those routes read/write entity tables and are removed in Plan 2. Do not invent new entity-write paths to keep them alive.

## Outcome

At the end of Plan 1: a monorepo with `apps/wiki` + `packages/data`; the public wiki renders entirely from committed JSON; the Postgres entity tables and Directus still exist (untouched) for safe comparison. Plan 2 removes them.
