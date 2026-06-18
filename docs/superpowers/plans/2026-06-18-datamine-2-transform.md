# Datamining Part 2 — TypeScript Transform + i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/datamine/transform/` (TypeScript) that merges the committed `sek-out/` datasets over the current wiki artifact baseline — reconciling by name, attaching all-locale translations, adding SEK's new items, refreshing datamine-owned fields, and emitting both the regenerated `packages/data/generated/*.json` and a `missing-from-datamine` report — diffed against the baseline with a slug-safety guard.

**Architecture:** A merge-over-baseline transform. The current committed `entities/recipes/links.json` are the lossless baseline; `sek-out/*.json` refresh matched entities (matched by case-insensitive name → baseline slug, with an id-keyed override map) and add new ones (environment capped to the curated set). Translations from `sek-out/localization.json` attach as an optional `Entity.i18n` map. Nothing is dropped; baseline items the datamine lacks are preserved and reported.

**Tech Stack:** TypeScript, tsx, vitest (matching `packages/data`). Imports `@sandlabs/data` types so output is compile-time-guaranteed.

**Spec:** `docs/superpowers/specs/2026-06-18-unified-datamining-pipeline-design.md`
**Branch:** `feat/monorepo-static-foundation`
**Prerequisite:** Plan 1 done (`packages/datamine/sek-out/` populated; 13 datasets committed).

> **Validated facts (from real data, used below):**
> - Baseline: 377 entities (135 item / 27 environment / 120 trampler-part / 95 tech-node), 39 recipes, ~1421 links.
> - SEK: 99 items, 126 parts, 98 research nodes, 81 locations, 12 loot_sources.
> - **Match key:** SEK entity ↔ baseline by **exact name, case-insensitive** (88/99 items hit; slug is wiki-assigned, NOT derivable from SEK id/name). The 10 unmatched SEK items are new (EMP/smoke/low-recoil shells, Ironclad cargo boxes, mob drops) → merge adds them.
> - SEK rarity enum example: `NOTEWORTHY`; SEK item: `{id,name,icon,rarity,type,pawnValue,short,desc}`.
> - `localization.json` (Plan 1 shape): `{ locales:[...], items:{sekId:{locales:{en:{name,short,desc},...}}}, compartments:{...}, factions:[] }`.

---

## Scope (this plan)

- **In:** `@sandlabs/data` `i18n` schema add; the transform framework (`reconcile → items → i18n → merge → emit → diff → run`); item field-refresh + new-item add; all-locale **item** i18n; the `missing-from-datamine` report; baseline-lossless merge across all kinds; slug-safety diff guard; first real run on the committed `sek-out/`.
- **Deferred (noted, extensible within the same framework):** deep per-field datamine refresh for parts/tech/locations/loot (the baseline already carries these richly; merge preserves them) — added incrementally as SEK gains data (e.g. CompartmentsDatabase trampler stats after a real extraction). **Part/compartment i18n** (the `compArmor_*` ↔ `walker_*_epb` id mapping needs the CompartmentsDatabase; item i18n lands now).

---

## File Structure

```
packages/data/src/types.ts                    # MODIFY — add LocalizedText + Entity.i18n?
packages/data/src/store.roundtrip.test.ts      # MODIFY — tolerate optional i18n
packages/datamine/
  package.json                                 # MODIFY — add tsx/vitest devDeps + datamine:transform script
  tsconfig.json                                # CREATE
  vitest.config.ts                             # CREATE
  transform/
    baseline.ts                                # CREATE — load the committed wiki artifact (merge target)
    sek.ts                                     # CREATE — typed loaders for sek-out datasets
    reconcile.ts                               # CREATE — SEK id/name -> baseline slug
    reconcile.test.ts
    rarity.ts                                  # CREATE — SEK rarity enum -> wiki rarity name
    items.ts                                   # CREATE — SEK item -> Entity field patch / new Entity
    items.test.ts
    i18n.ts                                    # CREATE — localization -> per-slug i18n map
    i18n.test.ts
    merge.ts                                   # CREATE — merge policy + missing report
    merge.test.ts
    emit.ts                                    # CREATE — validate + write artifact
    diff.ts                                    # CREATE — baseline diff + slug guard
    diff.test.ts
    run.ts                                     # CREATE — orchestrator (tsx entry)
    overrides/
      slug-map.json                            # CREATE — { sekId: wikiSlug } for unmatched/drift
    fixtures/                                  # CREATE — tiny sek-out + baseline fixtures for tests
  reports/
    missing-from-datamine.json                 # GENERATED (committed after first run)
```

---

## Task 1: Add the `i18n` schema to `@sandlabs/data`

**Files:**
- Modify: `packages/data/src/types.ts`
- Modify: `packages/data/src/store.roundtrip.test.ts`

- [ ] **Step 1: Add `LocalizedText` + `Entity.i18n` to `packages/data/src/types.ts`**

Add the interface and the optional field (place `LocalizedText` above `Entity`, add the field at the end of the `Entity` interface, before the closing brace):

```ts
export interface LocalizedText {
  name: string;
  description: string | null;
}
```

In `interface Entity { … }`, add as the last field:

```ts
  /** Optional per-locale translations (locale code -> text). EN remains the primary
   *  `name`/`description`; this carries other locales. Absent when no translations. */
  i18n?: Record<string, LocalizedText>;
```

- [ ] **Step 2: Confirm the round-trip test tolerates the optional field**

Read `packages/data/src/store.roundtrip.test.ts`. It loads the committed JSON (which has no `i18n` yet) — an optional field needs no change to pass. Add one assertion documenting the contract (append inside the existing `describe`):

```ts
  it("i18n is optional on entities", () => {
    // baseline has no i18n yet; the field is optional. Just assert the type allows absence.
    for (const e of s.entities) {
      if (e.i18n !== undefined) {
        for (const t of Object.values(e.i18n)) expect(typeof t.name).toBe("string");
      }
    }
  });
```

- [ ] **Step 3: Typecheck + test `@sandlabs/data`**

Run: `npx tsc -p packages/data/tsconfig.json --noEmit && npm run test --workspace=packages/data`
Expected: clean; all data-package tests pass.

- [ ] **Step 4: Typecheck the wiki (the new optional field must not break consumers)**

Run: `npx tsc -p apps/wiki/tsconfig.json --noEmit`
Expected: only the pre-existing `crownsIcon` test error (if still present); no new errors.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/types.ts packages/data/src/store.roundtrip.test.ts
git commit -m "feat(data): add optional Entity.i18n (LocalizedText) for translations"
```

---

## Task 2: Transform package setup

**Files:**
- Modify: `packages/datamine/package.json`
- Create: `packages/datamine/tsconfig.json`, `packages/datamine/vitest.config.ts`

- [ ] **Step 1: Add TS tooling + transform script to `packages/datamine/package.json`**

Replace the `"scripts"` block and add `devDependencies` + `dependencies`:

```json
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "transform": "tsx transform/run.ts",
    "loc:test": "echo \"run: python -m pytest scripts/test_build_localization.py\""
  },
  "dependencies": {
    "@sandlabs/data": "*"
  },
  "devDependencies": {
    "tsx": "^4.22.4",
    "vitest": "^4.1.8"
  }
```

- [ ] **Step 2: Create `packages/datamine/tsconfig.json`**

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
  "include": ["transform"]
}
```

- [ ] **Step 3: Create `packages/datamine/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["transform/**/*.test.ts"] },
});
```

- [ ] **Step 4: Install + verify the workspace links**

Run: `npm install`
Expected: `@sandlabs/datamine` resolves `@sandlabs/data`; no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/package.json packages/datamine/tsconfig.json packages/datamine/vitest.config.ts package-lock.json
git commit -m "chore(datamine): TS transform tooling (tsx + vitest + @sandlabs/data dep)"
```

---

## Task 3: Typed loaders — baseline + sek-out

**Files:**
- Create: `packages/datamine/transform/baseline.ts`, `packages/datamine/transform/sek.ts`

- [ ] **Step 1: Create `packages/datamine/transform/baseline.ts`**

```ts
// Loads the current committed wiki artifact — the lossless merge target.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Entity, Recipe, EntityLink } from "@sandlabs/data";

const GEN = resolve(import.meta.dirname, "../../data/generated");

function read<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(GEN, file), "utf-8")) as T;
}

export interface Baseline {
  entities: Entity[];
  recipes: Recipe[];
  links: EntityLink[];
}

export function loadBaseline(dir = GEN): Baseline {
  const r = (f: string) => JSON.parse(readFileSync(resolve(dir, f), "utf-8"));
  return {
    entities: r("entities.json"),
    recipes: r("recipes.json"),
    links: r("links.json"),
  };
}
```

- [ ] **Step 2: Create `packages/datamine/transform/sek.ts`**

```ts
// Typed loaders for the committed sek-out datasets (the datamine inputs).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEK = resolve(import.meta.dirname, "../sek-out");

export interface SekItem {
  id: string; name: string; icon: string | null; rarity: string | null;
  type: string | null; pawnValue: number | null; short: string | null; desc: string | null;
}

export interface LocEntry { name: string; short?: string | null; desc: string | null }
export interface Localization {
  locales: string[];
  items: Record<string, { locales: Record<string, LocEntry> }>;
  compartments: Record<string, { locales: Record<string, LocEntry> }>;
  factions: string[];
}

function read<T>(file: string, dir = SEK): T {
  return JSON.parse(readFileSync(resolve(dir, file), "utf-8")) as T;
}

export function loadSekItems(dir = SEK): SekItem[] { return read("items.json", dir); }
export function loadLocalization(dir = SEK): Localization { return read("localization.json", dir); }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p packages/datamine/tsconfig.json --noEmit`
Expected: clean (these compile against `@sandlabs/data` types + JSON).

- [ ] **Step 4: Commit**

```bash
git add packages/datamine/transform/baseline.ts packages/datamine/transform/sek.ts
git commit -m "feat(transform): typed baseline + sek-out loaders"
```

---

## Task 4: `reconcile.ts` — SEK id/name → baseline slug (TDD)

**Files:**
- Create: `packages/datamine/transform/reconcile.ts`, `reconcile.test.ts`, `overrides/slug-map.json`

- [ ] **Step 1: Create the empty override map `packages/datamine/transform/overrides/slug-map.json`**

```json
{}
```

- [ ] **Step 2: Write the failing test `packages/datamine/transform/reconcile.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile";
import type { Entity } from "@sandlabs/data";

const baseEntity = (slug: string, name: string): Entity => ({
  id: slug, slug, kind: "item", name, description: null, category: "misc",
  rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
});

describe("reconcile", () => {
  const baseline = [baseEntity("anti-reactor-gun", "The Great Silence"), baseEntity("artefact-crystal", "Crystal")];

  it("matches by exact name (case-insensitive) -> baseline slug", () => {
    const r = reconcile(
      [{ id: "ArtefactCrystal", name: "crystal" }],
      baseline, {});
    expect(r.bySekId.get("ArtefactCrystal")).toEqual({ slug: "artefact-crystal", status: "matched" });
  });

  it("uses the override map when name doesn't match", () => {
    const r = reconcile(
      [{ id: "item_oddName", name: "Totally Different" }],
      baseline, { item_oddName: "anti-reactor-gun" });
    expect(r.bySekId.get("item_oddName")).toEqual({ slug: "anti-reactor-gun", status: "override" });
  });

  it("creates a new slug for unmatched ids and dedupes collisions", () => {
    const r = reconcile(
      [{ id: "item_emp", name: "80 mm EMP Shell" }, { id: "item_emp2", name: "80 mm EMP Shell" }],
      baseline, {});
    expect(r.bySekId.get("item_emp")).toEqual({ slug: "80-mm-emp-shell", status: "new" });
    expect(r.bySekId.get("item_emp2")).toEqual({ slug: "80-mm-emp-shell-2", status: "new" });
  });
});
```

- [ ] **Step 3: Run, confirm FAIL**

Run: `npm run test --workspace=packages/datamine -- reconcile`
Expected: FAIL — `reconcile` not exported.

- [ ] **Step 4: Implement `packages/datamine/transform/reconcile.ts`**

```ts
import type { Entity } from "@sandlabs/data";

export type ReconcileStatus = "matched" | "override" | "new";
export interface ReconcileHit { slug: string; status: ReconcileStatus }
export interface ReconcileResult {
  bySekId: Map<string, ReconcileHit>;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Resolve each SEK record {id,name} to a wiki slug:
 *  1) override map (sekId -> slug) wins; 2) exact baseline name match (case-insensitive);
 *  3) else a new slugify(name), deduped against baseline + already-assigned new slugs. */
export function reconcile(
  sek: { id: string; name: string }[],
  baseline: Entity[],
  overrides: Record<string, string>,
): ReconcileResult {
  const byName = new Map(baseline.map((e) => [e.name.toLowerCase(), e.slug]));
  const taken = new Set(baseline.map((e) => e.slug));
  const bySekId = new Map<string, ReconcileHit>();

  for (const rec of sek) {
    const ov = overrides[rec.id];
    if (ov) { bySekId.set(rec.id, { slug: ov, status: "override" }); continue; }
    const named = byName.get((rec.name ?? "").toLowerCase());
    if (named) { bySekId.set(rec.id, { slug: named, status: "matched" }); continue; }
    // new entity: unique slug
    let base = slugify(rec.name || rec.id) || slugify(rec.id);
    let slug = base, n = 1;
    while (taken.has(slug)) { n += 1; slug = `${base}-${n}`; }
    taken.add(slug);
    bySekId.set(rec.id, { slug, status: "new" });
  }
  return { bySekId };
}
```

- [ ] **Step 5: Run, confirm PASS**

Run: `npm run test --workspace=packages/datamine -- reconcile`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/datamine/transform/reconcile.ts packages/datamine/transform/reconcile.test.ts packages/datamine/transform/overrides/slug-map.json
git commit -m "feat(transform): reconcile SEK id/name to baseline slug (TDD)"
```

---

## Task 5: `rarity.ts` + `items.ts` — SEK item → Entity patch / new (TDD)

**Files:**
- Create: `packages/datamine/transform/rarity.ts`, `items.ts`, `items.test.ts`

- [ ] **Step 1: Create `packages/datamine/transform/rarity.ts`**

Map SEK's rarity enum to the wiki's rarity names. (SEK enum values seen: `NOTEWORTHY`; the wiki uses Common/Noteworthy/Rare/Epic/Experimental etc. Map known values; unknown → title-case fallback.)

```ts
const RARITY: Record<string, string> = {
  COMMON: "Common",
  NOTEWORTHY: "Noteworthy",
  RARE: "Rare",
  EPIC: "Epic",
  LEGENDARY: "Legendary",
  EXPERIMENTAL: "Experimental",
};

/** SEK rarity enum -> wiki rarity name; null/unknown -> null (merge keeps baseline rarity). */
export function mapRarity(sek: string | null): string | null {
  if (!sek) return null;
  return RARITY[sek.toUpperCase()] ?? null;
}
```

- [ ] **Step 2: Write the failing test `packages/datamine/transform/items.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { sekItemPatch, newItemEntity } from "./items";
import type { SekItem } from "./sek";

const sek = (o: Partial<SekItem>): SekItem => ({
  id: "x", name: "X", icon: null, rarity: null, type: null, pawnValue: null, short: null, desc: null, ...o,
});

describe("items transform", () => {
  it("sekItemPatch produces only datamine-owned fields", () => {
    const p = sekItemPatch(sek({ rarity: "NOTEWORTHY", icon: "/icons/x.png", desc: "Hi." }));
    expect(p).toEqual({ rarity: "Noteworthy", icon: "/icons/x.png", description: "Hi." });
  });

  it("sekItemPatch omits fields the datamine doesn't provide", () => {
    const p = sekItemPatch(sek({ rarity: null, icon: null, desc: null }));
    expect(p).toEqual({}); // nothing to refresh -> baseline kept
  });

  it("newItemEntity builds a full Entity for an unmatched SEK item", () => {
    const e = newItemEntity("80-mm-emp-shell", sek({ id: "item_turretAmmo_EMP", name: "80 mm EMP Shell", icon: "/icons/emp.png", rarity: "COMMON", desc: "Boom." }));
    expect(e.slug).toBe("80-mm-emp-shell");
    expect(e.kind).toBe("item");
    expect(e.name).toBe("80 mm EMP Shell");
    expect(e.rarity).toBe("Common");
    expect(e.icon).toBe("/icons/emp.png");
    expect(e.description).toBe("Boom.");
    expect(e.disabled).toBe(false);
    expect(e.category).toBe("misc"); // default; refined by overrides/later mapping
  });
});
```

- [ ] **Step 3: Run, confirm FAIL**

Run: `npm run test --workspace=packages/datamine -- items`
Expected: FAIL — `./items` exports missing.

- [ ] **Step 4: Implement `packages/datamine/transform/items.ts`**

```ts
import type { Entity } from "@sandlabs/data";
import type { SekItem } from "./sek";
import { mapRarity } from "./rarity";

/** Datamine-owned fields to refresh over a matched baseline item. Only includes a field
 *  when the datamine actually provides a value, so the merge keeps the baseline otherwise. */
export type ItemPatch = Partial<Pick<Entity, "rarity" | "icon" | "description">>;

export function sekItemPatch(it: SekItem): ItemPatch {
  const p: ItemPatch = {};
  const rarity = mapRarity(it.rarity);
  if (rarity !== null) p.rarity = rarity;
  if (it.icon) p.icon = it.icon;
  if (it.desc) p.description = it.desc;
  return p;
}

/** A brand-new item Entity for a SEK item with no baseline match. category defaults to
 *  "misc" (refined by overrides or a later type->category mapping); stats null (merge/refresh
 *  fills them when available). id mirrors the slug (DB ids are gone; slug is the key). */
export function newItemEntity(slug: string, it: SekItem): Entity {
  return {
    id: slug, slug, kind: "item", name: it.name,
    description: it.desc, category: "misc", rarity: mapRarity(it.rarity),
    icon: it.icon, imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
    itemStats: null, tramplerStats: null, techNodeStats: null,
  };
}
```

- [ ] **Step 5: Run, confirm PASS**

Run: `npm run test --workspace=packages/datamine -- items`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/datamine/transform/rarity.ts packages/datamine/transform/items.ts packages/datamine/transform/items.test.ts
git commit -m "feat(transform): SEK item -> Entity patch/new + rarity map (TDD)"
```

---

## Task 6: `i18n.ts` — localization → per-slug translations (TDD)

**Files:**
- Create: `packages/datamine/transform/i18n.ts`, `i18n.test.ts`

- [ ] **Step 1: Write the failing test `packages/datamine/transform/i18n.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildItemI18n } from "./i18n";
import type { Localization } from "./sek";

const loc: Localization = {
  locales: ["en", "fr"],
  items: {
    item_fab: { locales: { en: { name: "Fabric", desc: "Cloth." }, fr: { name: "Tissu", desc: "Toile." } } },
    item_en_only: { locales: { en: { name: "Iron", desc: null } } },
  },
  compartments: {}, factions: [],
};

describe("buildItemI18n", () => {
  // reconcile result: sekId -> slug
  const bySlug = new Map([["item_fab", "fabric"], ["item_en_only", "iron"]]);

  it("maps non-EN locales onto the reconciled slug; omits EN (it's the primary)", () => {
    const m = buildItemI18n(loc, bySlug);
    expect(m.get("fabric")).toEqual({ fr: { name: "Tissu", description: "Toile." } });
  });

  it("omits entries with only EN (no extra locales to carry)", () => {
    const m = buildItemI18n(loc, bySlug);
    expect(m.has("iron")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `npm run test --workspace=packages/datamine -- i18n`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/datamine/transform/i18n.ts`**

```ts
import type { LocalizedText } from "@sandlabs/data";
import type { Localization } from "./sek";

/** Build a slug -> {locale -> LocalizedText} map for ITEMS, carrying every NON-EN locale
 *  (EN stays the entity's primary name/description). Slugs come from reconcile (sekId->slug).
 *  Entities with only EN get no entry. */
export function buildItemI18n(
  loc: Localization,
  slugBySekId: Map<string, string>,
): Map<string, Record<string, LocalizedText>> {
  const out = new Map<string, Record<string, LocalizedText>>();
  for (const [sekId, entry] of Object.entries(loc.items)) {
    const slug = slugBySekId.get(sekId);
    if (!slug) continue;
    const i18n: Record<string, LocalizedText> = {};
    for (const [locale, t] of Object.entries(entry.locales)) {
      if (locale === "en") continue;
      i18n[locale] = { name: t.name, description: t.desc ?? null };
    }
    if (Object.keys(i18n).length > 0) out.set(slug, i18n);
  }
  return out;
}
```

- [ ] **Step 4: Run, confirm PASS**

Run: `npm run test --workspace=packages/datamine -- i18n`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/transform/i18n.ts packages/datamine/transform/i18n.test.ts
git commit -m "feat(transform): item i18n map from localization (TDD)"
```

---

## Task 7: `merge.ts` — merge policy + missing report (TDD)

**Files:**
- Create: `packages/datamine/transform/merge.ts`, `merge.test.ts`

- [ ] **Step 1: Write the failing test `packages/datamine/transform/merge.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mergeItems } from "./merge";
import type { Entity, LocalizedText } from "@sandlabs/data";
import type { SekItem } from "./sek";

const baseEntity = (slug: string, name: string, over: Partial<Entity> = {}): Entity => ({
  id: slug, slug, kind: "item", name, description: "base desc", category: "weapons",
  rarity: "Common", icon: "/icons/base.png", imageAlt: null, derivedName: null,
  sourceUrl: null, disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null, ...over,
});
const sek = (o: Partial<SekItem>): SekItem => ({
  id: "x", name: "X", icon: null, rarity: null, type: null, pawnValue: null, short: null, desc: null, ...o,
});

describe("mergeItems", () => {
  const baseline: Entity[] = [baseEntity("rifle", "Rifle"), baseEntity("legacy-item", "Legacy Item")];
  const sekItems: SekItem[] = [
    sek({ id: "item_rifle", name: "Rifle", rarity: "RARE", icon: "/icons/rifle.png" }), // matches baseline
    sek({ id: "item_emp", name: "EMP Shell", rarity: "COMMON", desc: "Boom." }),         // new
  ];
  const bySekId = new Map([
    ["item_rifle", { slug: "rifle", status: "matched" as const }],
    ["item_emp", { slug: "emp-shell", status: "new" as const }],
  ]);
  const i18n = new Map<string, Record<string, LocalizedText>>([["rifle", { fr: { name: "Fusil", description: null } }]]);

  const { entities, missing } = mergeItems(baseline, sekItems, bySekId, i18n);

  it("refreshes matched items with datamine fields, keeps baseline elsewhere", () => {
    const rifle = entities.find((e) => e.slug === "rifle")!;
    expect(rifle.rarity).toBe("Rare");          // datamine refreshed
    expect(rifle.icon).toBe("/icons/rifle.png"); // datamine refreshed
    expect(rifle.description).toBe("base desc"); // datamine had none -> baseline kept
    expect(rifle.category).toBe("weapons");      // not datamine-owned -> baseline kept
    expect(rifle.i18n).toEqual({ fr: { name: "Fusil", description: null } });
  });

  it("adds new SEK items", () => {
    const emp = entities.find((e) => e.slug === "emp-shell")!;
    expect(emp.name).toBe("EMP Shell");
    expect(emp.rarity).toBe("Common");
  });

  it("preserves baseline-only items and reports them as missing-from-datamine", () => {
    expect(entities.find((e) => e.slug === "legacy-item")).toBeTruthy();
    expect(missing).toEqual([{ slug: "legacy-item", name: "Legacy Item", kind: "item" }]);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `npm run test --workspace=packages/datamine -- merge`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/datamine/transform/merge.ts`**

```ts
import type { Entity, LocalizedText } from "@sandlabs/data";
import type { SekItem } from "./sek";
import type { ReconcileHit } from "./reconcile";
import { sekItemPatch, newItemEntity } from "./items";

export interface MissingEntry { slug: string; name: string; kind: string }
export interface MergeItemsResult { entities: Entity[]; missing: MissingEntry[] }

/** Merge SEK items over the baseline ITEMS:
 *  - matched/override slug -> apply datamine patch over the baseline entity (datamine wins
 *    per provided field; baseline kept otherwise) + attach i18n;
 *  - new -> append a new Entity (+ i18n);
 *  - baseline items with no SEK match -> kept unchanged + recorded in `missing`.
 *  Non-item baseline entities are passed through untouched (other kinds merge elsewhere). */
export function mergeItems(
  baseline: Entity[],
  sekItems: SekItem[],
  bySekId: Map<string, ReconcileHit>,
  i18nBySlug: Map<string, Record<string, LocalizedText>>,
): MergeItemsResult {
  const bySlug = new Map(baseline.map((e) => [e.slug, e]));
  const matchedSlugs = new Set<string>();
  const additions: Entity[] = [];

  const applyI18n = (e: Entity): Entity => {
    const i = i18nBySlug.get(e.slug);
    return i ? { ...e, i18n: i } : e;
  };

  for (const it of sekItems) {
    const hit = bySekId.get(it.id);
    if (!hit) continue;
    if (hit.status === "new") {
      additions.push(applyI18n(newItemEntity(hit.slug, it)));
      continue;
    }
    const base = bySlug.get(hit.slug);
    if (!base) { // override/matched pointing at a missing slug -> treat as new
      additions.push(applyI18n(newItemEntity(hit.slug, it)));
      continue;
    }
    matchedSlugs.add(hit.slug);
    bySlug.set(hit.slug, applyI18n({ ...base, ...sekItemPatch(it) }));
  }

  const missing: MissingEntry[] = baseline
    .filter((e) => e.kind === "item" && !matchedSlugs.has(e.slug))
    .map((e) => ({ slug: e.slug, name: e.name, kind: e.kind }));

  // Reassemble: baseline order preserved (with refreshed values), then new additions.
  const entities = baseline.map((e) => bySlug.get(e.slug)!).concat(additions);
  return { entities, missing };
}
```

- [ ] **Step 4: Run, confirm PASS**

Run: `npm run test --workspace=packages/datamine -- merge`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/transform/merge.ts packages/datamine/transform/merge.test.ts
git commit -m "feat(transform): item merge policy + missing-from-datamine report (TDD)"
```

---

## Task 8: `diff.ts` — baseline diff + slug-safety guard (TDD)

**Files:**
- Create: `packages/datamine/transform/diff.ts`, `diff.test.ts`

- [ ] **Step 1: Write the failing test `packages/datamine/transform/diff.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { diffEntities } from "./diff";
import type { Entity } from "@sandlabs/data";

const e = (slug: string): Entity => ({
  id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
  rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
});

describe("diffEntities", () => {
  it("reports added and removed slugs", () => {
    const d = diffEntities([e("a"), e("b")], [e("a"), e("c")]);
    expect(d.added).toEqual(["c"]);
    expect(d.removed).toEqual(["b"]);
  });

  it("removed slugs are the slug-safety violation signal", () => {
    const d = diffEntities([e("a")], [e("a")]);
    expect(d.removed).toEqual([]); // none removed -> safe
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `npm run test --workspace=packages/datamine -- diff`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/datamine/transform/diff.ts`**

```ts
import type { Entity } from "@sandlabs/data";

export interface EntityDiff {
  added: string[];    // slugs in next but not prev
  removed: string[];  // slugs in prev but not next (slug-safety violation)
  total: { prev: number; next: number };
}

/** Slug-level diff of two entity sets (prev = baseline, next = regenerated). */
export function diffEntities(prev: Entity[], next: Entity[]): EntityDiff {
  const prevSlugs = new Set(prev.map((e) => e.slug));
  const nextSlugs = new Set(next.map((e) => e.slug));
  const added = [...nextSlugs].filter((s) => !prevSlugs.has(s)).sort();
  const removed = [...prevSlugs].filter((s) => !nextSlugs.has(s)).sort();
  return { added, removed, total: { prev: prev.length, next: next.length } };
}
```

- [ ] **Step 4: Run, confirm PASS**

Run: `npm run test --workspace=packages/datamine -- diff`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/transform/diff.ts packages/datamine/transform/diff.test.ts
git commit -m "feat(transform): baseline entity diff + slug-safety signal (TDD)"
```

---

## Task 9: `emit.ts` + `run.ts` — orchestrate, validate, write, guard

**Files:**
- Create: `packages/datamine/transform/emit.ts`, `run.ts`

- [ ] **Step 1: Create `packages/datamine/transform/emit.ts`**

```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Entity, Recipe, EntityLink } from "@sandlabs/data";

const GEN = resolve(import.meta.dirname, "../../data/generated");
const REPORTS = resolve(import.meta.dirname, "../reports");

/** Lightweight runtime shape check (compile-time is guaranteed by TS; this catches
 *  accidental nulls in required fields after the merge). Throws on violation. */
export function validateEntities(entities: Entity[]): void {
  for (const e of entities) {
    if (!e.slug || !e.name || !e.kind) {
      throw new Error(`emit: entity missing slug/name/kind: ${JSON.stringify(e).slice(0, 120)}`);
    }
  }
  const slugs = new Set<string>();
  for (const e of entities) {
    if (slugs.has(e.slug)) throw new Error(`emit: duplicate slug ${e.slug}`);
    slugs.add(e.slug);
  }
}

export function writeArtifact(entities: Entity[], recipes: Recipe[], links: EntityLink[]): void {
  mkdirSync(GEN, { recursive: true });
  const w = (f: string, d: unknown) => writeFileSync(resolve(GEN, f), JSON.stringify(d, null, 2) + "\n");
  w("entities.json", entities);
  w("recipes.json", recipes);
  w("links.json", links);
}

export function writeMissingReport(missing: unknown): void {
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(resolve(REPORTS, "missing-from-datamine.json"), JSON.stringify(missing, null, 2) + "\n");
}
```

- [ ] **Step 2: Create `packages/datamine/transform/run.ts` (orchestrator)**

```ts
// Orchestrates the transform: load baseline + sek-out, reconcile items, build i18n, merge,
// diff, validate, write artifact + missing report. Recipes/links/other-kind entities pass
// through from the baseline unchanged in this iteration (merge framework is extensible).
//   npx tsx transform/run.ts [--allow-slug-changes]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadBaseline } from "./baseline";
import { loadSekItems, loadLocalization } from "./sek";
import { reconcile } from "./reconcile";
import { buildItemI18n } from "./i18n";
import { mergeItems } from "./merge";
import { diffEntities } from "./diff";
import { validateEntities, writeArtifact, writeMissingReport } from "./emit";

const allowSlugChanges = process.argv.includes("--allow-slug-changes");
const overrides = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "overrides/slug-map.json"), "utf-8"),
) as Record<string, string>;

const baseline = loadBaseline();
const sekItems = loadSekItems();
const loc = loadLocalization();

const rec = reconcile(sekItems.map((i) => ({ id: i.id, name: i.name })), baseline.entities, overrides);
const i18n = buildItemI18n(loc, new Map([...rec.bySekId].map(([id, hit]) => [id, hit.slug])));
const { entities, missing } = mergeItems(baseline.entities, sekItems, rec.bySekId, i18n);

const diff = diffEntities(baseline.entities, entities);
console.log(`entities ${diff.total.prev} -> ${diff.total.next} | +${diff.added.length} added, -${diff.removed.length} removed`);
console.log(`reconcile: ${[...rec.bySekId.values()].filter((h) => h.status === "matched").length} matched, ` +
  `${[...rec.bySekId.values()].filter((h) => h.status === "new").length} new, ` +
  `${[...rec.bySekId.values()].filter((h) => h.status === "override").length} override`);
console.log(`missing-from-datamine: ${missing.length} baseline items not covered by SEK`);
if (diff.added.length) console.log("  added:", diff.added.slice(0, 20).join(", ") + (diff.added.length > 20 ? " …" : ""));

if (diff.removed.length > 0 && !allowSlugChanges) {
  console.error(`REFUSING: ${diff.removed.length} existing slug(s) would be removed: ${diff.removed.join(", ")}`);
  console.error("re-run with --allow-slug-changes if this is intended.");
  process.exit(1);
}

validateEntities(entities);
// recipes + links + non-item entities pass through from baseline this iteration.
writeArtifact(entities, baseline.recipes, baseline.links);
writeMissingReport(missing);
console.log("wrote packages/data/generated/{entities,recipes,links}.json + reports/missing-from-datamine.json");
```

- [ ] **Step 3: Typecheck the transform**

Run: `npx tsc -p packages/datamine/tsconfig.json --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/datamine/transform/emit.ts packages/datamine/transform/run.ts
git commit -m "feat(transform): emit + orchestrator with slug-safety guard"
```

---

## Task 10: First real run + review the diff

**Files:**
- Generated: `packages/data/generated/*.json` (regenerated), `packages/datamine/reports/missing-from-datamine.json`
- Possibly modified: `packages/datamine/transform/overrides/slug-map.json`

- [ ] **Step 1: Run the transform against the committed `sek-out/`**

Run: `npm run transform --workspace=packages/datamine`
Expected: prints entity counts, reconcile breakdown (≈88 matched / ≈10 new / 0 override for items), and the missing count (≈47). It should NOT refuse (no existing slug removed — merge only adds + refreshes). If it refuses with removed slugs, investigate (a matched item mapping to the wrong slug) and add `overrides/slug-map.json` entries, then re-run.

- [ ] **Step 2: Review the diff output + the regenerated artifact**

- Confirm `entities 377 -> ~387` (added the ~10 new SEK items, removed 0).
- `git diff --stat packages/data/generated/` should show entities.json changed (i18n added to matched items, ~10 new items, refreshed rarity/icon/desc), recipes/links unchanged.
- Spot-check one matched item gained `i18n` (only if `sek-out/localization.json` carries non-EN locales — the Plan-1 seed is EN-only, so `i18n` will be EMPTY until a real all-locale extraction; that's expected. The merge still runs correctly; i18n populates after Plan 3's extraction).
- Read `packages/datamine/reports/missing-from-datamine.json` — the ~47 baseline items SEK doesn't cover (for owner investigation).

- [ ] **Step 3: Run the data-package round-trip test against the regenerated artifact**

Run: `npm run test --workspace=packages/data`
Expected: PASS — the regenerated `entities/recipes/links` still satisfy the round-trip integrity test (unique slugs; every recipe/link slug resolves). If a NEW item is referenced by no link/recipe that's fine; the guard is that links/recipes reference KNOWN slugs, and links/recipes are unchanged baseline so they still resolve.

- [ ] **Step 4: Verify the wiki still builds + renders against the regenerated artifact**

Run: `npm run build --workspace=apps/wiki`
Expected: green. The ~10 new items now have detail pages (category "misc" until refined). Optionally `npm run dev` and spot-check a new item page + an existing one.

- [ ] **Step 5: Commit the regenerated artifact + report**

```bash
git add packages/data/generated packages/datamine/reports packages/datamine/transform/overrides/slug-map.json
git commit -m "feat(datamine): first transform run — merge SEK items + missing report"
```

> **Note:** new items default to `category: "misc"`. If that's visibly wrong on the site, add a SEK `type`→category mapping (extend `items.ts`) or curate via overrides in a follow-up — out of scope for this first run, which proves the merge framework end-to-end and is lossless.

---

## Self-Review Notes (for the executor)

- **Lossless is the bar.** The merge only *adds* and *refreshes*; it must never remove a baseline slug (the `diff.ts` guard enforces this). recipes/links/non-item entities pass through unchanged this iteration — that's intentional, not an omission (the baseline already carries them richly; SEK doesn't improve them yet).
- **i18n will be empty until Plan 3.** The Plan-1 `localization.json` seed is EN-only, so `buildItemI18n` yields nothing to attach yet. The code path is correct and tested; real translations land when the all-locale extraction runs (Plan 3). Don't "fix" the empty i18n.
- **New items default to `category: misc`.** Acceptable for this framework-proving run; refine later.
- **Match key is name-based.** If the diff shows a matched item refreshing the WRONG baseline entity (name collision), add an `overrides/slug-map.json` entry (sekId → correct slug) and re-run.

## Outcome

A working, lossless, type-safe transform: `npm run transform` regenerates the wiki artifact by merging SEK items over the baseline, attaching item translations (when present), adding new datamined items, and emitting the missing-from-datamine report — all guarded by a slug-safety diff. The framework is extensible per-kind (parts/tech/locations/loot refresh, part i18n, CompartmentsDatabase trampler stats) as SEK data and a real extraction (Plan 3) become available.
