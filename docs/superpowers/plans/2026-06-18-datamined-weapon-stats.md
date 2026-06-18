# Datamined Weapon/Ammo/Armor Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import authoritative datamined combat stats (reload, range/falloff, ammo damage, penetration, armor) from SEK `weapon_stats.json` into the wiki's `ItemStats`, via a seed-safe loader that works on the live DB without a reseed.

**Architecture:** Four-stage pipeline mirroring loot containers — committed datamine snapshot → `tsx` build script → committed slug-keyed artifact → seed-safe loader. Stats land on new nullable `ItemStats` columns. Datamine is authoritative over the wiki scrape, but the loader respects contributor edits via the existing applied-edit lock-map (`src/lib/seed-curation.ts`). Turrets and UI are out of scope (separate follow-ups).

**Tech Stack:** Next.js 16 / Prisma 6 (pinned) / Neon Postgres / TypeScript / `tsx` / Vitest 4.

**Spec:** `docs/superpowers/specs/2026-06-18-datamined-weapon-stats-design.md`

**Working directory:** All paths below are relative to `sand-wiki/` unless noted. The repo root is `D:/Documents/SandLabs`; the app is the `sand-wiki/` subfolder. Run all `npm`/`npx`/`tsx` commands from inside `sand-wiki/`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `prisma/schema.prisma` | Add 10 nullable combat columns to `model ItemStats` | Modify |
| `prisma/weapon-stats.ts` | Shared types + pure transform functions (raw datamine → `StatPatch`) | Create |
| `prisma/weapon-stats.test.ts` | Vitest unit tests for the pure transforms | Create |
| `datamine/data/weapon_stats.json` | Committed provenance snapshot copied from SEK | Create |
| `prisma/build-weapon-stats.ts` | Reshape snapshot + `id→slug` join → `prisma/weapon-stats.json` | Create |
| `prisma/weapon-stats.json` | Committed slug-keyed artifact (build output) | Create (generated) |
| `prisma/load-weapon-stats.ts` | Seed-safe loader: update `ItemStats`, respect locks | Create |
| `package.json` | Add `weapons:build` + `db:load-weapon-stats` scripts | Modify |
| `datamine/README.md` | Document provenance + run order | Modify |

---

## Task 1: Add combat columns to ItemStats

**Files:**
- Modify: `prisma/schema.prisma` (the `model ItemStats` block, currently lines ~45-61)

- [ ] **Step 1: Add the new columns**

In `prisma/schema.prisma`, inside `model ItemStats`, after the existing `ammoType String?` line and before the closing `@@index`, add:

```prisma
  reloadSeconds   Float?
  rangeFull       Float?
  rangeMax        Float?
  rangeMinMult    Float?
  rangeFalloff    Boolean?
  penetrates      Boolean?
  armorRating     Int?
  armorRegenDelay Float?
  armorRegenSpeed Float?
  armorDurability Int?
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name item_combat_stats`
Expected: a new folder under `prisma/migrations/` is created, the migration applies to the Neon dev branch, and `Generated Prisma Client` prints. Existing `ItemStats` rows get NULLs in the new columns.

- [ ] **Step 3: Verify the client picked up the fields**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (the new optional fields compile; nothing references them yet).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(stats): add combat columns to ItemStats (reload/range/armor/penetrates)"
```

---

## Task 2: Shared transform module + tests (TDD)

**Files:**
- Create: `prisma/weapon-stats.ts`
- Test: `prisma/weapon-stats.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `prisma/weapon-stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ammoPatch, armorPatch, rangePatch, weaponPatch } from "./weapon-stats";

describe("rangePatch", () => {
  it("maps the four range fields", () => {
    expect(rangePatch({ full: 35, max: 150, minMult: 0.3, falloff: true })).toEqual({
      rangeFull: 35, rangeMax: 150, rangeMinMult: 0.3, rangeFalloff: true,
    });
  });
  it("is empty when range is null", () => {
    expect(rangePatch(null)).toEqual({});
  });
});

describe("weaponPatch", () => {
  it("maps reload + range, never damage", () => {
    expect(weaponPatch({
      reloadSeconds: 3.05,
      range: { full: 15, max: 150, minMult: 0.5, falloff: true },
      recoil: null, spread: null,
    })).toEqual({
      reloadSeconds: 3.05, rangeFull: 15, rangeMax: 150, rangeMinMult: 0.5, rangeFalloff: true,
    });
  });
  it("drops a null reload and null range entirely", () => {
    expect(weaponPatch({ reloadSeconds: null, range: null, recoil: null, spread: null })).toEqual({});
  });
});

describe("ammoPatch", () => {
  it("maps damage (rounded), penetrates and range; ignores stack/turret", () => {
    expect(ammoPatch({
      turret: false, damagePhysical: 50,
      range: { full: 35, max: 150, minMult: 0.3, falloff: true },
      penetrates: false, stack: [50, 250, 1000],
    })).toEqual({
      damage: 50, penetrates: false,
      rangeFull: 35, rangeMax: 150, rangeMinMult: 0.3, rangeFalloff: true,
    });
  });
  it("rounds fractional damage and drops null damage", () => {
    expect(ammoPatch({ turret: false, damagePhysical: 12.6, range: null, penetrates: null, stack: [] }))
      .toEqual({ damage: 13 });
  });
});

describe("armorPatch", () => {
  it("maps rating, regen delay/speed, durability", () => {
    expect(armorPatch({ armorRating: 50, regen: { delay: 6, speed: 7 }, durability: 1400 })).toEqual({
      armorRating: 50, armorRegenDelay: 6, armorRegenSpeed: 7, armorDurability: 1400,
    });
  });
  it("drops a null regen block", () => {
    expect(armorPatch({ armorRating: 100, regen: null, durability: 1400 }))
      .toEqual({ armorRating: 100, armorDurability: 1400 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run prisma/weapon-stats.test.ts`
Expected: FAIL — cannot resolve `./weapon-stats` (module not created yet).

- [ ] **Step 3: Implement the module**

Create `prisma/weapon-stats.ts`:

```ts
/** Shared types + pure transforms for the datamined weapon/ammo/armor stats import.
 *  Source: SEK site/src/data/weapon_stats.json (copied to datamine/data/weapon_stats.json).
 *  Imported by build-weapon-stats.ts (reshape → prisma/weapon-stats.json) and
 *  load-weapon-stats.ts (writes ItemStats). Mirrors the prisma/loot-containers.ts pattern. */

export interface RangeRaw { full: number; max: number; minMult: number; falloff: boolean }
export interface WeaponRaw { reloadSeconds: number | null; range: RangeRaw | null; recoil: unknown; spread: unknown }
export interface AmmoRaw {
  turret: boolean;
  damagePhysical: number | null;
  range: RangeRaw | null;
  penetrates: boolean | null;
  stack: number[];
}
export interface ArmorRaw {
  armorRating: number | null;
  regen: { delay: number; speed: number } | null;
  durability: number | null;
}
export interface WeaponStatsFile {
  weapons: Record<string, WeaponRaw>;
  ammo: Record<string, AmmoRaw>;
  armor: Record<string, ArmorRaw>;
}

/** The subset of ItemStats columns this import manages. All optional; only present keys
 *  are written, so a partial patch never clobbers an unrelated column with null. */
export interface StatPatch {
  damage?: number;
  reloadSeconds?: number;
  rangeFull?: number;
  rangeMax?: number;
  rangeMinMult?: number;
  rangeFalloff?: boolean;
  penetrates?: boolean;
  armorRating?: number;
  armorRegenDelay?: number;
  armorRegenSpeed?: number;
  armorDurability?: number;
}

export interface WeaponStatsArtifact {
  meta: { source: string; items: number };
  items: Record<string, StatPatch>; // keyed by wiki slug
}

/** Drop undefined-valued keys so the artifact and the Prisma update carry only real values. */
function prune(p: StatPatch): StatPatch {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as StatPatch;
}

/** Range → the four range columns. Empty patch when range is null/absent. */
export function rangePatch(range: RangeRaw | null | undefined): StatPatch {
  if (!range) return {};
  return { rangeFull: range.full, rangeMax: range.max, rangeMinMult: range.minMult, rangeFalloff: range.falloff };
}

export function weaponPatch(w: WeaponRaw): StatPatch {
  return prune({
    reloadSeconds: w.reloadSeconds ?? undefined,
    ...rangePatch(w.range),
  });
}

export function ammoPatch(a: AmmoRaw): StatPatch {
  return prune({
    damage: a.damagePhysical == null ? undefined : Math.round(a.damagePhysical),
    penetrates: a.penetrates ?? undefined,
    ...rangePatch(a.range),
  });
}

export function armorPatch(a: ArmorRaw): StatPatch {
  return prune({
    armorRating: a.armorRating ?? undefined,
    armorRegenDelay: a.regen?.delay ?? undefined,
    armorRegenSpeed: a.regen?.speed ?? undefined,
    armorDurability: a.durability ?? undefined,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run prisma/weapon-stats.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add prisma/weapon-stats.ts prisma/weapon-stats.test.ts
git commit -m "feat(stats): shared weapon-stats transform module + tests"
```

---

## Task 3: Snapshot + build script → committed artifact

**Files:**
- Create: `datamine/data/weapon_stats.json` (copied snapshot)
- Create: `prisma/build-weapon-stats.ts`
- Create: `prisma/weapon-stats.json` (generated)
- Modify: `package.json` (add `weapons:build`)

- [ ] **Step 1: Copy the datamine snapshot into the wiki**

Run (from repo root `D:/Documents/SandLabs`):
```bash
cp sek/sand-expedition-kit/site/src/data/weapon_stats.json sand-wiki/datamine/data/weapon_stats.json
```
Expected: file exists. Verify shape:
```bash
node -e "const d=require('./sand-wiki/datamine/data/weapon_stats.json'); console.log(Object.keys(d), 'weapons', Object.keys(d.weapons).length, 'ammo', Object.keys(d.ammo).length, 'armor', Object.keys(d.armor).length)"
```
Expected: `[ 'weapons', 'ammo', 'armor' ] weapons 72 ammo 37 armor 3`

- [ ] **Step 2: Write the build script**

Create `prisma/build-weapon-stats.ts`:

```ts
/** Reshape the datamine snapshot into prisma/weapon-stats.json (slug-keyed).
 *  Joins datamine item ids → wiki slugs via prisma/data.json, drops unmatched ids
 *  (e.g. dev/test items). Run: npm run weapons:build. Commit the output. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ammoPatch, armorPatch, weaponPatch,
  type StatPatch, type WeaponStatsArtifact, type WeaponStatsFile,
} from "./weapon-stats";

const SOURCE = "datamine/data/weapon_stats.json";

const raw = JSON.parse(
  readFileSync(join(__dirname, "..", "datamine/data/weapon_stats.json"), "utf-8"),
) as WeaponStatsFile;
const data = JSON.parse(readFileSync(join(__dirname, "data.json"), "utf-8")) as {
  items: { id: string; slug: string }[];
};
const slugById = new Map(data.items.map((i) => [i.id, i.slug]));

const items: Record<string, StatPatch> = {};
const dropped: string[] = [];

function add(id: string, patch: StatPatch) {
  if (Object.keys(patch).length === 0) return;
  const slug = slugById.get(id);
  if (!slug) { dropped.push(id); return; }
  items[slug] = { ...items[slug], ...patch };
}

for (const [id, w] of Object.entries(raw.weapons)) add(id, weaponPatch(w));
for (const [id, a] of Object.entries(raw.ammo)) add(id, ammoPatch(a));
for (const [id, a] of Object.entries(raw.armor)) add(id, armorPatch(a));

const sorted = Object.fromEntries(Object.keys(items).sort().map((k) => [k, items[k]]));
const artifact: WeaponStatsArtifact = {
  meta: { source: SOURCE, items: Object.keys(sorted).length },
  items: sorted,
};
writeFileSync(join(__dirname, "weapon-stats.json"), JSON.stringify(artifact, null, 2) + "\n");

console.log(`Wrote prisma/weapon-stats.json: ${artifact.meta.items} items.`);
if (dropped.length) console.log(`Dropped ${dropped.length} unmatched datamine id(s): ${dropped.join(", ")}`);
```

- [ ] **Step 3: Add the build npm script**

In `package.json` `"scripts"`, add (next to `"loot:build"`):
```json
    "weapons:build": "tsx prisma/build-weapon-stats.ts",
```

- [ ] **Step 4: Run the build and inspect the artifact**

Run: `npm run weapons:build`
Expected: `Wrote prisma/weapon-stats.json: <N> items.` plus a `Dropped ... unmatched` line listing dev ids (e.g. `DevSiegeRevolver`, `DevSiegeRevolverAmmo`).
Then spot-check a known item:
```bash
node -e "const a=require('./prisma/weapon-stats.json'); console.log('old-jacket:', JSON.stringify(a.items['old-jacket'])); console.log('anti-reactor-gun:', JSON.stringify(a.items['anti-reactor-gun']));"
```
Expected: `old-jacket` shows `armorRating/armorRegenDelay/armorRegenSpeed/armorDurability`; `anti-reactor-gun` shows `reloadSeconds` (3.05) and no `damage`.

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/datamine/data/weapon_stats.json sand-wiki/prisma/build-weapon-stats.ts sand-wiki/prisma/weapon-stats.json sand-wiki/package.json
git commit -m "feat(stats): commit weapon_stats snapshot + build script + artifact"
```
(Note: run `git add` from repo root with `sand-wiki/`-prefixed paths, or drop the prefix if running from inside `sand-wiki/`.)

---

## Task 4: Seed-safe loader

**Files:**
- Create: `prisma/load-weapon-stats.ts`
- Modify: `package.json` (add `db:load-weapon-stats`)

- [ ] **Step 1: Write the loader**

Create `prisma/load-weapon-stats.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLockMap, lockedHits, omitLocked } from "../src/lib/seed-curation";
import type { StatPatch, WeaponStatsArtifact } from "./weapon-stats";

const prisma = new PrismaClient();

/**
 * Seed-safe loader for datamined combat stats (prisma/weapon-stats.json).
 * Datamine-authoritative over the wiki scrape, BUT respects contributor edits via the
 * same applied-edit lock map as seed.ts (src/lib/seed-curation.ts). Updates ONLY the
 * ItemStats of matched items — no entity creation, no pruning, no reseed. Idempotent.
 * Targets whatever DATABASE_URL points at — run against the dev branch first.
 */
async function main() {
  const file: WeaponStatsArtifact = JSON.parse(
    readFileSync(join(__dirname, "weapon-stats.json"), "utf-8"),
  );
  const lockMap = buildLockMap(
    await prisma.proposal.findMany({
      where: { status: "applied", kind: "edit" },
      select: { targetSlug: true, changes: true },
    }),
  );
  const entries = Object.entries(file.items);
  const idBySlug = new Map(
    (await prisma.entity.findMany({
      where: { kind: "item", slug: { in: entries.map(([s]) => s) } },
      select: { slug: true, id: true },
    })).map((e) => [e.slug, e.id]),
  );

  let updated = 0, fields = 0, preserved = 0;
  const missing: string[] = [];
  for (const [slug, patch] of entries) {
    const entityId = idBySlug.get(slug);
    if (!entityId) { missing.push(slug); continue; }
    const locked = lockMap.get(slug);
    const update = omitLocked(patch as Record<string, unknown>, locked) as StatPatch;
    preserved += lockedHits(patch as Record<string, unknown>, locked);
    if (Object.keys(update).length === 0) continue;
    await prisma.itemStats.upsert({
      where: { entityId },
      create: { entityId, ...update },
      update,
    });
    updated++; fields += Object.keys(update).length;
  }

  console.log(`Updated ItemStats for ${updated} item(s); ${fields} field(s) written, ${preserved} preserved (locked).`);
  if (missing.length) console.log(`Skipped ${missing.length} slug(s) not in DB: ${missing.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the loader npm script**

In `package.json` `"scripts"`, add (next to `"db:load-loot-containers"`):
```json
    "db:load-weapon-stats": "tsx prisma/load-weapon-stats.ts",
```

- [ ] **Step 3: Typecheck the loader**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/load-weapon-stats.ts package.json
git commit -m "feat(stats): seed-safe loader for datamined combat stats"
```

---

## Task 5: Run on dev DB, verify, document

**Files:**
- Modify: `datamine/README.md`

- [ ] **Step 1: Load into the dev DB**

Run: `npm run db:load-weapon-stats`
Expected: `Updated ItemStats for <N> item(s); <M> field(s) written, 0 preserved (locked).` and (possibly) a small `Skipped ... not in DB` line.

- [ ] **Step 2: Verify idempotency**

Run: `npm run db:load-weapon-stats` again.
Expected: same `Updated ...` counts (upsert is idempotent — no errors, identical numbers).

- [ ] **Step 3: Spot-check the data landed**

Run:
```bash
npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); const j=await p.entity.findUnique({where:{slug:'old-jacket'},select:{name:true,itemStats:true}}); console.log(JSON.stringify(j,null,2)); await p.\$disconnect();"
```
Expected: `itemStats` shows `armorRating`, `armorRegenDelay`, `armorRegenSpeed`, `armorDurability` populated. Repeat for an ammo slug to confirm `damage` + range fields.

- [ ] **Step 4: Document the pipeline + run order**

In `datamine/README.md`, add a section:

```markdown
## Weapon / ammo / armor stats

Source: SEK `site/src/data/weapon_stats.json` (built datamine output) → copied to
`datamine/data/weapon_stats.json` (committed snapshot).

Pipeline (mirrors loot containers):
1. `npm run weapons:build` — reshape snapshot → `prisma/weapon-stats.json` (slug-keyed; commit it).
2. `npm run db:load-weapon-stats` — update `ItemStats` for matched items. Seed-safe,
   prod-safe, idempotent; respects contributor edits. Run the dev branch first.

Run order: because `seed.ts` also writes these `ItemStats` columns, run
`db:load-weapon-stats` AFTER any `db:seed`. Datamine is authoritative over the wiki
scrape; contributor edits still win.

Not imported here: magazine and ammoType (absent from weapon_stats.json — only turrets
carry clip size), recoil/spread (intentionally skipped), and turrets (separate follow-up).
```

- [ ] **Step 5: Commit**

```bash
git add datamine/README.md
git commit -m "docs(stats): document weapon-stats datamine pipeline + run order"
```

- [ ] **Step 6: Update memory**

Create `C:\Users\leowa\.claude\projects\d--Documents-SandLabs\memory\weapon-stats-import-state.md` recording: pipeline shipped on master (snapshot→build→artifact→seed-safe loader), new `ItemStats` columns (reload/range/armor/penetrates + ammo damage), datamine-authoritative-but-locks-win, run-after-seed ordering, **PROD load still pending** (`migrate deploy` + `db:load-weapon-stats`), and that turrets + UI are deferred follow-ups. Add a one-line pointer in `MEMORY.md`.

---

## Notes for the implementer

- **Prisma is pinned to v6** — do not upgrade. Use `npx prisma migrate dev` for the schema change.
- **Never reseed the live DB.** This loader exists precisely so prod gets these stats via `migrate deploy` + `db:load-weapon-stats`, never `db:seed`. Prod load is deliberately left as a manual follow-up step (not in this plan).
- **Path gotcha:** repo root is `D:/Documents/SandLabs`; the app is `sand-wiki/`. Run npm/tsx from inside `sand-wiki/`. The snapshot copy (Task 3 Step 1) runs from the repo root.
- **`damage` is an `Int` column** — `ammoPatch` rounds `damagePhysical` to satisfy it. All other numeric stat columns are `Float?`.
- The loader does **not** prune or create entities; an item present in the artifact but absent from the DB is reported and skipped, not an error.
```
