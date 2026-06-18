# Turret Stats Import + Stat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the 6 datamined turret records into `ItemStats` by extending the existing weapon-stats pipeline, and surface all the new datamined stats (weapon/ammo/armor + turret) on item detail pages.

**Architecture:** Turrets fold into the pipeline already on this branch — `turret_stats.json` snapshot → `turretPatch()` in the shared `weapon-stats.ts` → merged into the same `prisma/weapon-stats.json` artifact → the unchanged seed-safe loader. Two new nullable `ItemStats` columns. The UI extends the pure `itemStatCells()` cell-builder in `StatBox.tsx`, rendered by the existing uniform `StatGrid`.

**Tech Stack:** Next.js 16 / Prisma 6 (pinned) / Neon Postgres / TypeScript / tsx / Vitest 4 (node env).

**Spec:** `docs/superpowers/specs/2026-06-18-turret-stats-and-stat-ui-design.md`

**Branch:** Continue on `feat/weapon-stats-import` (already checked out). All paths are relative to `sand-wiki/` unless noted; the repo root is `D:/Documents/SandLabs` and the app is the `sand-wiki/` subfolder — run all npm/tsx commands from inside `sand-wiki/`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `prisma/schema.prisma` | Add `fireRate` + `projectileVelocity` to `ItemStats` | Modify |
| `prisma/weapon-stats.ts` | Add `TurretRaw`/`TurretStatsFile` types, extend `StatPatch`, add `turretPatch()` | Modify |
| `prisma/weapon-stats.test.ts` | Add `turretPatch` unit tests | Modify |
| `datamine/data/turret_stats.json` | Committed turret snapshot | Create |
| `prisma/build-weapon-stats.ts` | Also read `turret_stats.json` → merge into artifact | Modify |
| `prisma/weapon-stats.json` | Regenerated artifact (now incl. 6 turrets) | Modify (generated) |
| `src/components/StatBox.tsx` | Extend `ItemStatFields` + `itemStatCells()`; add `formatRange`/`formatRegen`; export `EMPTY_ITEM_STATS` | Modify |
| `src/components/StatBox.test.tsx` | Unit tests for the new cells + formatters | Create |
| `src/app/items/[slug]/page.tsx` | Use `EMPTY_ITEM_STATS` fallback (new fields flow automatically) | Modify |
| `datamine/README.md` | Note turrets now included | Modify |

---

## Task 1: Add turret columns to ItemStats

**Files:**
- Modify: `prisma/schema.prisma` (`model ItemStats`)

- [ ] **Step 1: Add the two columns**

In `prisma/schema.prisma`, inside `model ItemStats`, after the `armorDurability Int?` line (added in the prior pass) and before the closing `@@index`, add:

```prisma
  fireRate           Float?
  projectileVelocity Float?
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name turret_stats`
Expected: a new folder under `prisma/migrations/` is created and applies to the Neon dev branch; `Generated Prisma Client` prints. (If `prisma generate` hits an `EPERM` on the Windows query-engine DLL because the dev server is running, that is the known harmless lock from the prior pass — the `.d.ts` types still update; report it but continue.)

- [ ] **Step 3: Verify the new fields typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: only the KNOWN pre-existing unrelated error in `src/lib/tech-tree/layout.test.ts` (crownsIcon). No new errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(stats): add turret columns to ItemStats (fireRate, projectileVelocity)"
```

---

## Task 2: turretPatch transform + tests (TDD)

**Files:**
- Modify: `prisma/weapon-stats.ts`
- Test: `prisma/weapon-stats.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `prisma/weapon-stats.test.ts` (add `turretPatch` to the existing import line `import { ammoPatch, armorPatch, rangePatch, weaponPatch } from "./weapon-stats";` → `import { ammoPatch, armorPatch, rangePatch, turretPatch, weaponPatch } from "./weapon-stats";`):

```ts
describe("turretPatch", () => {
  it("maps fireRate, projectileVelocity, clipSize→magazine, penetrates; drops null reload", () => {
    expect(turretPatch({
      fireRate: 5, projectileVelocity: 150, clipSize: 2,
      penetrates: true, reloadSeconds: null,
    })).toEqual({ fireRate: 5, projectileVelocity: 150, magazine: 2, penetrates: true });
  });
  it("keeps reloadSeconds when present (cannon/shotgun turrets)", () => {
    expect(turretPatch({
      fireRate: 0.82, projectileVelocity: 250, clipSize: 1,
      penetrates: true, reloadSeconds: 4.5,
    })).toEqual({ fireRate: 0.82, projectileVelocity: 250, magazine: 1, penetrates: true, reloadSeconds: 4.5 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run prisma/weapon-stats.test.ts`
Expected: FAIL — `turretPatch` is not exported.

- [ ] **Step 3: Implement**

In `prisma/weapon-stats.ts`:

(a) Add `fireRate` + `projectileVelocity` to the `StatPatch` interface (after `armorDurability?: number;`):
```ts
  fireRate?: number;
  projectileVelocity?: number;
```

(b) Add the turret raw types (after the `ArmorRaw` / `WeaponStatsFile` interfaces). Only the read fields are typed strictly; the other source fields (`family`, `tier`, `variant`, `barrels`, `fireInterval`, `autoRefill`, `ammoTypes`, `spreadIdleMax`, `source`) are present in the JSON but intentionally not imported:
```ts
export interface TurretRaw {
  fireRate: number | null;
  projectileVelocity: number | null;
  clipSize: number | null;
  penetrates: boolean | null;
  reloadSeconds: number | null;
}
export interface TurretStatsFile { turrets: Record<string, TurretRaw> }
```

(c) Add the transform (after `armorPatch`):
```ts
export function turretPatch(t: TurretRaw): StatPatch {
  return prune({
    fireRate: t.fireRate ?? undefined,
    projectileVelocity: t.projectileVelocity ?? undefined,
    magazine: t.clipSize ?? undefined,
    penetrates: t.penetrates ?? undefined,
    reloadSeconds: t.reloadSeconds ?? undefined,
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run prisma/weapon-stats.test.ts`
Expected: PASS — all tests green (9 prior + 2 new = 11).

- [ ] **Step 5: Commit**

```bash
git add prisma/weapon-stats.ts prisma/weapon-stats.test.ts
git commit -m "feat(stats): turretPatch transform + StatPatch turret fields"
```

---

## Task 3: Snapshot + build integration → regenerated artifact

**Files:**
- Create: `datamine/data/turret_stats.json`
- Modify: `prisma/build-weapon-stats.ts`
- Modify: `prisma/weapon-stats.json` (regenerated)

- [ ] **Step 1: Copy the turret snapshot**

Run (from repo root `D:/Documents/SandLabs`):
```bash
cp sek/sand-expedition-kit/site/src/data/turret_stats.json sand-wiki/datamine/data/turret_stats.json
```
Verify (from repo root): `node -e "const d=require('./sand-wiki/datamine/data/turret_stats.json'); console.log('turrets', Object.keys(d.turrets).length)"`
Expected: `turrets 6`

- [ ] **Step 2: Extend the build script**

In `prisma/build-weapon-stats.ts`:

(a) Add `turretPatch` + `TurretStatsFile` to the import from `./weapon-stats`:
```ts
import {
  ammoPatch, armorPatch, turretPatch, weaponPatch,
  type StatPatch, type TurretStatsFile, type WeaponStatsArtifact, type WeaponStatsFile,
} from "./weapon-stats";
```

(b) After the existing `const raw = ... weapon_stats.json ...` read, add the turret read:
```ts
const turrets = JSON.parse(
  readFileSync(join(__dirname, "..", "datamine/data/turret_stats.json"), "utf-8"),
) as TurretStatsFile;
```

(c) After the three existing `for (const [id, ...] of Object.entries(raw.*)) add(...)` loops, add:
```ts
for (const [id, t] of Object.entries(turrets.turrets)) add(id, turretPatch(t));
```

- [ ] **Step 3: Regenerate and inspect the artifact**

Run: `npm run weapons:build`
Expected: `Wrote prisma/weapon-stats.json: 61 items.` (55 prior + 6 turrets) and the same `Dropped ...` line as before (turret ids all resolve, so they are NOT in the dropped list).
Spot-check (from inside `sand-wiki/`):
```bash
node -e "const a=require('./prisma/weapon-stats.json'); console.log('count', a.meta.items); console.log('auto-t2:', JSON.stringify(a.items['game-packed-auto-turret-t2-container'])); console.log('cannon-t2:', JSON.stringify(a.items['game-packed-turret-t2-container']));"
```
Expected: count 61; `game-packed-auto-turret-t2-container` → `{"fireRate":5,"projectileVelocity":150,"magazine":2,"penetrates":true}` (no reloadSeconds); `game-packed-turret-t2-container` → includes `"reloadSeconds":3.5`.

- [ ] **Step 4: Commit**

```bash
git add datamine/data/turret_stats.json prisma/build-weapon-stats.ts prisma/weapon-stats.json
git commit -m "feat(stats): import turret_stats into the weapon-stats artifact"
```

---

## Task 4: UI — surface new stats in `itemStatCells` (TDD)

**Files:**
- Modify: `src/components/StatBox.tsx`
- Create: `src/components/StatBox.test.tsx`
- Modify: `src/app/items/[slug]/page.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/StatBox.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { itemStatCells, EMPTY_ITEM_STATS } from "./StatBox";

const cell = (cells: ReturnType<typeof itemStatCells>, label: string) =>
  cells.find((c) => c.label === label)?.value;

describe("itemStatCells — new datamined fields", () => {
  it("renders weapon reload + range (with falloff multiplier)", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, reloadSeconds: 3.05,
      rangeFull: 15, rangeMax: 150, rangeMinMult: 0.5, rangeFalloff: true,
    });
    expect(cell(cells, "Reload")).toBe("3.05s");
    expect(cell(cells, "Range")).toBe("15→150 m ·×0.5");
  });

  it("renders range without multiplier when falloff is false", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, rangeFull: 8, rangeMax: 30, rangeMinMult: 0.4, rangeFalloff: false,
    });
    expect(cell(cells, "Range")).toBe("8→30 m");
  });

  it("renders ammo damage, range and penetrates (only when true)", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, damage: 50, rangeFull: 35, rangeMax: 150, rangeMinMult: 0.3, rangeFalloff: true, penetrates: true,
    });
    expect(cell(cells, "Damage")).toBe(50);
    expect(cell(cells, "Penetrates")).toBe("Yes");
  });

  it("omits the Penetrates cell when penetrates is false", () => {
    const cells = itemStatCells({ ...EMPTY_ITEM_STATS, penetrates: false });
    expect(cells.find((c) => c.label === "Penetrates")).toBeUndefined();
  });

  it("renders armor rating, durability and combined regen", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, armorRating: 150, armorDurability: 1400, armorRegenSpeed: 5, armorRegenDelay: 10,
    });
    expect(cell(cells, "Armor")).toBe(150);
    expect(cell(cells, "Durability")).toBe(1400);
    expect(cell(cells, "Regen")).toBe("5/s · 10s delay");
  });

  it("renders turret fire rate, velocity and magazine", () => {
    const cells = itemStatCells({
      ...EMPTY_ITEM_STATS, fireRate: 5, projectileVelocity: 150, magazine: 2, penetrates: true,
    });
    expect(cell(cells, "Fire rate")).toBe("5/s");
    expect(cell(cells, "Velocity")).toBe("150 m/s");
    expect(cell(cells, "Magazine")).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/StatBox.test.tsx`
Expected: FAIL — `EMPTY_ITEM_STATS` is not exported / new cells absent.

- [ ] **Step 3: Implement in `src/components/StatBox.tsx`**

Replace the file contents with:

```tsx
import type { StatCell } from "@/lib/item-view";
import { StatGrid } from "@/components/StatGrid";

/** The flat wiki-stat columns on Item that StatBox renders. */
export interface ItemStatFields {
  statType: string | null;
  damage: number | null;
  playerDamage: number | null;
  tramplerDamage: number | null;
  splashDamage: number | null;
  magazine: number | null;
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

/** All-null defaults, for callers that may not have an ItemStats row. */
export const EMPTY_ITEM_STATS: ItemStatFields = {
  statType: null, damage: null, playerDamage: null, tramplerDamage: null,
  splashDamage: null, magazine: null, reloadSeconds: null, rangeFull: null,
  rangeMax: null, rangeMinMult: null, rangeFalloff: null, penetrates: null,
  armorRating: null, armorRegenDelay: null, armorRegenSpeed: null,
  armorDurability: null, fireRate: null, projectileVelocity: null,
};

/** "35→150 m", with a "·×0.3" suffix only when the round has damage falloff. */
function formatRange(full: number, max: number, minMult: number | null, falloff: boolean | null): string {
  const base = `${full}→${max} m`;
  return falloff && minMult != null ? `${base} ·×${minMult}` : base;
}

/** "5/s · 6s delay" (or "5/s" when there is no delay). */
function formatRegen(speed: number, delay: number | null): string {
  return delay != null ? `${speed}/s · ${delay}s delay` : `${speed}/s`;
}

export function itemStatCells(item: ItemStatFields, typeLabel?: string): StatCell[] {
  const cells: StatCell[] = [];
  if (item.damage != null) cells.push({ label: "Damage", value: item.damage });
  if (item.playerDamage != null) cells.push({ label: "Damage (Player)", value: item.playerDamage });
  if (item.tramplerDamage != null) cells.push({ label: "Damage (Trampler)", value: item.tramplerDamage });
  if (item.splashDamage != null) cells.push({ label: "Splash Damage", value: item.splashDamage });
  if (item.rangeFull != null && item.rangeMax != null) {
    cells.push({ label: "Range", value: formatRange(item.rangeFull, item.rangeMax, item.rangeMinMult, item.rangeFalloff) });
  }
  if (item.reloadSeconds != null) cells.push({ label: "Reload", value: `${item.reloadSeconds}s` });
  if (item.fireRate != null) cells.push({ label: "Fire rate", value: `${item.fireRate}/s` });
  if (item.projectileVelocity != null) cells.push({ label: "Velocity", value: `${item.projectileVelocity} m/s` });
  if (item.magazine != null) cells.push({ label: "Magazine", value: item.magazine });
  if (item.penetrates === true) cells.push({ label: "Penetrates", value: "Yes" });
  if (item.armorRating != null) cells.push({ label: "Armor", value: item.armorRating });
  if (item.armorDurability != null) cells.push({ label: "Durability", value: item.armorDurability });
  if (item.armorRegenSpeed != null) cells.push({ label: "Regen", value: formatRegen(item.armorRegenSpeed, item.armorRegenDelay) });
  const typeValue = typeLabel ?? item.statType;
  if (typeValue) cells.push({ label: "Type", value: typeValue });
  return cells;
}

/** Prominent grid of wiki-sourced gameplay stats, shown under the detail header.
 *  Renders nothing when there are no displayable stats. */
export function StatBox({ item, typeLabel }: { item: ItemStatFields; typeLabel?: string }) {
  return <StatGrid cells={itemStatCells(item, typeLabel)} />;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/StatBox.test.tsx`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Update the page.tsx fallback to use `EMPTY_ITEM_STATS`**

In `src/app/items/[slug]/page.tsx`:

(a) Find the existing import of `itemStatCells` (it imports from `@/components/StatBox`) and add `EMPTY_ITEM_STATS`:
```ts
import { itemStatCells, EMPTY_ITEM_STATS } from "@/components/StatBox";
```
(If `itemStatCells` is imported on a shared line, just add `EMPTY_ITEM_STATS` to that import.)

(b) Replace the inline fallback object literal in the `stats={itemStatCells(...)}` call (currently `stats ?? { statType: null, damage: null, playerDamage: null, tramplerDamage: null, splashDamage: null, magazine: null }`) with:
```ts
      stats={itemStatCells(
        stats ?? EMPTY_ITEM_STATS,
        isAmmo ? caliberLabel(caliber) ?? undefined : undefined,
      )}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: only the KNOWN pre-existing `layout.test.ts` error. No new errors. (The real `item.itemStats` Prisma object structurally includes all `ItemStatFields` keys, so passing it to `itemStatCells` typechecks.)

- [ ] **Step 7: Commit**

```bash
git add src/components/StatBox.tsx src/components/StatBox.test.tsx "src/app/items/[slug]/page.tsx"
git commit -m "feat(ui): surface reload/range/armor/turret stats on item pages"
```

---

## Task 5: Load on dev, verify end-to-end, document

**Files:**
- Modify: `datamine/README.md`

- [ ] **Step 1: Load the regenerated artifact into the dev DB**

Run: `npm run db:load-weapon-stats`
Expected: `Updated ItemStats for 61 item(s); <M> field(s) written, 0 preserved (locked).` (was 55; +6 turrets). Possibly a small `Skipped ... not in DB` line.

- [ ] **Step 2: Verify idempotency**

Run: `npm run db:load-weapon-stats` again.
Expected: identical counts, no errors.

- [ ] **Step 3: Spot-check turret + weapon data in the DB**

Run (PowerShell — drop the backslash on `$disconnect`; Bash — keep it):
```bash
npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); for (const slug of ['game-packed-auto-turret-t2-container','game-packed-turret-t2-container']) { const j=await p.entity.findUnique({where:{slug},select:{name:true,itemStats:{select:{fireRate:true,projectileVelocity:true,magazine:true,penetrates:true,reloadSeconds:true}}}}); console.log(slug, JSON.stringify(j?.itemStats)); } await p.\$disconnect();"
```
Expected: `game-packed-auto-turret-t2-container` → `{fireRate:5, projectileVelocity:150, magazine:2, penetrates:true, reloadSeconds:null}`; `game-packed-turret-t2-container` → `{fireRate:0.67,..., reloadSeconds:3.5}`.

- [ ] **Step 4: Verify the UI renders (full test suite)**

Run: `npm test`
Expected: all tests pass (prior 342 + 2 turretPatch + 6 StatBox = 350).

- [ ] **Step 5: Update the README**

In `datamine/README.md`, in the "Weapon / ammo / armor stats" section, update the source line and the "Not imported" line. Replace the existing source line:
```markdown
Source: SEK `site/src/data/weapon_stats.json` (built datamine output) → copied to
`datamine/data/weapon_stats.json` (committed snapshot).
```
with:
```markdown
Source: SEK `site/src/data/weapon_stats.json` + `site/src/data/turret_stats.json` (built
datamine outputs) → copied to `datamine/data/` (committed snapshots). Both feed the same
`weapons:build` → `prisma/weapon-stats.json` artifact.
```
and replace the existing "Not imported here:" paragraph with:
```markdown
Turret stats (fireRate, projectileVelocity, clipSize→magazine, penetrates, reloadSeconds)
are imported for the 6 turret items. Not imported: magazine/ammoType for player weapons
(absent from weapon_stats.json), recoil/spread, and turret extras (barrels, autoRefill,
spreadIdleMax, fireInterval, family/tier).
```

- [ ] **Step 6: Commit**

```bash
git add datamine/README.md
git commit -m "docs(stats): note turret_stats now imported via the weapon-stats pipeline"
```

- [ ] **Step 7: Update memory (controller handles this)**

Update `weapon-stats-import-state.md`: turrets now imported (fireRate/projectileVelocity cols + clipSize→magazine) and the stat UI is live (itemStatCells surfaces reload/range/armor/turret cells); turrets no longer a pending follow-up. PROD load still pending. (The controller will do this — implementer can skip.)

---

## Notes for the implementer
- **Prisma is pinned to v6** — use `npx prisma migrate dev`, do not upgrade.
- **Never reseed the live DB.** Only `db:load-weapon-stats` writes data; no seed/reset.
- The loader (`load-weapon-stats.ts`) is **unchanged** — it already writes whatever `StatPatch` columns are present, so turret fields flow through with no loader edit.
- `fireRate`/`projectileVelocity` are `Float?`; `magazine` is the existing `Int?` (clipSize values are 1–2). `penetrates`/`reloadSeconds` reuse the columns added in the prior pass.
- A KNOWN pre-existing tsc error in `src/lib/tech-tree/layout.test.ts` (crownsIcon) is unrelated — ignore it; just confirm no NEW errors.
- Vitest runs in the `node` env; the new `StatBox.test.tsx` tests call the pure `itemStatCells` function (no rendering), so jsdom is not needed.
```
