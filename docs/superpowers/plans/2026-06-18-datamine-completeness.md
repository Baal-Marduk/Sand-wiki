# Datamine Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the datamine enumerate items from the game's complete registry (closing the 48-item gap) and add a diagnostic-first path for trampler stats, so entity data auto-refreshes per game patch instead of needing manual edits.

**Architecture:** Two halves. **Part A (testable now)** works entirely in the TypeScript transform over committed `sek-out/*.json`: a variant-dedup helper, a localization-driven item enumerator that feeds the existing reconcile/merge pipeline (39 missing items recover by name-match immediately), and a dormant trampler-stats merge module guarded on a not-yet-extracted file. **Part B (gated on the owner's game files)** adds Python diagnostic extractors (`extract_item_defs.py`, `extract_compartment_stats.py`) and fixes `build_site_data.py`'s enumeration — the owner runs these against real bundles.

**Tech Stack:** TypeScript 5 + tsx + Vitest 4 (transform), Python 3.13 + UnityPy (extractors), npm workspaces. Spec: `docs/superpowers/specs/2026-06-18-datamine-completeness-design.md`.

**Branch:** `feat/monorepo-static-foundation` (already checked out).

**Key facts validated against committed data:**
- `sek-out/items.json` = 99 items (enumerated from loot ∪ recipes). `sek-out/localization.json` `items` = 249 ids — the near-complete registry.
- Feeding localization ids into reconcile recovers **39/48** missing items by exact name-match; ~6 more via slug-map overrides; binoculars/flashlight + ~1 need the ItemDatabase extractor.
- Trampler-part baseline entities (120, `kind: "trampler-part"`) have **no epb id** — id is a CUID, slug is the wiki slug. So trampler stats reconcile **by name** (compartment localized name → baseline slug), like items.
- `parts_v2.json` (CompartmentsDatabase) is geometry-only — no health/weight/energy. Those stats need the new prefab extractor.

**Commit message footer (every commit):**
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

**Test command (transform):** `cd packages/datamine && npm test` (the `npm run test --workspace=packages/datamine` form from repo root is broken on this Windows setup — vitest loads with an undefined config; run from inside the package dir instead).
**Transform run:** `cd packages/datamine && npm run transform` (or `npx tsx transform/run.ts`).

**Baseline-accumulation hazard:** the transform reads `packages/data/generated/*.json` as its baseline, so committing a run's output makes its noise the next baseline. Before any verification re-run, restore generated/ from the pre-change commit:
`git checkout HEAD -- packages/data/generated/` (or the specific pre-run SHA).

---

## File Structure

**Part A — TypeScript transform (`packages/datamine/transform/`):**
- Create `variants.ts` — `canonicalSekId(id)`: collapse `_Melee`/`_Ranged` usage-mode suffixes; keep element/ballistic suffixes. One responsibility: id canonicalization.
- Create `variants.test.ts` — dedup rules.
- Create `enumerate.ts` — `enumerateItems(loc, sekItems)`: union SEK items.json with localization stubs into one deduped `SekItem[]` for reconcile.
- Create `enumerate.test.ts`.
- Create `trampler.ts` — `loadCompartmentStats`, `tramplerPatch`, `mergeTrampler` (name-match parts, merge-over-baseline).
- Create `trampler.test.ts`.
- Modify `i18n.ts` — canonicalize loc id before slug lookup (consistency with canonical reconcile keys).
- Modify `run.ts` — feed reconcile from `enumerateItems(...)`; add trampler step behind file-absent guard.
- Modify `overrides/slug-map.json` — add name-drift overrides for the resolvable residue.
- Create `overrides/part-slug-map.json` — compartment-name → baseline-slug drift overrides (starts `{}`).

**Part B — Python extractors (`packages/datamine/scripts/`), owner-run:**
- Create `extract_item_defs.py` — dump full ItemDatabase → `extracted/json/item_defs.json`.
- Create `extract_compartment_stats.py` — probe `walker_*_epb` prefab MonoBehaviours → `extracted/json/compartment_stats_probe.json`.
- Modify `build_site_data.py` — enumerate items from registry; fix nested-localization read.
- Modify `UPDATE_PIPELINE.md` — document both new steps.

---

## PART A — Testable now (TypeScript transform)

### Task 1: Variant-dedup helper

**Files:**
- Create: `packages/datamine/transform/variants.ts`
- Test: `packages/datamine/transform/variants.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/datamine/transform/variants.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { canonicalSekId } from "./variants";

describe("canonicalSekId", () => {
  it("collapses _Melee / _Ranged usage-mode suffixes to one canonical id", () => {
    expect(canonicalSekId("item_smokeGrenade_Melee")).toBe("item_smokeGrenade");
    expect(canonicalSekId("item_smokeGrenade_Ranged")).toBe("item_smokeGrenade");
    expect(canonicalSekId("item_Tool_Flaregun_Melee")).toBe("item_Tool_Flaregun");
    expect(canonicalSekId("item_Tool_Flaregun_Ranged")).toBe("item_Tool_Flaregun");
  });

  it("keeps element / ballistic variants distinct (NOT collapsed)", () => {
    for (const id of [
      "item_pistolAmmo_Fire", "item_pistolAmmo_Toxic", "item_pistolAmmo_Armor",
      "item_pistolAmmo_highVelocity", "item_turretAmmo_EMP", "item_shotgunAmmo_slug",
      "item_shotgunAmmo_explosive", "item_sniperRifleAmmo_highPenetration",
    ]) {
      expect(canonicalSekId(id)).toBe(id);
    }
  });

  it("leaves plain ids untouched", () => {
    expect(canonicalSekId("game_keyIslandDoorRed")).toBe("game_keyIslandDoorRed");
    expect(canonicalSekId("item_multiTool")).toBe("item_multiTool");
  });

  it("is case-insensitive on the suffix and strips only a trailing match", () => {
    expect(canonicalSekId("item_foo_melee")).toBe("item_foo");
    expect(canonicalSekId("item_meleeWeapon")).toBe("item_meleeWeapon"); // not a suffix
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/datamine`
Expected: FAIL — `Cannot find module './variants'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/datamine/transform/variants.ts`:
```ts
// Item-id canonicalization for the enumerate step.
//
// SAND splits some items into _Melee / _Ranged usage-mode entries in the localization
// table (54 such ids) that are the SAME inventory item (e.g. the flare gun, smoke grenade
// can be thrown OR fired). Collapse them to one canonical id so the wiki gets one page.
//
// Element / ballistic suffixes (_Fire, _Toxic, _Armor, _EMP, _slug, _highVelocity, …) are
// DISTINCT wiki items (the missing report wants pistol-ammo-fire etc. separately) — never
// collapse those. We therefore strip ONLY the two usage-mode suffixes, nothing else.
const USAGE_MODE_SUFFIX = /_(Melee|Ranged)$/i;

/** Canonical item id: drop a trailing _Melee/_Ranged usage-mode suffix; otherwise unchanged. */
export function canonicalSekId(id: string): string {
  return id.replace(USAGE_MODE_SUFFIX, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/datamine`
Expected: PASS (all 4 `canonicalSekId` tests green; existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/transform/variants.ts packages/datamine/transform/variants.test.ts
git commit -m "feat(datamine): canonicalSekId collapses _Melee/_Ranged usage variants

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Localization-driven item enumerator

**Files:**
- Create: `packages/datamine/transform/enumerate.ts`
- Test: `packages/datamine/transform/enumerate.test.ts`

**Why:** `reconcile` is currently fed only `sek-out/items.json` (99 ids, back-derived from
loot∪recipes). This enumerator unions those with the localization registry (249 ids) as
synthesized `SekItem` stubs (icon/rarity null → merge keeps baseline; desc/short from loc).
Real SEK items win over loc stubs by canonical id. Output is a drop-in `SekItem[]` for the
existing reconcile/i18n/merge pipeline.

- [ ] **Step 1: Write the failing test**

Create `packages/datamine/transform/enumerate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { enumerateItems } from "./enumerate";
import type { SekItem, Localization } from "./sek";

const sek = (o: Partial<SekItem>): SekItem => ({
  id: "x", name: "X", icon: null, rarity: null, type: null,
  pawnValue: null, short: null, desc: null, ...o,
});

const loc = (items: Record<string, { name: string; short?: string | null; desc?: string | null }>): Localization => ({
  locales: ["en"],
  items: Object.fromEntries(
    Object.entries(items).map(([id, en]) => [id, { locales: { en: { name: en.name, short: en.short ?? null, desc: en.desc ?? null } } }]),
  ),
  compartments: {},
  factions: [],
});

describe("enumerateItems", () => {
  it("adds localization-only ids as stubs (null icon/rarity, desc from loc)", () => {
    const out = enumerateItems(loc({ game_keyIslandDoorRed: { name: "Red Key", desc: "Opens red doors." } }), []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "game_keyIslandDoorRed", name: "Red Key", icon: null, rarity: null, desc: "Opens red doors." });
  });

  it("real SEK items win over loc stubs of the same canonical id", () => {
    const out = enumerateItems(
      loc({ item_pistolAmmo: { name: "Loc Name", desc: "loc desc" } }),
      [sek({ id: "item_pistolAmmo", name: "Sek Name", icon: "/icons/a.png", rarity: "COMMON" })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "item_pistolAmmo", name: "Sek Name", icon: "/icons/a.png", rarity: "COMMON" });
  });

  it("collapses _Melee/_Ranged loc variants to one canonical id", () => {
    const out = enumerateItems(loc({
      item_smokeGrenade_Melee: { name: "Smoke Grenade" },
      item_smokeGrenade_Ranged: { name: "Smoke Grenade" },
    }), []);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("item_smokeGrenade");
  });

  it("keeps element variants as separate items", () => {
    const out = enumerateItems(loc({
      item_pistolAmmo_Fire: { name: "Incendiary" },
      item_pistolAmmo_Toxic: { name: "Toxic" },
    }), []);
    expect(out.map((i) => i.id).sort()).toEqual(["item_pistolAmmo_Fire", "item_pistolAmmo_Toxic"]);
  });

  it("skips loc entries with no EN name", () => {
    const l = loc({}); l.items["item_blank"] = { locales: {} } as never;
    expect(enumerateItems(l, [])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/datamine`
Expected: FAIL — `Cannot find module './enumerate'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/datamine/transform/enumerate.ts`:
```ts
import type { SekItem, Localization } from "./sek";
import { canonicalSekId } from "./variants";

/** Enumerate the COMPLETE item set for reconcile: SEK items.json (99, back-derived from
 *  loot∪recipes) UNIONED with the localization registry (~249) as synthesized stubs.
 *
 *  - dedup by canonical id (collapses _Melee/_Ranged);
 *  - real SEK items win over loc stubs (they carry icon/rarity/type/pawnValue);
 *  - loc-only items become stubs with null icon/rarity (so the merge keeps the baseline's
 *    icon/rarity) and desc/short from EN localization;
 *  - the synthesized id is the CANONICAL id (so override slug-map keys + i18n stay aligned). */
export function enumerateItems(loc: Localization, sekItems: SekItem[]): SekItem[] {
  const byCanonical = new Map<string, SekItem>();
  const add = (it: SekItem) => {
    const id = canonicalSekId(it.id);
    if (!byCanonical.has(id)) byCanonical.set(id, { ...it, id });
  };
  for (const it of sekItems) add(it); // real SEK items first (richer fields)
  for (const [id, v] of Object.entries(loc.items)) {
    const en = v.locales?.en;
    if (!en?.name) continue; // skip nameless terms
    add({ id, name: en.name, icon: null, rarity: null, type: null,
          pawnValue: null, short: en.short ?? null, desc: en.desc ?? null });
  }
  return [...byCanonical.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/datamine`
Expected: PASS (all 5 `enumerateItems` tests green).

- [ ] **Step 5: Make `i18n.ts` consistent with canonical ids**

The reconcile map is now keyed by canonical id, but `buildItemI18n` looks up `slugBySekId` by
the raw loc id. Canonicalize the lookup so future non-EN locales attach correctly.

In `packages/datamine/transform/i18n.ts`, change the import block and the lookup line:
```ts
import type { LocalizedText } from "@sandlabs/data";
import type { Localization } from "./sek";
import { canonicalSekId } from "./variants";
```
and inside the loop, replace:
```ts
    const slug = slugBySekId.get(sekId);
```
with:
```ts
    const slug = slugBySekId.get(canonicalSekId(sekId));
```

- [ ] **Step 6: Run tests again**

Run: `npm run test --workspace=packages/datamine`
Expected: PASS (no regressions; i18n tests still green).

- [ ] **Step 7: Commit**

```bash
git add packages/datamine/transform/enumerate.ts packages/datamine/transform/enumerate.test.ts packages/datamine/transform/i18n.ts
git commit -m "feat(datamine): enumerate items from localization registry (union SEK)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire enumeration into run.ts + add residue overrides

**Files:**
- Modify: `packages/datamine/transform/run.ts:36`
- Modify: `packages/datamine/transform/overrides/slug-map.json`

- [ ] **Step 1: Feed reconcile from the enumerated set**

In `packages/datamine/transform/run.ts`, add the import near the other transform imports
(after the `mergeItems` import line):
```ts
import { enumerateItems } from "./enumerate";
```

Replace the items section header + reconcile/merge wiring. Current (lines ~35-41):
```ts
// --- items: reconcile -> i18n -> merge ---
const rec = reconcile(sekItems.map((i) => ({ id: i.id, name: i.name })), baseline.entities, overrides);
const i18n = buildItemI18n(loc, new Map([...rec.bySekId].map(([id, hit]) => [id, hit.slug])));
const merged = mergeItems(baseline.entities, sekItems, rec.bySekId, i18n);
```
becomes:
```ts
// --- items: enumerate (SEK items ∪ localization registry) -> reconcile -> i18n -> merge ---
const allItems = enumerateItems(loc, sekItems).filter((i) => !exclusions.has(i.id));
const rec = reconcile(allItems.map((i) => ({ id: i.id, name: i.name })), baseline.entities, overrides);
const i18n = buildItemI18n(loc, new Map([...rec.bySekId].map(([id, hit]) => [id, hit.slug])));
const merged = mergeItems(baseline.entities, allItems, rec.bySekId, i18n);
```

(Note: `sekItems` is already filtered by exclusions at load; re-filtering `allItems` drops any
excluded id that arrives via localization too.)

- [ ] **Step 2: Restore the baseline, then run the transform**

```bash
git checkout HEAD -- packages/data/generated/
npm run transform --workspace=packages/datamine
```
Expected console: `missing-from-datamine: 9 baseline items not covered` (down from 48), and
`+0 added, -0 removed` apart from any genuinely-new loc items (review the `added:` line — should
be empty or only legitimately-new game items, NOT duplicates of existing slugs).

- [ ] **Step 3: Inspect the missing report and add name-drift overrides**

Run: `cat packages/datamine/reports/missing-from-datamine.json`
Expected residue (9): `anti-reactor-gun-ammo`, `binoculars`, `c4-dynamite`, `flashlight`,
`map`, `med-kit`, `multitool`, `shotgun-turret-ammo-interior-explosion`, `wok-bomb`.

For each residue item, find the localization id whose EN name is close but not exact, and add a
`sekId -> wikiSlug` entry to `overrides/slug-map.json`. Use this helper to surface candidates:
```bash
cd packages/datamine && python -c "
import json
loc=json.load(open('sek-out/localization.json',encoding='utf-8'))['items']
targets=['Anti-Reactor Cell','Time Bomb','Multitool','MedKit','Map','E-Wok Bomb','Interior Explosion 70 mm Shell']
for iid,v in loc.items():
    n=v.get('locales',{}).get('en',{}).get('name','')
    for t in targets:
        if t.split()[0].lower() in n.lower(): print(repr(t),'<-',iid,'=',repr(n))
"
```
Add the confident matches (e.g. `"item_multiTool": "multitool"`, `"item_c4": "c4-dynamite"`)
to `overrides/slug-map.json`. Leave `binoculars`/`flashlight` (truly absent from localization)
for the ItemDatabase extractor (Task 6). Document each added override with a trailing comment in
the spec/memory, not in the JSON.

- [ ] **Step 4: Re-run and confirm the residue shrinks**

```bash
git checkout HEAD -- packages/data/generated/
npm run transform --workspace=packages/datamine
```
Expected: `missing-from-datamine` now ~2-3 (binoculars, flashlight, + any not yet in any source).
`-0 removed`. The round-trip + build must still pass:
```bash
npm run test --workspace=packages/datamine
npm run build --workspace=apps/wiki
```
Expected: tests PASS; build succeeds.

- [ ] **Step 5: Commit (artifact + overrides together)**

```bash
git add packages/datamine/transform/run.ts packages/datamine/transform/overrides/slug-map.json packages/data/generated/ packages/datamine/reports/missing-from-datamine.json
git commit -m "feat(datamine): wire localization enumeration — missing items 48 -> ~2

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Trampler-stats merge module

**Files:**
- Create: `packages/datamine/transform/trampler.ts`
- Test: `packages/datamine/transform/trampler.test.ts`
- Create: `packages/datamine/transform/overrides/part-slug-map.json`

**Why:** When the owner runs `extract_compartment_stats.py` (Task 7), it produces
`compartment_stats.json` keyed by epb id (e.g. `compArmor_Framed_Metal_1x1`). Trampler-part
baseline entities have no epb id, so we match by compartment NAME (from `loc.compartments`)
to the baseline entity name, then refresh only datamine-provided stat fields (merge-over-baseline,
preserving the sandhelp-sourced research fields).

- [ ] **Step 1: Create the empty part override map**

Create `packages/datamine/transform/overrides/part-slug-map.json`:
```json
{}
```
(Compartment-name → baseline-slug drift overrides; populated during the owner's diagnostic loop.)

- [ ] **Step 2: Write the failing test**

Create `packages/datamine/transform/trampler.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { tramplerPatch, mergeTrampler, type CompartmentStat } from "./trampler";
import type { Entity, TramplerStats } from "@sandlabs/data";

const baseStats = (o: Partial<TramplerStats> = {}): TramplerStats => ({
  dimensions: "1x1", health: 1000, weight: 500, weightCapacity: null, weightCompensation: null,
  energyConsumption: 100, energyCapacity: null, ratedPower: null, crewSlots: null, itemSlots: null,
  researchNode: "II(c)", researchName: "Cargo Bay", researchTier: 4, ...o,
});

const part = (slug: string, name: string, stats: TramplerStats): Entity => ({
  id: slug, slug, kind: "trampler-part", name, description: null, category: "trampler",
  rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: stats, techNodeStats: null,
});

const stat = (o: Partial<CompartmentStat>): CompartmentStat => ({
  epbId: "compX", name: "X", health: null, weight: null, weightCapacity: null,
  weightCompensation: null, energyConsumption: null, energyCapacity: null, ratedPower: null,
  crewSlots: null, itemSlots: null, ...o,
});

describe("tramplerPatch", () => {
  it("emits only datamine-provided numeric fields, never research fields", () => {
    const p = tramplerPatch(stat({ health: 3500, weight: 1500, ratedPower: 50 }));
    expect(p).toEqual({ health: 3500, weight: 1500, ratedPower: 50 });
  });
  it("omits null fields so the merge keeps the baseline", () => {
    expect(tramplerPatch(stat({}))).toEqual({});
  });
});

describe("mergeTrampler", () => {
  it("refreshes matched part stats by name, preserving research + unprovided fields", () => {
    const baseline = [part("cargo-bay", "S&H Cargo Bay", baseStats({ health: 1000 }))];
    const out = mergeTrampler(baseline, [stat({ epbId: "compCargo", name: "S&H Cargo Bay", health: 3500, ratedPower: 50 })], {});
    const ts = out.find((e) => e.slug === "cargo-bay")!.tramplerStats!;
    expect(ts.health).toBe(3500);     // refreshed
    expect(ts.ratedPower).toBe(50);   // refreshed
    expect(ts.weight).toBe(500);      // baseline kept (not provided)
    expect(ts.researchName).toBe("Cargo Bay"); // research never touched
  });

  it("matches case-insensitively and via the part override map", () => {
    const baseline = [part("cargo-bay", "S&H Cargo Bay", baseStats())];
    const out = mergeTrampler(baseline, [stat({ name: "s&h cargo bay", health: 4000 })], {});
    expect(out[0].tramplerStats!.health).toBe(4000);

    const out2 = mergeTrampler(baseline, [stat({ name: "Renamed In Game", health: 7000 })], { "Renamed In Game": "cargo-bay" });
    expect(out2[0].tramplerStats!.health).toBe(7000);
  });

  it("leaves unmatched compartments and non-part entities untouched", () => {
    const item: Entity = { ...part("x", "X", baseStats()), kind: "item", tramplerStats: null };
    const baseline = [item, part("cargo-bay", "S&H Cargo Bay", baseStats())];
    const out = mergeTrampler(baseline, [stat({ name: "Unknown Part", health: 9 })], {});
    expect(out).toHaveLength(2);
    expect(out[0].tramplerStats).toBeNull(); // item untouched
    expect(out[1].tramplerStats!.health).toBe(1000); // unchanged baseline
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=packages/datamine`
Expected: FAIL — `Cannot find module './trampler'`.

- [ ] **Step 4: Write the implementation**

Create `packages/datamine/transform/trampler.ts`:
```ts
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Entity, TramplerStats } from "@sandlabs/data";

const SEK = resolve(import.meta.dirname, "../sek-out");

/** One datamined walker compartment's gameplay stats. `epbId` is the prefab id
 *  (e.g. compArmor_Framed_Metal_1x1); `name` is the localized compartment name used to
 *  match the baseline trampler-part entity. Stat fields are null when the prefab lacked them. */
export interface CompartmentStat {
  epbId: string;
  name: string;
  health: number | null;
  weight: number | null;
  weightCapacity: number | null;
  weightCompensation: number | null;
  energyConsumption: number | null;
  energyCapacity: number | null;
  ratedPower: number | null;
  crewSlots: number | null;
  itemSlots: number | null;
}

/** Load compartment_stats.json if it exists (produced by extract_compartment_stats.py +
 *  the final mapping). Returns [] when absent so the transform can skip the step. */
export function loadCompartmentStats(dir = SEK): CompartmentStat[] {
  const p = resolve(dir, "compartment_stats.json");
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf-8")) as CompartmentStat[];
}

/** Datamine-owned TramplerStats fields. Research fields stay baseline (tech tree, out of
 *  scope this pass). dimensions stays baseline (geometry derived elsewhere). */
type TramplerPatch = Partial<Pick<TramplerStats,
  "health" | "weight" | "weightCapacity" | "weightCompensation" |
  "energyConsumption" | "energyCapacity" | "ratedPower" | "crewSlots" | "itemSlots">>;

const STAT_FIELDS = [
  "health", "weight", "weightCapacity", "weightCompensation",
  "energyConsumption", "energyCapacity", "ratedPower", "crewSlots", "itemSlots",
] as const;

/** Build a patch with only the numeric fields the datamine actually provides. */
export function tramplerPatch(s: CompartmentStat): TramplerPatch {
  const p: TramplerPatch = {};
  for (const f of STAT_FIELDS) {
    const v = s[f];
    if (v !== null && v !== undefined) p[f] = v;
  }
  return p;
}

/** Merge datamined compartment stats over the baseline trampler-part entities.
 *  Match by compartment name (case-insensitive) → baseline slug, else partOverrides
 *  (compartment name → slug). Refreshes provided fields, preserves the rest (incl. research).
 *  Non-part entities and unmatched compartments pass through untouched. */
export function mergeTrampler(
  baseline: Entity[],
  stats: CompartmentStat[],
  partOverrides: Record<string, string>,
): Entity[] {
  const byName = new Map(
    baseline.filter((e) => e.kind === "trampler-part").map((e) => [e.name.toLowerCase(), e.slug]),
  );
  const patchBySlug = new Map<string, TramplerPatch>();
  for (const s of stats) {
    const slug = partOverrides[s.name] ?? byName.get(s.name.toLowerCase());
    if (!slug || patchBySlug.has(slug)) continue; // unmatched or already patched
    patchBySlug.set(slug, tramplerPatch(s));
  }
  return baseline.map((e) => {
    const patch = patchBySlug.get(e.slug);
    if (!patch || !e.tramplerStats) return e;
    return { ...e, tramplerStats: { ...e.tramplerStats, ...patch } };
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=packages/datamine`
Expected: PASS (all `tramplerPatch` + `mergeTrampler` tests green).

- [ ] **Step 6: Commit**

```bash
git add packages/datamine/transform/trampler.ts packages/datamine/transform/trampler.test.ts packages/datamine/transform/overrides/part-slug-map.json
git commit -m "feat(datamine): trampler-stats merge module (name-match, merge-over-baseline)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire trampler merge into run.ts (dormant until extracted)

**Files:**
- Modify: `packages/datamine/transform/run.ts`

- [ ] **Step 1: Add imports + the guarded merge step**

In `packages/datamine/transform/run.ts`, add to the import block:
```ts
import { loadCompartmentStats, mergeTrampler } from "./trampler";
```
Add the part override load next to the other `readJson` override loads:
```ts
const partOverrides = readJson("overrides/part-slug-map.json") as Record<string, string>;
```

After the items merge produces `entities` (the `const entities = applyIconOverrides(...)` line)
and BEFORE the loot section, insert:
```ts
// --- trampler stats: refresh part stats from compartment_stats.json when present ---
const compartmentStats = loadCompartmentStats();
const withTrampler = compartmentStats.length
  ? mergeTrampler(entities, compartmentStats, partOverrides)
  : entities;
if (compartmentStats.length) {
  console.log(`trampler stats: refreshed from ${compartmentStats.length} compartments`);
} else {
  console.log("trampler stats: source absent (compartment_stats.json) — baseline preserved");
}
```

Then update every later reference from `entities` to `withTrampler`. Specifically:
- the `knownSlugs` set: `const knownSlugs = new Set(withTrampler.map((e) => e.slug));`
- the diff: `const diff = diffEntities(baseline.entities, withTrampler);`
- `validateEntities(withTrampler);`
- the images classify: `const images = classifyImages(withTrampler, ...)`
- `writeArtifact(withTrampler, baseline.recipes, links);`

- [ ] **Step 2: Run the transform (source absent path)**

```bash
git checkout HEAD -- packages/data/generated/
npm run transform --workspace=packages/datamine
```
Expected console includes: `trampler stats: source absent (compartment_stats.json) — baseline preserved`
and `-0 removed`. The artifact is byte-identical to Task 3's output (trampler step is a no-op
without the file).

- [ ] **Step 3: Verify no regression**

```bash
npm run test --workspace=packages/datamine
npm run build --workspace=apps/wiki
```
Expected: tests PASS; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/datamine/transform/run.ts packages/data/generated/
git commit -m "feat(datamine): wire trampler merge into run (guarded; no-op until extracted)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## PART B — Gated on the owner's game files (Python extractors)

> These run on a machine with a **copy** of the game files (never the live install), per
> `UPDATE_PIPELINE.md`. They cannot be unit-tested here (no committed bundles); each prints
> what it found and is verified by inspection. The agent writes them; the **owner runs them**
> and reports output so the field mappings can be frozen.

### Task 6: ItemDatabase diagnostic extractor

**Files:**
- Create: `packages/datamine/scripts/extract_item_defs.py`

- [ ] **Step 1: Write the extractor**

Create `packages/datamine/scripts/extract_item_defs.py`:
```python
"""Diagnostic extractor for the FULL item database -> extracted/json/item_defs.json.

build_site_data.py loads extracted/json/item_defs.json to enrich items (icon, rarity, type,
pawnValue) but nothing produced it — so item enumeration fell back to loot∪recipes (99 items)
and ~48 vendor/quest/world items were invisible.

This script finds the item-config asset(s) (ScriptableObjects / TextAssets carrying the item
list) in the StreamingAssets bundles, prints EVERY candidate (name + field keys) so the owner
can confirm the right source, and writes {id: {name, icon, rarity, type, pawnValue}}.

Run from packages/datamine/:  python scripts/extract_item_defs.py
Bundle names shift between builds — if nothing is found, inspect the printed candidate list and
update BUNDLE_GLOBS / the field picks below, then report findings.
"""
import json, os, glob
import UnityPy

AA = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64'
OUT = 'extracted/json/item_defs.json'
os.makedirs('extracted/json', exist_ok=True)

# Bundles most likely to hold the item config. Broaden if the asset moved.
BUNDLE_GLOBS = ['*item*', '*inventory*', '*shared*', '*database*', 'data.unity3d', '*config*']

def candidate_bundles():
    seen = set()
    for g in BUNDLE_GLOBS:
        for p in glob.glob(os.path.join(AA, g + '.bundle')) + glob.glob(os.path.join(AA, g)):
            if p not in seen and os.path.isfile(p):
                seen.add(p); yield p

# Field-name aliases — game configs vary; we probe several and report which hit.
ID_KEYS    = ['id', 'itemId', 'm_Name', 'name', 'identifier']
ICON_KEYS  = ['icon', 'iconName', 'sprite', 'iconId']
RARITY_KEYS = ['rarity', 'itemRarity', 'rarityType']
TYPE_KEYS  = ['type', 'itemType', 'category']
VALUE_KEYS = ['pawnValue', 'sellValue', 'value', 'price']

def pick(d, keys):
    for k in keys:
        if isinstance(d, dict) and d.get(k) not in (None, ''):
            return d[k]
    return None

def walk_items(obj):
    """Yield dict-like item records from a parsed MonoBehaviour/TextAsset tree."""
    if isinstance(obj, dict):
        # a list of items under some key?
        for k, v in obj.items():
            if isinstance(v, list) and v and isinstance(v[0], dict) and pick(v[0], ID_KEYS):
                yield from v
            else:
                yield from walk_items(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk_items(v)

defs = {}
found_sources = []
for bundle in candidate_bundles():
    try:
        env = UnityPy.load(bundle)
    except Exception as e:
        print(f'  skip {os.path.basename(bundle)}: {e}'); continue
    for o in env.objects:
        if o.type.name not in ('MonoBehaviour', 'TextAsset'):
            continue
        try:
            d = o.read()
        except Exception:
            continue
        name = getattr(d, 'm_Name', '') or ''
        tree = None
        if o.type.name == 'TextAsset':
            raw = d.m_Script if isinstance(d.m_Script, bytes) else str(d.m_Script).encode('utf-8', 'surrogateescape')
            try: tree = json.loads(raw.decode('utf-8-sig', 'replace'))
            except Exception: continue
        else:
            try: tree = o.read_typetree()
            except Exception: continue
        recs = list(walk_items(tree))
        if not recs:
            continue
        print(f'CANDIDATE {os.path.basename(bundle)} :: {name or o.type.name} -> {len(recs)} records; sample keys: {sorted(recs[0].keys())[:12]}')
        for r in recs:
            iid = pick(r, ID_KEYS)
            if not iid:
                continue
            defs[str(iid)] = {
                'name': pick(r, ID_KEYS[1:]) or None,
                'icon': pick(r, ICON_KEYS),
                'rarity': pick(r, RARITY_KEYS),
                'type': pick(r, TYPE_KEYS),
                'pawnValue': pick(r, VALUE_KEYS),
            }
        found_sources.append(f'{os.path.basename(bundle)}::{name}')

json.dump(defs, open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f'\nwrote {OUT}: {len(defs)} item defs from {len(found_sources)} source(s)')
print('sources:', found_sources)
if not defs:
    print('NO ITEM DEFS FOUND — broaden BUNDLE_GLOBS or inspect the CANDIDATE lines above.')
```

- [ ] **Step 2: Owner runs it; report findings**

Owner runs (on the game-file machine, from `packages/datamine/`):
`python scripts/extract_item_defs.py`
Expected: prints CANDIDATE lines and `wrote extracted/json/item_defs.json: N item defs`.
Report N + the `sample keys` lines so the field picks (ID_KEYS/ICON_KEYS/…) can be tightened if
the real keys differ. The downstream payoff: `build_site_data.py` (Task 8) will enumerate from
this file, surfacing binoculars/flashlight + authoritative rarity/pawnValue.

- [ ] **Step 3: Commit the script (no extracted data — it's gitignored)**

```bash
git add packages/datamine/scripts/extract_item_defs.py
git commit -m "feat(datamine): extract_item_defs.py — full ItemDatabase diagnostic extractor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Compartment-stats diagnostic extractor

**Files:**
- Create: `packages/datamine/scripts/extract_compartment_stats.py`

- [ ] **Step 1: Write the diagnostic extractor**

Create `packages/datamine/scripts/extract_compartment_stats.py`:
```python
"""Diagnostic probe for walker-compartment gameplay stats (health/weight/energy/...).

CompartmentsDatabase.json is geometry-only (cells/sockets) — it has NO gameplay stats. The
wiki's 120 trampler-part entities carry those stats from sandhelp.io. To datamine them we must
read the stat-bearing MonoBehaviour on each walker_*_epb prefab.

This is DIAGNOSTIC-FIRST: it does not assume the component/field names. It loads the walker
prefab bundle, finds prefabs whose name matches walker_*_epb, and for each prints the
MonoBehaviour component names + their numeric fields. Output -> extracted/json/compartment_stats_probe.json
so the owner can report which component holds health/weight/energy/ratedPower/crewSlots/itemSlots.
The final field mapping is frozen in trampler.ts (CompartmentStat) only after this report.

Run from packages/datamine/:  python scripts/extract_compartment_stats.py
"""
import json, os, re, glob
import UnityPy

AA = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64'
OUT = 'extracted/json/compartment_stats_probe.json'
os.makedirs('extracted/json', exist_ok=True)

EPB = re.compile(r'^walker_.+_epb$')
# Bundles likely to hold walker part prefabs. Broaden if empty.
BUNDLE_GLOBS = ['*walker*', '*compartment*', '*part*', '*epb*']

def candidate_bundles():
    seen = set()
    for g in BUNDLE_GLOBS:
        for p in glob.glob(os.path.join(AA, g + '.bundle')) + glob.glob(os.path.join(AA, g)):
            if p not in seen and os.path.isfile(p):
                seen.add(p); yield p

def numeric_fields(tree, prefix=''):
    """Flatten numeric leaves of a typetree dict (one level of nesting kept via dotted keys)."""
    out = {}
    if not isinstance(tree, dict):
        return out
    for k, v in tree.items():
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out[prefix + k] = v
        elif isinstance(v, dict):
            out.update(numeric_fields(v, prefix + k + '.'))
    return out

probe = {}
for bundle in candidate_bundles():
    try:
        env = UnityPy.load(bundle)
    except Exception as e:
        print(f'  skip {os.path.basename(bundle)}: {e}'); continue
    for o in env.objects:
        if o.type.name != 'GameObject':
            continue
        try:
            go = o.read()
        except Exception:
            continue
        name = getattr(go, 'm_Name', '') or ''
        if not EPB.match(name):
            continue
        comps = {}
        for c in getattr(go, 'm_Components', []):
            try:
                comp = c.read()
            except Exception:
                continue
            if comp.type.name != 'MonoBehaviour':
                continue
            try:
                tt = comp.read_typetree()
            except Exception:
                continue
            nums = numeric_fields(tt)
            if nums:
                comps[getattr(comp, 'm_Name', '') or 'MonoBehaviour'] = nums
        if comps:
            probe[name] = comps

json.dump(probe, open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f'wrote {OUT}: {len(probe)} compartment prefabs with numeric MonoBehaviour fields')
if probe:
    sample = next(iter(probe))
    print(f'sample {sample}:')
    print(json.dumps(probe[sample], indent=1)[:1200])
else:
    print('NO walker_*_epb prefabs with numeric fields found — broaden BUNDLE_GLOBS or inspect bundle names.')
```

- [ ] **Step 2: Owner runs it; report the probe**

Owner runs: `python scripts/extract_compartment_stats.py`
Expected: `wrote extracted/json/compartment_stats_probe.json: N compartment prefabs` + a sample
dump. Report the sample so we can identify which component/field maps to each `CompartmentStat`
key (health/weight/weightCapacity/weightCompensation/energyConsumption/energyCapacity/ratedPower/
crewSlots/itemSlots).

- [ ] **Step 3: (after report) freeze the mapping**

Once the owner reports the field names, a follow-up change adds the final
`extracted/json/compartment_stats.json` writer (the concrete field picks) — either by extending
this script or a small `build_compartment_stats.py`. That step is authored against the real
probe output (no guessing) and will set `CompartmentStat.name` from `loc.compartments[walker_<id>]`.
Re-running the transform then refreshes the 120 part entities. *(This step is intentionally left
for the diagnostic loop and is not pre-written.)*

- [ ] **Step 4: Commit the diagnostic script**

```bash
git add packages/datamine/scripts/extract_compartment_stats.py
git commit -m "feat(datamine): extract_compartment_stats.py — prefab MonoBehaviour stat probe

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Fix build_site_data.py enumeration + nested-localization read

**Files:**
- Modify: `packages/datamine/scripts/build_site_data.py:53-59` (loc read)
- Modify: `packages/datamine/scripts/build_site_data.py:172-184` (enumeration)

**Why:** so `items.json` itself (the owner's regenerated artifact) is complete — enumerated from
the registry rather than loot∪recipes — giving every item authoritative icon/rarity/pawnValue.
The transform's localization-union (Task 3) already fixes the wiki output, but a complete
`items.json` makes the whole pipeline consistent and feeds the new items' icons/rarity.

- [ ] **Step 1: Fix the nested-localization read**

In `build_site_data.py`, the loc load currently does:
```python
    LOC_ITEMS = json.load(open(f'{DATA_OUT}/localization.json', encoding='utf-8'))['items']
```
and later reads `loc.get('name')`. `localization.json` is now nested
(`{id:{locales:{en:{name,short,desc}}}}`). Replace the load to flatten EN:
```python
    _loc_raw = json.load(open(f'{DATA_OUT}/localization.json', encoding='utf-8'))['items']
    LOC_ITEMS = {iid: (v.get('locales', {}).get('en', {})) for iid, v in _loc_raw.items()}
```
This keeps the existing `loc.get('name')` / `loc.get('short')` / `loc.get('desc')` calls working.

- [ ] **Step 2: Enumerate from the full registry**

Replace the item-id collection block (currently the loot+recipes union):
```python
item_ids = set()
for t in tables.values():
    for mode in ('voyage', 'storm'):
        for i in t.get(mode, []):
            item_ids.add(i['item'])

recipes_raw = json.load(open(f'{EXT}/craftingrecipes.json', encoding='utf-8'))
for o in recipes_raw:
    for r in o['data'].get('recipes', []):
        for ing in r['inputIngredients'] + r['outputIngredients']:
            item_ids.add(ing['itemId'])
```
with (recipes still loaded for the recipes section; enumeration now unions all known sources):
```python
recipes_raw = json.load(open(f'{EXT}/craftingrecipes.json', encoding='utf-8'))

# Enumerate from the COMPLETE registry, not just loot∪recipes (which misses vendor/quest/
# world items). Union: item_defs (full ItemDatabase, when extracted) ∪ localization ∪ loot ∪
# recipes. See docs/superpowers/specs/2026-06-18-datamine-completeness-design.md.
item_ids = set(ITEM_DEFS.keys()) | set(LOC_ITEMS.keys())
for t in tables.values():
    for mode in ('voyage', 'storm'):
        for i in t.get(mode, []):
            item_ids.add(i['item'])
for o in recipes_raw:
    for r in o['data'].get('recipes', []):
        for ing in r['inputIngredients'] + r['outputIngredients']:
            item_ids.add(ing['itemId'])
```

- [ ] **Step 3: Owner runs the build, reports counts**

Owner runs (after Task 6's `extract_item_defs.py` + `build_localization.py`):
`python scripts/build_site_data.py`
Expected: `items: N` where N is now ~200+ (was 99), `icons matched` and `loc names` both high.
Report N. The transform (Task 3 wiring) will reconcile these against the baseline.

- [ ] **Step 4: Commit**

```bash
git add packages/datamine/scripts/build_site_data.py
git commit -m "fix(datamine): enumerate items from full registry + nested-loc read

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Update the runbook

**Files:**
- Modify: `packages/datamine/UPDATE_PIPELINE.md`

- [ ] **Step 1: Add the two new extraction steps**

In `UPDATE_PIPELINE.md`, under "## 2. Extract -> build (order matters)", add
`python scripts/extract_item_defs.py` **before** `python scripts/build_site_data.py`, and add
`python scripts/extract_compartment_stats.py` after `extract_compartments_db.py`. Add a note
block:
```markdown
> **Item completeness:** `extract_item_defs.py` writes `extracted/json/item_defs.json` (the full
> ItemDatabase). `build_site_data.py` now enumerates items from item_defs ∪ localization ∪ loot ∪
> recipes — so vendor/quest/world items (turret kits, keys, elemental ammo) appear. If
> `item_defs.json` is absent, enumeration still unions localization (≈249 items).

> **Trampler stats:** `extract_compartment_stats.py` is a DIAGNOSTIC probe → `compartment_stats_probe.json`.
> Inspect it, report which MonoBehaviour field maps to each TramplerStats key, then the mapping is
> frozen and `compartment_stats.json` is produced. Until then the transform preserves baseline
> (sandhelp) stats. Match is by compartment name → baseline slug (overrides/part-slug-map.json).
```

- [ ] **Step 2: Commit**

```bash
git add packages/datamine/UPDATE_PIPELINE.md
git commit -m "docs(datamine): runbook — item_defs + compartment-stats extraction steps

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Component 1 (item enumeration / build_site_data fix) → Tasks 3 (transform) + 8 (Python). ✓
- Component 2 (variant dedup) → Task 1. ✓
- Component 3 (reconcile/merge enumeration) → Tasks 2 + 3. ✓
- Component 4 (diagnostic extractors) → Tasks 6 + 7. ✓
- Component 5 (trampler transform + run guard) → Tasks 4 + 5. ✓
- Runbook docs → Task 9. ✓
- Out-of-scope (tech tree, i18n locales, art) → untouched. ✓

**Placeholder scan:** Task 7 Step 3 is intentionally deferred (the final compartment-stats
mapping must be authored against real probe output — pre-writing it would be guessing, which the
spec explicitly forbids). All other steps contain concrete code/commands. No TBD/TODO elsewhere.

**Type consistency:** `SekItem`/`Localization` (sek.ts), `Entity`/`TramplerStats` (types.ts),
`canonicalSekId` (variants.ts), `enumerateItems` (enumerate.ts), `CompartmentStat`/`tramplerPatch`/
`mergeTrampler`/`loadCompartmentStats` (trampler.ts) are used consistently across tasks. run.ts
variable rename `entities` → `withTrampler` is applied to all five downstream references.

**Known follow-up (not a gap):** Task 7 Step 3 (freeze compartment-stats mapping) and the
binoculars/flashlight residue (Task 6 payoff) complete during the owner's extraction loop, by
design — they are gated on game files, consistent with the spec's two-halves architecture.
