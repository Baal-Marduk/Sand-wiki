# Wire Combat Stats + Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make item combat stats (`itemStats`) and crafting recipes auto-update per patch by wiring `weapon_stats`/`turret_stats`/`recipes` into the TS transform, fixing the turret enumeration bug, and regenerating inputs from the release build.

**Architecture:** Two new merge-over-baseline transform modules (`combat-stats.ts`, `recipes.ts`) that reconcile SEK ids → wiki slugs via the existing `rec.bySekId` map (+ `canonicalSekId`), refresh only datamine-provided fields, and preserve baseline extras — same pattern as `items.ts`/`trampler.ts`. Plus a Python fix (`build_turret_stats` enumerates the complete `item_defs` registry, not loot-derived `items.json`) and a new `extract_crafting_recipes.py` that emits `sek-out/recipes.json` directly.

**Tech Stack:** TypeScript 5 + tsx + Vitest 4 (transform); Python 3.13 + UnityPy (extractors); npm workspaces. Spec: `docs/superpowers/specs/2026-06-19-wire-combat-stats-and-recipes-design.md`.

**Branch:** `feat/monorepo-static-foundation` (already checked out). Repo root: `D:/Documents/SandLabs`. Datamine package: `packages/datamine`.

**Commit footer (every commit):**
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

**Test command:** `cd packages/datamine && npm test` — the `npm run test --workspace=packages/datamine` form is BROKEN on this Windows box (vitest loads an undefined config). Single file: `cd packages/datamine && npx vitest run transform/<file>.test.ts`.
**Transform run:** `cd packages/datamine && npm run transform`.
**Baseline-accumulation hazard:** the transform reads `packages/data/generated/*.json` as its baseline and overwrites it. Before EVERY verification run: `git checkout HEAD -- packages/data/generated/`.
**Never commit a transform run made against stale playtest inputs** — only after the release-build regeneration (Tasks 3–4) is done.

**Verified facts (from spec + release-build inspection):**
- `weapon_stats.json` (release) = `{weapons:72, ammo:37, armor:3}`; combat values match baseline (refresh, no regression).
- `storageStack` is NOT mapped — ammo `stack` is per-tier backpack capacity `[T1,T2,T3]`, not storage stack.
- Armor fields: `armorRating`, `regen.delay`→`armorRegenDelay`, `regen.speed`→`armorRegenSpeed`, `durability`→`armorDurability`.
- Turret enumeration from `item_defs` → 13/13 match (proven by simulation).
- Crafting recipes live in `craftingrecipes_assets_all.bundle` as plain typetree MonoBehaviours `{m_Name:"Recipes_<Workbench>_Workbench_T<n>", recipes:[{inputIngredients:[{itemId,amount}], outputIngredients:[...], craftingTimeSeconds}]}` (NOT Odin).
- Baseline recipe slugs = primary-output slug (`artefact-crystal`) for crafting, `loc-<place>-<output>` for location recipes → merge by **content signature**, keep baseline slugs.

**Target types (from `packages/data/src/types.ts`):**
- `ItemStats`: storageStack, workbenchTier, statType, statValue, damage, playerDamage, tramplerDamage, splashDamage, magazine, ammoName, ammoType, reloadSeconds, rangeFull, rangeMax, rangeMinMult, rangeFalloff, penetrates, armorRating, armorRegenDelay, armorRegenSpeed, armorDurability, fireRate, projectileVelocity (all nullable).
- `Recipe`: { slug, workbench, tier, craftTimeSeconds, locationSlug, inputs: {itemSlug,amount}[], outputs: {itemSlug,amount}[] }.
- `ReconcileHit` (from `transform/reconcile.ts`): { slug, status }. `slugify(s)` and `canonicalSekId(id)` are exported from `reconcile.ts` / `variants.ts`.

---

## File Structure

- Create `packages/datamine/transform/combat-stats.ts` — load weapon/turret stats, build `ItemStats` patches, merge over baseline items.
- Create `packages/datamine/transform/combat-stats.test.ts`.
- Create `packages/datamine/transform/recipes.ts` — load `recipes.json`, reconcile lines, content-signature merge over baseline recipes.
- Create `packages/datamine/transform/recipes.test.ts`.
- Modify `packages/datamine/transform/emit.ts` — add `writeRecipesMissingReport`.
- Modify `packages/datamine/transform/run.ts` — wire both modules; rename final entity var to `withCombat`.
- Modify `packages/datamine/scripts/build_turret_stats.py` — enumerate from `item_defs.json` (13), not `items.json` (6).
- Create `packages/datamine/scripts/extract_crafting_recipes.py` — emit `sek-out/recipes.json` from the bundle.
- Regenerate (release build): `sek-out/turret_stats.json` (Task 3), `sek-out/recipes.json` (Task 4).

---

## Task 1: combat-stats.ts (item combat stats merge)

**Files:**
- Create: `packages/datamine/transform/combat-stats.ts`
- Test: `packages/datamine/transform/combat-stats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/datamine/transform/combat-stats.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mergeCombatStats, type WeaponStatsFile, type TurretStat } from "./combat-stats";
import type { Entity, ItemStats } from "@sandlabs/data";
import type { ReconcileHit } from "./reconcile";

const item = (slug: string, stats: Partial<ItemStats> | null = null): Entity => ({
  id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
  rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
  itemStats: stats === null ? null : { storageStack: null, workbenchTier: null, statType: null,
    statValue: null, damage: null, playerDamage: null, tramplerDamage: null, splashDamage: null,
    magazine: null, ammoName: null, ammoType: null, reloadSeconds: null, rangeFull: null,
    rangeMax: null, rangeMinMult: null, rangeFalloff: null, penetrates: null, armorRating: null,
    armorRegenDelay: null, armorRegenSpeed: null, armorDurability: null, fireRate: null,
    projectileVelocity: null, ...stats },
  tramplerStats: null, techNodeStats: null,
});
const hit = (slug: string): ReconcileHit => ({ slug, status: "matched" });
const wf = (o: Partial<WeaponStatsFile> = {}): WeaponStatsFile => ({ weapons: {}, ammo: {}, armor: {}, ...o });

describe("mergeCombatStats", () => {
  it("refreshes ammo damage/range/penetrates over the baseline, keeps baseline extras", () => {
    const baseline = [item("pistol-ammo", { ammoType: "8x21 mm", statType: "Ammunition", damage: 1 })];
    const map = new Map<string, ReconcileHit>([["item_pistolAmmo", hit("pistol-ammo")]]);
    const out = mergeCombatStats(baseline, wf({ ammo: { item_pistolAmmo: {
      turret: false, damagePhysical: 50, range: { full: 35, max: 150, minMult: 0.3, falloff: true }, penetrates: false, stack: [50, 250, 1000] } } }), {}, map);
    const s = out[0].itemStats!;
    expect(s.damage).toBe(50);            // refreshed
    expect(s.rangeFull).toBe(35);
    expect(s.rangeMax).toBe(150);
    expect(s.rangeFalloff).toBe(true);
    expect(s.penetrates).toBe(false);
    expect(s.ammoType).toBe("8x21 mm");   // baseline extra preserved
    expect(s.statType).toBe("Ammunition");
    expect(s.storageStack).toBeNull();    // NOT mapped from stack[]
  });

  it("maps armor regen fields and creates itemStats when baseline had none", () => {
    const baseline = [item("old-jacket", null)];
    const map = new Map([["Old_Jacket", hit("old-jacket")]]);
    const out = mergeCombatStats(baseline, wf({ armor: { Old_Jacket: {
      armorRating: 50, regen: { delay: 6, speed: 7 }, durability: 1400 } } }), {}, map);
    const s = out[0].itemStats!;
    expect(s).not.toBeNull();
    expect(s.armorRating).toBe(50);
    expect(s.armorRegenDelay).toBe(6);
    expect(s.armorRegenSpeed).toBe(7);
    expect(s.armorDurability).toBe(1400);
  });

  it("maps turret fields and merges when an item appears in multiple maps", () => {
    const baseline = [item("auto-turret-t2", { damage: 9 })];
    const map = new Map([["game_packedAutoTurretT2Container", hit("auto-turret-t2")]]);
    const turrets: Record<string, TurretStat> = { game_packedAutoTurretT2Container: {
      fireRate: 5, clipSize: 2, reloadSeconds: null, projectileVelocity: 150, penetrates: true } };
    const out = mergeCombatStats(baseline, wf(), turrets, map);
    const s = out[0].itemStats!;
    expect(s.fireRate).toBe(5);
    expect(s.magazine).toBe(2);
    expect(s.projectileVelocity).toBe(150);
    expect(s.penetrates).toBe(true);
    expect(s.damage).toBe(9); // untouched baseline field kept
  });

  it("collapses _Melee/_Ranged via canonical id and skips unreconciled ids", () => {
    const baseline = [item("anti-reactor-gun", { reloadSeconds: 1 })];
    const map = new Map([["item_antiReactorGun", hit("anti-reactor-gun")]]);
    const out = mergeCombatStats(baseline, wf({ weapons: {
      item_antiReactorGun_Melee: { reloadSeconds: 3.05, range: null },
      DevSiegeRevolver: { reloadSeconds: 9, range: null } } }), {}, map);
    expect(out[0].itemStats!.reloadSeconds).toBe(3.05); // _Melee canonicalized to the slug
    expect(out.find((e) => e.slug === "dev")).toBeUndefined(); // dev id not in map -> ignored
  });

  it("leaves items with no datamine entry untouched", () => {
    const baseline = [item("plain", { damage: 7 })];
    const out = mergeCombatStats(baseline, wf(), {}, new Map());
    expect(out[0].itemStats!.damage).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/datamine && npx vitest run transform/combat-stats.test.ts`
Expected: FAIL — `Cannot find module './combat-stats'`.

- [ ] **Step 3: Write the implementation**

Create `packages/datamine/transform/combat-stats.ts`:
```ts
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Entity, ItemStats } from "@sandlabs/data";
import type { ReconcileHit } from "./reconcile";
import { canonicalSekId } from "./variants";

const SEK = resolve(import.meta.dirname, "../sek-out");

export interface Range { full: number | null; max: number | null; minMult: number | null; falloff: boolean | null }
export interface WeaponStat { reloadSeconds: number | null; range: Range | null }
export interface AmmoStat { turret: boolean; damagePhysical: number | null; range: Range | null; penetrates: boolean | null; stack: number[] | null }
export interface ArmorStat { armorRating: number | null; regen: { delay: number | null; speed: number | null } | null; durability: number | null }
export interface TurretStat { fireRate: number | null; clipSize: number | null; reloadSeconds: number | null; projectileVelocity: number | null; penetrates: boolean | null }
export interface WeaponStatsFile { weapons: Record<string, WeaponStat>; ammo: Record<string, AmmoStat>; armor: Record<string, ArmorStat> }

/** weapon_stats.json (release: weapons/ammo/armor). Empty shape when absent → merge is a no-op. */
export function loadWeaponStats(dir = SEK): WeaponStatsFile {
  const p = resolve(dir, "weapon_stats.json");
  if (!existsSync(p)) return { weapons: {}, ammo: {}, armor: {} };
  const d = JSON.parse(readFileSync(p, "utf-8"));
  return { weapons: d.weapons ?? {}, ammo: d.ammo ?? {}, armor: d.armor ?? {} };
}

/** turret_stats.json (.turrets map). Empty when absent. */
export function loadTurretStats(dir = SEK): Record<string, TurretStat> {
  const p = resolve(dir, "turret_stats.json");
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf-8")).turrets ?? {};
}

type Patch = Partial<ItemStats>;
const set = (p: Patch, k: keyof ItemStats, v: number | boolean | null | undefined) => {
  if (v !== null && v !== undefined) (p as Record<string, unknown>)[k] = v;
};
function rangeInto(p: Patch, r: Range | null) {
  if (!r) return;
  set(p, "rangeFull", r.full); set(p, "rangeMax", r.max);
  set(p, "rangeMinMult", r.minMult); set(p, "rangeFalloff", r.falloff);
}
function weaponPatch(w: WeaponStat): Patch { const p: Patch = {}; set(p, "reloadSeconds", w.reloadSeconds); rangeInto(p, w.range); return p; }
function ammoPatch(a: AmmoStat): Patch { const p: Patch = {}; set(p, "damage", a.damagePhysical); rangeInto(p, a.range); set(p, "penetrates", a.penetrates); return p; }
function armorPatch(a: ArmorStat): Patch {
  const p: Patch = {}; set(p, "armorRating", a.armorRating);
  if (a.regen) { set(p, "armorRegenDelay", a.regen.delay); set(p, "armorRegenSpeed", a.regen.speed); }
  set(p, "armorDurability", a.durability); return p;
}
function turretPatch(t: TurretStat): Patch {
  const p: Patch = {}; set(p, "fireRate", t.fireRate); set(p, "magazine", t.clipSize);
  set(p, "reloadSeconds", t.reloadSeconds); set(p, "projectileVelocity", t.projectileVelocity);
  set(p, "penetrates", t.penetrates); return p;
}

const EMPTY_ITEM_STATS: ItemStats = {
  storageStack: null, workbenchTier: null, statType: null, statValue: null, damage: null,
  playerDamage: null, tramplerDamage: null, splashDamage: null, magazine: null, ammoName: null,
  ammoType: null, reloadSeconds: null, rangeFull: null, rangeMax: null, rangeMinMult: null,
  rangeFalloff: null, penetrates: null, armorRating: null, armorRegenDelay: null,
  armorRegenSpeed: null, armorDurability: null, fireRate: null, projectileVelocity: null,
};

/** Merge datamined combat stats over baseline ITEM entities. Reconcile each SEK id (canonical)
 *  via bySekId → slug, build a per-slug patch (an item may be weapon+ammo+turret → patches merge),
 *  and refresh those fields over the baseline itemStats (creating it from nulls if absent). Only
 *  datamine-provided fields are written; baseline extras (ammoType, statType, workbenchTier,
 *  storageStack, …) are preserved. storageStack is intentionally NOT sourced from ammo `stack`. */
export function mergeCombatStats(
  baseline: Entity[],
  weaponStats: WeaponStatsFile,
  turretStats: Record<string, TurretStat>,
  bySekId: Map<string, ReconcileHit>,
): Entity[] {
  const patchBySlug = new Map<string, Patch>();
  const add = (sekId: string, patch: Patch) => {
    if (Object.keys(patch).length === 0) return;
    const h = bySekId.get(canonicalSekId(sekId));
    if (!h) return;
    patchBySlug.set(h.slug, { ...(patchBySlug.get(h.slug) ?? {}), ...patch });
  };
  for (const [id, w] of Object.entries(weaponStats.weapons)) add(id, weaponPatch(w));
  for (const [id, a] of Object.entries(weaponStats.ammo)) add(id, ammoPatch(a));
  for (const [id, a] of Object.entries(weaponStats.armor)) add(id, armorPatch(a));
  for (const [id, t] of Object.entries(turretStats)) add(id, turretPatch(t));

  return baseline.map((e) => {
    const patch = patchBySlug.get(e.slug);
    if (!patch) return e;
    return { ...e, itemStats: { ...(e.itemStats ?? EMPTY_ITEM_STATS), ...patch } };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/datamine && npx vitest run transform/combat-stats.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `cd packages/datamine && npm test`
Expected: all prior tests + 5 new pass.

- [ ] **Step 6: Commit**

```bash
git add packages/datamine/transform/combat-stats.ts packages/datamine/transform/combat-stats.test.ts
git commit -m "feat(datamine): combat-stats merge module (weapon/turret/ammo/armor -> ItemStats)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: recipes.ts (crafting recipe merge)

**Files:**
- Create: `packages/datamine/transform/recipes.ts`
- Test: `packages/datamine/transform/recipes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/datamine/transform/recipes.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mergeRecipes, type RawRecipe } from "./recipes";
import type { Recipe } from "@sandlabs/data";
import type { ReconcileHit } from "./reconcile";

const hit = (slug: string): ReconcileHit => ({ slug, status: "matched" });
const map = new Map<string, ReconcileHit>([
  ["item_resourceFabricScraps", hit("resource-fabric-scraps")],
  ["item_resourceThreads", hit("resource-threads")],
  ["item_resourceFabric", hit("resource-fabric")],
  ["Old_Jacket", hit("old-jacket")],
]);
const raw = (o: Partial<RawRecipe>): RawRecipe => ({ workbench: "Utility", tier: 1, inputs: [], outputs: [], seconds: 2, ...o });

describe("mergeRecipes", () => {
  it("refreshes a baseline recipe matched by content signature, keeping its slug", () => {
    const baseline: Recipe[] = [{ slug: "resource-fabric", workbench: "Utility", tier: 1,
      craftTimeSeconds: 99, locationSlug: null,
      inputs: [{ itemSlug: "resource-fabric-scraps", amount: 5 }, { itemSlug: "resource-threads", amount: 15 }],
      outputs: [{ itemSlug: "resource-fabric", amount: 1 }] }];
    const dm = [raw({ inputs: [{ item: "item_resourceFabricScraps", amount: 5 }, { item: "item_resourceThreads", amount: 15 }],
      outputs: [{ item: "item_resourceFabric", amount: 1 }], seconds: 2 })];
    const { recipes, missing } = mergeRecipes(baseline, dm, map);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].slug).toBe("resource-fabric"); // baseline slug kept
    expect(recipes[0].craftTimeSeconds).toBe(2);     // refreshed
    expect(missing).toHaveLength(0);
  });

  it("adds a new datamined recipe (slug = primary output) and preserves unmatched baseline recipes", () => {
    const baseline: Recipe[] = [{ slug: "loc-x-energy", workbench: null, tier: null,
      craftTimeSeconds: null, locationSlug: "x", inputs: [], outputs: [{ itemSlug: "energy", amount: 1 }] }];
    const dm = [raw({ outputs: [{ item: "Old_Jacket", amount: 1 }],
      inputs: [{ item: "item_resourceFabric", amount: 2 }], seconds: 5 })];
    const { recipes, missing } = mergeRecipes(baseline, dm, map);
    expect(recipes.map((r) => r.slug).sort()).toEqual(["loc-x-energy", "old-jacket"]);
    expect(missing.map((m) => m.slug)).toEqual(["loc-x-energy"]); // baseline-only recipe reported
  });

  it("drops recipe lines whose item id does not reconcile, and skips recipes with no resolvable output", () => {
    const dm = [
      raw({ outputs: [{ item: "unknown_item", amount: 1 }] }),                 // no resolvable output -> skipped
      raw({ outputs: [{ item: "Old_Jacket", amount: 1 }], inputs: [{ item: "unknown_item", amount: 9 }, { item: "item_resourceThreads", amount: 3 }] }),
    ];
    const { recipes } = mergeRecipes([], dm, map);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].slug).toBe("old-jacket");
    expect(recipes[0].inputs).toEqual([{ itemSlug: "resource-threads", amount: 3 }]); // unknown input dropped
  });

  it("dedupes new-recipe slugs with a numeric suffix", () => {
    const dm = [
      raw({ outputs: [{ item: "Old_Jacket", amount: 1 }], tier: 1 }),
      raw({ outputs: [{ item: "Old_Jacket", amount: 1 }], tier: 2 }),
    ];
    const { recipes } = mergeRecipes([], dm, map);
    expect(recipes.map((r) => r.slug).sort()).toEqual(["old-jacket", "old-jacket-2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/datamine && npx vitest run transform/recipes.test.ts`
Expected: FAIL — `Cannot find module './recipes'`.

- [ ] **Step 3: Write the implementation**

Create `packages/datamine/transform/recipes.ts`:
```ts
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Recipe, RecipeLineRow } from "@sandlabs/data";
import type { ReconcileHit } from "./reconcile";
import { canonicalSekId } from "./variants";

const SEK = resolve(import.meta.dirname, "../sek-out");

export interface RawLine { item: string; amount: number }
export interface RawRecipe { workbench: string | null; tier: number | null; inputs: RawLine[]; outputs: RawLine[]; seconds: number | null }

/** sek-out/recipes.json (crafting). Empty when absent → merge keeps the baseline recipes. */
export function loadRecipes(dir = SEK): RawRecipe[] {
  const p = resolve(dir, "recipes.json");
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf-8")) as RawRecipe[];
}

export interface RecipesResult { recipes: Recipe[]; missing: { slug: string }[] }

const mapLines = (lines: RawLine[], bySekId: Map<string, ReconcileHit>): RecipeLineRow[] =>
  lines
    .map((l) => { const h = bySekId.get(canonicalSekId(l.item)); return h ? { itemSlug: h.slug, amount: l.amount } : null; })
    .filter((x): x is RecipeLineRow => x !== null);

/** Content signature for matching a datamined recipe to a baseline recipe (workbench+tier+sorted
 *  input/output slugs+amounts) — independent of slug, so baseline slugs stay stable. */
function signature(workbench: string | null, tier: number | null, inputs: RecipeLineRow[], outputs: RecipeLineRow[]): string {
  const part = (rows: RecipeLineRow[]) => rows.map((r) => `${r.itemSlug}:${r.amount}`).sort().join(",");
  return `${(workbench ?? "").toLowerCase()}|t${tier ?? 0}|out=${part(outputs)}|in=${part(inputs)}`;
}

/** Merge datamined crafting recipes over the baseline:
 *  - match by content signature → refresh fields in place, KEEP the baseline slug;
 *  - unmatched datamined recipe → new entry, slug = primary output slug (deduped -2/-3);
 *  - recipe with no resolvable output → skipped;
 *  - baseline recipes not produced by the datamine (location recipes, uncovered crafts) → kept
 *    and listed in `missing`. */
export function mergeRecipes(baseline: Recipe[], raws: RawRecipe[], bySekId: Map<string, ReconcileHit>): RecipesResult {
  const baseBySig = new Map(baseline.map((r) => [signature(r.workbench, r.tier, r.inputs, r.outputs), r]));
  const taken = new Set(baseline.map((r) => r.slug));
  const result = new Map(baseline.map((r) => [r.slug, r]));
  const matchedSlugs = new Set<string>();

  for (const raw of raws) {
    const inputs = mapLines(raw.inputs, bySekId);
    const outputs = mapLines(raw.outputs, bySekId);
    if (outputs.length === 0) continue; // can't identify/slug a recipe with no resolvable output
    const sig = signature(raw.workbench, raw.tier, inputs, outputs);
    const existing = baseBySig.get(sig);
    if (existing) {
      result.set(existing.slug, { ...existing, workbench: raw.workbench, tier: raw.tier, craftTimeSeconds: raw.seconds, inputs, outputs });
      matchedSlugs.add(existing.slug);
      continue;
    }
    let base = outputs[0].itemSlug, slug = base, n = 1;
    while (taken.has(slug)) { n += 1; slug = `${base}-${n}`; }
    taken.add(slug);
    result.set(slug, { slug, workbench: raw.workbench, tier: raw.tier, craftTimeSeconds: raw.seconds, locationSlug: null, inputs, outputs });
  }

  const missing = baseline.filter((r) => !matchedSlugs.has(r.slug)).map((r) => ({ slug: r.slug }));
  return { recipes: [...result.values()], missing };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/datamine && npx vitest run transform/recipes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite**

Run: `cd packages/datamine && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/datamine/transform/recipes.ts packages/datamine/transform/recipes.test.ts
git commit -m "feat(datamine): recipes merge module (content-signature match, keep baseline slugs)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Fix build_turret_stats enumeration + regenerate (release build)

**Files:**
- Modify: `packages/datamine/scripts/build_turret_stats.py:14-19,59`
- Regenerate: `packages/datamine/sek-out/turret_stats.json`

**Why:** the script keys output off loot-derived `items.json` (6 turret containers) → drops T1/T4/railgun. Switch to the complete `item_defs.json` registry (13). Proven 13/13 match.

- [ ] **Step 1: Repoint the enumeration source**

In `packages/datamine/scripts/build_turret_stats.py`, replace the `ITEMS` constant + its load
(lines ~14-19):
```python
ITEMS = HERE.parent / "sek-out" / "items.json"
OUT = HERE.parent / "sek-out" / "turret_stats.json"

raw = json.loads(SRC.read_text(encoding="utf-8"))["turrets"]
items = json.loads(ITEMS.read_text(encoding="utf-8"))
item_ids = {i["id"] for i in items} if isinstance(items, list) else set(items)
```
with (enumerate from the full ItemDatabase, not the loot-derived list):
```python
DEFS = HERE.parent / "extracted" / "json" / "item_defs.json"
OUT = HERE.parent / "sek-out" / "turret_stats.json"

raw = json.loads(SRC.read_text(encoding="utf-8"))["turrets"]
# Enumerate turret containers from the COMPLETE item registry (CheatItemDefinitions), not the
# loot-derived items.json — otherwise T1/T4/railgun (absent from loot tables) are dropped.
defs = json.loads(DEFS.read_text(encoding="utf-8"))
item_ids = set(defs.keys())
```

- [ ] **Step 2: Regenerate weapon/turret inputs from the release build**

(weapon_stats may already match the committed copy; turret_stats will change 6 → 13.)
```bash
cd packages/datamine
python scripts/extract_turret_stats.py
python scripts/build_turret_stats.py
```
Expected final line: `wrote ... turret_stats.json — turrets=13`.

- [ ] **Step 3: Verify all 13 containers present**

```bash
cd packages/datamine && python -c "import json;d=json.load(open('sek-out/turret_stats.json',encoding='utf-8'))['turrets'];print(len(d));[print(' ',k) for k in sorted(d)]"
```
Expected: 13 containers incl. `...T1Container`, `...T4...`, `...RailGunContainer`.

- [ ] **Step 4: Commit (script fix + regenerated release data)**

```bash
cd /d/Documents/SandLabs
git add packages/datamine/scripts/build_turret_stats.py packages/datamine/sek-out/turret_stats.json
git commit -m "fix(datamine): build_turret_stats enumerates item_defs (13) not loot items.json (6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: extract_crafting_recipes.py + regenerate recipes (release build)

**Files:**
- Create: `packages/datamine/scripts/extract_crafting_recipes.py`
- Regenerate: `packages/datamine/sek-out/recipes.json`

**Why:** no vendored extractor produces fresh recipes. The crafting recipes live in
`craftingrecipes_assets_all.bundle` as plain typetree MonoBehaviours; this writes `sek-out/recipes.json`
directly in the `[{workbench,tier,inputs,outputs,seconds}]` shape `recipes.ts` consumes — bypassing
the heavier `build_site_data` chain.

- [ ] **Step 1: Write the extractor**

Create `packages/datamine/scripts/extract_crafting_recipes.py`:
```python
"""Extract workbench crafting recipes -> sek-out/recipes.json.

Source: craftingrecipes_assets_all.bundle — plain typetree MonoBehaviours named
Recipes_<Workbench>_Workbench_T<n>, each with a `recipes` list of
{inputIngredients:[{itemId,amount}], outputIngredients:[{itemId,amount}], craftingTimeSeconds}.
(Not Odin-serialized.) Output rows: {workbench, tier, inputs:[{item,amount}], outputs, seconds},
matching what transform/recipes.ts expects. TestRecipesBundle is skipped.

Run from packages/datamine/:  python scripts/extract_crafting_recipes.py
"""
import json, os, re
import UnityPy

BUNDLE = "gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64/craftingrecipes_assets_all.bundle"
OUT = "sek-out/recipes.json"

env = UnityPy.load(BUNDLE)
out = []
for o in env.objects:
    if o.type.name != "MonoBehaviour":
        continue
    try:
        tt = o.read_typetree()
    except Exception:
        continue
    name = tt.get("m_Name", "") or ""
    if name == "TestRecipesBundle" or "recipes" not in tt:
        continue
    m = re.match(r"Recipes_(\w+?)_Workbench_T(\d)", name)
    workbench = m.group(1) if m else name
    tier = int(m.group(2)) if m else None
    for r in tt["recipes"]:
        out.append({
            "workbench": workbench,
            "tier": tier,
            "inputs": [{"item": i["itemId"], "amount": i["amount"]} for i in r["inputIngredients"]],
            "outputs": [{"item": i["itemId"], "amount": i["amount"]} for i in r["outputIngredients"]],
            "seconds": r["craftingTimeSeconds"],
        })

os.makedirs("sek-out", exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"wrote {OUT}: {len(out)} crafting recipes")
if not out:
    print("NO recipes found — check bundle name / MonoBehaviour layout for this build.")
```

- [ ] **Step 2: Run it (regenerate from the release build)**

```bash
cd packages/datamine && python scripts/extract_crafting_recipes.py
```
Expected: `wrote sek-out/recipes.json: N crafting recipes` (N ≈ 20-40). Confirm a sample:
```bash
cd packages/datamine && python -c "import json;d=json.load(open('sek-out/recipes.json',encoding='utf-8'));print(len(d));print(json.dumps(d[0],ensure_ascii=False))"
```
Expected: rows with `workbench`/`tier`/`inputs`/`outputs`/`seconds`.

- [ ] **Step 3: Commit (extractor + regenerated release data)**

```bash
cd /d/Documents/SandLabs
git add packages/datamine/scripts/extract_crafting_recipes.py packages/datamine/sek-out/recipes.json
git commit -m "feat(datamine): extract_crafting_recipes.py -> sek-out/recipes.json (release build)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire both modules into run.ts + verified transform run

**Files:**
- Modify: `packages/datamine/transform/emit.ts`
- Modify: `packages/datamine/transform/run.ts`

**Prerequisite:** Tasks 1–4 done (modules exist; `sek-out/turret_stats.json`=13, `sek-out/recipes.json`
regenerated from the release build). The merge now runs against fresh inputs.

- [ ] **Step 1: Add the missing-recipes report writer**

In `packages/datamine/transform/emit.ts`, after `writeImagesReport`, add:
```ts
export function writeRecipesMissingReport(missing: unknown): void {
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(resolve(REPORTS, "missing-recipes.json"), JSON.stringify(missing, null, 2) + "\n");
}
```

- [ ] **Step 2: Wire the modules in run.ts**

In `packages/datamine/transform/run.ts`, add imports near the trampler import:
```ts
import { loadWeaponStats, loadTurretStats, mergeCombatStats } from "./combat-stats";
import { loadRecipes, mergeRecipes } from "./recipes";
```
Add `writeRecipesMissingReport` to the existing `emit` import line.

After the trampler block (which produces `withTrampler`), insert:
```ts
// --- combat stats: refresh item ItemStats from weapon/turret datasets ---
const withCombat = mergeCombatStats(withTrampler, loadWeaponStats(), loadTurretStats(), rec.bySekId);
const combatRefreshed = withCombat.filter((e, i) => e.itemStats !== withTrampler[i].itemStats).length;
console.log(`combat stats: refreshed ${combatRefreshed} items`);

// --- recipes: merge crafting recipes over baseline (keep baseline-only + report) ---
const recipeMerge = mergeRecipes(baseline.recipes, loadRecipes(), rec.bySekId);
console.log(`recipes: ${recipeMerge.recipes.length} total (${recipeMerge.missing.length} baseline-only kept)`);
```
Then update every downstream reference from `withTrampler` to `withCombat`:
- `const knownSlugs = new Set(withCombat.map((e) => e.slug));`
- `const diff = diffEntities(baseline.entities, withCombat);`
- `validateEntities(withCombat);`
- `classifyImages(withCombat, ...)`
After editing, `grep -n "withTrampler" transform/run.ts` should show it ONLY in the trampler block + the `combatRefreshed` comparison line — no later reads.

Replace the `writeArtifact(...)` call to use the merged recipes + add the report:
```ts
writeArtifact(withCombat, recipeMerge.recipes, links);
writeMissingReport(missing);
writeRecipesMissingReport(recipeMerge.missing);
writeImagesReport(images);
```

- [ ] **Step 3: Run the transform against fresh inputs**

```bash
cd /d/Documents/SandLabs && git checkout HEAD -- packages/data/generated/
cd packages/datamine && npm run transform
```
Expected console: `combat stats: refreshed N items` (N large, ~130), `recipes: M total (K baseline-only kept)`,
`entities ... -0 removed`. If `-removed > 0`, STOP and report (do not pass `--allow-slug-changes`).

- [ ] **Step 4: Verify it's a refresh, not a regression**

```bash
cd /d/Documents/SandLabs && PYTHONIOENCODING=utf-8 python -c "
import json,subprocess
B={e['slug']:e for e in json.loads(subprocess.run(['git','show','HEAD:packages/data/generated/entities.json'],capture_output=True,text=True).stdout)}
A={e['slug']:e for e in json.load(open('packages/data/generated/entities.json',encoding='utf-8'))}
# turret kits now carry itemStats?
kits=[s for s in A if 'packed' in s and 'turret' in s]
print('turret-kit entities:',len(kits),'| with fireRate now:',sum(1 for s in kits if (A[s].get('itemStats') or {}).get('fireRate') is not None))
# storageStack must be unchanged (NOT mapped from stack)
chg=[s for s in A if A[s].get('itemStats') and B.get(s,{}).get('itemStats') and A[s]['itemStats'].get('storageStack')!=B[s]['itemStats'].get('storageStack')]
print('items whose storageStack changed (must be 0):',len(chg))
print('recipes:',len(json.load(open('packages/data/generated/recipes.json',encoding='utf-8'))))
"
```
Expected: turret kits with `fireRate` ≈ 13; storageStack changed = **0**; recipes ≥ 39.

- [ ] **Step 5: Tests + wiki build green**

```bash
cd packages/datamine && npm test
cd /d/Documents/SandLabs/apps/wiki && npm run build
```
Expected: all tests pass; build succeeds.

- [ ] **Step 6: Commit (code + regenerated artifact + reports)**

```bash
cd /d/Documents/SandLabs
git add packages/datamine/transform/emit.ts packages/datamine/transform/run.ts packages/data/generated/ packages/datamine/reports/
git commit -m "feat(datamine): wire combat-stats + recipes into the transform (release-build run)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §1 architecture (two merge modules, reuse reconcile) → Tasks 1, 2, 5. ✓
- Component 1 `combat-stats.ts` (mapping table, multi-map merge, storageStack omitted) → Task 1. ✓
- Component 2 `recipes.ts` (Recipe model, reconcile lines, merge-preserve + report) → Task 2. ✓
- §4 turret enumeration fix → Task 3. ✓
- §4 `craftingrecipes` extractor / recipes regeneration → Task 4 (emits `sek-out/recipes.json` directly, simpler than the build_site_data chain noted in the spec). ✓
- §4 release-build regeneration + verified run + never-commit-stale → Tasks 3, 4, 5 (regenerate before the run; commit artifact only in Task 5 after fresh inputs). ✓
- run.ts wiring + missing-recipes report → Task 5. ✓

**Placeholder scan:** none — every step has concrete code/commands. (Weapon-stats regeneration is intentionally not a task: the release extraction was already verified byte-identical to the committed copy; if a future build differs, re-run `extract_weapon_stats`+`build_weapon_stats`, which `loadWeaponStats` consumes unchanged.)

**Type consistency:** `WeaponStatsFile`/`AmmoStat`/`ArmorStat`/`TurretStat`/`mergeCombatStats`
(combat-stats.ts), `RawRecipe`/`mergeRecipes`/`RecipesResult` (recipes.ts), `ReconcileHit`
(reconcile.ts), `canonicalSekId` (variants.ts), `Recipe`/`RecipeLineRow`/`ItemStats` (types.ts),
`writeRecipesMissingReport` (emit.ts) used consistently. run.ts final-var rename
`withTrampler`→`withCombat` applied to all four downstream reads + writeArtifact.
