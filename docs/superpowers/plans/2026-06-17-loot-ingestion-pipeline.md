# Loot Ingestion Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeatable, scrape-authoritative pipeline that ingests datamined loot into the sand-wiki on every game update, plus a loot UI that shows drop chance and voyage/storm quantities.

**Architecture:** SEK Python converter merges the scrape with committed override files and writes a canonical `sand-wiki/prisma/loot-containers.json`; a wiki-side TypeScript loader full-overwrites the container entities and their loot `EntityLink`s in the target DB (dev branch first, explicit prod promote); the loot UI renders the richer per-entry data.

**Tech Stack:** Python 3 (converter), TypeScript + tsx + Prisma 6 (loader), Next.js 16 + React + Tailwind/shadcn (UI), vitest (tests).

---

## File Structure

**SEK side (`sek/sand-expedition-kit/datamine/`)**
- Modify: `scripts/build_container_loot.py` — read overrides, emit `{meta, containers}`, write into sand-wiki.
- Create: `overrides/loot-overrides.json` — committed corrections (aliases, known-live slugs).

**Wiki side (`sand-wiki/`)**
- Create: `prisma/loot-containers.json` — canonical artifact (generated, committed).
- Create: `prisma/loot-containers.ts` — pure types + transform (`lootLinkRows`), shared by loader + test.
- Create: `prisma/load-loot-containers.ts` — the loader (DB I/O).
- Create: `prisma/loot-containers.test.ts` — integrity + transform tests.
- Modify: `package.json` — `loot:build` / `loot:update` / `loot:promote` scripts.
- Modify: `src/lib/entity-links.ts` — `LinkRow` gains `value2`/`value3`; generalize `TIER_ORDER` sort.
- Modify: `src/lib/loot.ts` — `LootEntryView` gains chance/voyage/storm + storm-bonus derivation.
- Modify: `src/app/environment/[slug]/page.tsx` — map `value2`/`value3` into `LinkRow`.
- Modify: `src/components/LootTable.tsx` — richer table (frontend-design).
- Modify: `src/lib/queries.ts` — widen reverse-view selects (`getIncomingLootLinks`, `getCratesContaining`) with `value2`/`value3`.
- Modify: `src/lib/loot.test.ts` (create if absent) — view-layer tests.

---

## Task 1: Override file + converter emits canonical artifact

**Files:**
- Create: `sek/sand-expedition-kit/datamine/overrides/loot-overrides.json`
- Modify: `sek/sand-expedition-kit/datamine/scripts/build_container_loot.py`
- Test: `sek/sand-expedition-kit/datamine/scripts/test_build_container_loot.py`

- [ ] **Step 1: Create the override file**

Create `sek/sand-expedition-kit/datamine/overrides/loot-overrides.json`:

```json
{
 "itemSlugAliases": {
  "item_medkit": "med-kit",
  "item_weirdCoral": "resource-weird-coral",
  "game_coinCrownPile_10": "coin-crown",
  "game_ValuablePiles01_mobDrop": "small-valuables",
  "item_rifleMusketClip": "repeater-rifle-quick-reload"
 },
 "knownLiveSlugs": ["resource-weird-coral"],
 "containerOverrides": {}
}
```

- [ ] **Step 2: Write the failing converter test**

Create `sek/sand-expedition-kit/datamine/scripts/test_build_container_loot.py`:

```python
import json, subprocess, sys, os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # sand-expedition-kit
ARTIFACT = (ROOT / ".." / ".." / "sand-wiki" / "prisma" / "loot-containers.json").resolve()

def build():
    subprocess.run([sys.executable, str(HERE / "build_container_loot.py")], check=True, cwd=str(ROOT))
    return json.loads(ARTIFACT.read_text(encoding="utf-8"))

def test_artifact_has_meta_and_containers():
    d = build()
    assert d["meta"]["containers"] == len(d["containers"]) == 12
    assert d["meta"]["source"] == "loot_sources.json"

def test_overrides_alias_applied():
    d = build()
    # item_medkit must surface as med-kit somewhere in the merged loot
    slugs = {e["slug"] for c in d["containers"].values() for t in c["tiers"] for e in t["loot"]}
    assert "med-kit" in slugs
    assert "repeater-rifle-quick-reload" in slugs

def test_effort_collapsed_to_tiers():
    d = build()
    labels = [t["tier"] for t in d["containers"]["weapons-crate"]["tiers"]]
    assert labels == ["Tier 1", "Tier 2", "Tier 3"]

def test_storm_bonus_present():
    d = build()
    e = d["containers"]["weapons-crate"]["tiers"][0]["loot"][0]
    assert set(e) >= {"slug","name","chance","voyage","storm","stormBonus","moreInStorm","resolved"}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd sek/sand-expedition-kit && python -m pytest datamine/scripts/test_build_container_loot.py -q`
Expected: FAIL — artifact has no `meta` key / wrong path (converter still writes `datamine/container_loot.json`).

- [ ] **Step 4: Update the converter to read overrides + emit canonical artifact**

In `build_container_loot.py`, replace the inline `ALIAS` / `KNOWN_LIVE_SLUGS` block with a load from the override file, and change the output to the wrapped `{meta, containers}` shape written into sand-wiki.

Replace the alias definition block:

```python
# Hand-curated SEK id -> wiki slug aliases (cases the heuristics can't catch).
ALIAS = {
    "item_medkit": "med-kit",
    ...
}
KNOWN_LIVE_SLUGS = {"resource-weird-coral"}
slugset = {w["slug"] for w in wiki_items} | KNOWN_LIVE_SLUGS
```

with:

```python
# Corrections live in a committed override file so the pipeline is fully replayable.
OVERRIDES = json.load(open(os.path.join(ROOT, "datamine", "overrides", "loot-overrides.json"), encoding="utf-8"))
ALIAS = OVERRIDES["itemSlugAliases"]
KNOWN_LIVE_SLUGS = set(OVERRIDES["knownLiveSlugs"])
slugset = {w["slug"] for w in wiki_items} | KNOWN_LIVE_SLUGS
```

Replace the output block at the end:

```python
dest = os.path.normpath(os.path.join(ROOT, "datamine", "container_loot.json"))
json.dump(out, open(dest, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
```

with:

```python
artifact = {
    "meta": {"source": "loot_sources.json", "containers": len(out)},
    "containers": out,
}
dest = os.path.normpath(os.path.join(ROOT, "..", "..", "sand-wiki", "prisma", "loot-containers.json"))
json.dump(artifact, open(dest, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
```

(Keep the existing `print(...)` summary lines; update the final `print(f"wrote {dest}")`.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd sek/sand-expedition-kit && python -m pytest datamine/scripts/test_build_container_loot.py -q`
Expected: PASS (4 passed). Confirms `sand-wiki/prisma/loot-containers.json` now exists with `{meta, containers}`.

- [ ] **Step 6: Commit**

```bash
git add sek/sand-expedition-kit/datamine/overrides/loot-overrides.json \
        sek/sand-expedition-kit/datamine/scripts/build_container_loot.py \
        sek/sand-expedition-kit/datamine/scripts/test_build_container_loot.py \
        sand-wiki/prisma/loot-containers.json
git commit -m "feat(loot): converter emits canonical artifact from committed overrides"
```

---

## Task 2: Pure transform module + integrity test

**Files:**
- Create: `sand-wiki/prisma/loot-containers.ts`
- Test: `sand-wiki/prisma/loot-containers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sand-wiki/prisma/loot-containers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lootLinkRows, type LootContainersFile } from "./loot-containers";

const load = <T>(f: string): T => JSON.parse(readFileSync(join(__dirname, f), "utf-8")) as T;

describe("loot-containers artifact", () => {
  const file = load<LootContainersFile>("loot-containers.json");
  const data = load<{ items: { slug: string }[] }>("data.json");
  const overrides = load<{ knownLiveSlugs: string[] }>(
    "../../sek/sand-expedition-kit/datamine/overrides/loot-overrides.json",
  );

  it("every container is a loot-containers env", () => {
    for (const c of Object.values(file.containers)) expect(c.category).toBe("loot-containers");
  });

  it("every non-null loot slug exists in data.json or knownLiveSlugs", () => {
    const known = new Set([...data.items.map((i) => i.slug), ...overrides.knownLiveSlugs]);
    const missing = new Set<string>();
    for (const c of Object.values(file.containers))
      for (const t of c.tiers) for (const e of t.loot)
        if (e.slug && !known.has(e.slug)) missing.add(e.slug);
    expect([...missing].sort()).toEqual([]);
  });

  it("lootLinkRows flattens tiers with grouped sortOrder", () => {
    const c = { name: "X", category: "loot-containers", tiers: [
      { tier: "Tier 1", rollSets: 1, loot: [
        { slug: "a", name: "A", chance: 100, voyage: "1-2", storm: "2-3", stormBonus: 1.5, moreInStorm: true, resolved: true },
      ] },
      { tier: "Tier 2", rollSets: 1, loot: [
        { slug: "b", name: "B", chance: 50, voyage: "1", storm: "1", stormBonus: 1, moreInStorm: false, resolved: true },
      ] },
    ] };
    const rows = lootLinkRows(c);
    expect(rows.map((r) => [r.tier, r.slug, r.value1, r.value2, r.value3, r.sortOrder])).toEqual([
      ["Tier 1", "a", "100", "1-2", "2-3", 0],
      ["Tier 2", "b", "50", "1", "1", 1000],
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd sand-wiki && npm test -- loot-containers`
Expected: FAIL — `Cannot find module './loot-containers'`.

- [ ] **Step 3: Write the transform module**

Create `sand-wiki/prisma/loot-containers.ts`:

```typescript
export interface LootEntry {
  slug: string | null;
  name: string;
  chance: number | null;
  voyage: string | null;
  storm: string | null;
  stormBonus: number | null;
  moreInStorm: boolean | null;
  resolved: boolean;
}
export interface LootTier { tier: string; rollSets: number | null; loot: LootEntry[] }
export interface Container { name: string; icon?: string | null; category: string; tiers: LootTier[] }
export interface LootContainersFile { meta: { source: string; containers: number }; containers: Record<string, Container> }

export interface LootLinkRow {
  tier: string;
  slug: string | null;
  name: string;
  value1: string | null; // chance (%)
  value2: string | null; // voyage qty
  value3: string | null; // storm qty
  sortOrder: number;
}

/** Flatten a container's tiers into loot link rows. Global sortOrder keeps tiers
 *  grouped and ordered: tierIndex * 1000 + entryIndex (mirrors seed.ts). */
export function lootLinkRows(c: Container): LootLinkRow[] {
  const rows: LootLinkRow[] = [];
  c.tiers.forEach((t, ti) => {
    t.loot.forEach((e, ei) => {
      rows.push({
        tier: t.tier,
        slug: e.slug,
        name: e.name,
        value1: e.chance == null ? null : String(e.chance),
        value2: e.voyage,
        value3: e.storm,
        sortOrder: ti * 1000 + ei,
      });
    });
  });
  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd sand-wiki && npm test -- loot-containers`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/prisma/loot-containers.ts sand-wiki/prisma/loot-containers.test.ts
git commit -m "feat(loot): pure loot-containers transform + artifact integrity test"
```

---

## Task 3: The loader

**Files:**
- Create: `sand-wiki/prisma/load-loot-containers.ts`
- Modify: `sand-wiki/package.json`

- [ ] **Step 1: Write the loader**

Create `sand-wiki/prisma/load-loot-containers.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lootLinkRows, type LootContainersFile } from "./loot-containers";

const prisma = new PrismaClient();

/**
 * Scrape-authoritative loader for datamined loot containers
 * (prisma/loot-containers.json). FULL OVERWRITE by design:
 *   - upserts each container as Entity(kind="environment", category="loot-containers"),
 *   - deletes + recreates that container's role="loot" EntityLinks,
 *   - prunes loot-containers entities absent from the artifact.
 * Touches ONLY loot-containers entities and their loot links. Idempotent.
 * Targets whatever DATABASE_URL points at — run against the dev branch first.
 */
async function main() {
  const file: LootContainersFile = JSON.parse(
    readFileSync(join(__dirname, "loot-containers.json"), "utf-8"),
  );
  const entries = Object.entries(file.containers);

  // Resolve every non-null loot slug to an item id up front; fail loud.
  const slugs = [...new Set(entries.flatMap(([, c]) => lootLinkRows(c).map((r) => r.slug).filter((s): s is string => !!s)))];
  const items = await prisma.entity.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const idBySlug = new Map(items.map((i) => [i.slug, i.id]));
  const missing = slugs.filter((s) => !idBySlug.has(s));
  if (missing.length) throw new Error(`Loot slugs not in DB (create them first): ${missing.join(", ")}`);

  let containers = 0, links = 0;
  for (const [slug, c] of entries) {
    const entity = await prisma.entity.upsert({
      where: { slug },
      create: { slug, kind: "environment", category: c.category, name: c.name, icon: c.icon ?? null, curated: true },
      update: { category: c.category, name: c.name, icon: c.icon ?? null, curated: true },
    });
    await prisma.entityLink.deleteMany({ where: { sourceId: entity.id, role: "loot" } });
    const rows = lootLinkRows(c);
    await prisma.entityLink.createMany({
      data: rows.map((r) => ({
        sourceId: entity.id,
        targetId: r.slug ? idBySlug.get(r.slug)! : null,
        role: "loot",
        name: r.name,
        tier: r.tier,
        value1: r.value1,
        value2: r.value2,
        value3: r.value3,
        sortOrder: r.sortOrder,
      })),
    });
    containers++; links += rows.length;
    console.log(`  ✓ ${slug} (${rows.length} drops)`);
  }

  // Prune loot-containers entities no longer in the artifact (full sync).
  const keep = entries.map(([slug]) => slug);
  const pruned = await prisma.entity.deleteMany({
    where: { kind: "environment", category: "loot-containers", slug: { notIn: keep } },
  });

  console.log(`Loaded ${containers} containers, ${links} loot links. Pruned ${pruned.count} stale container(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add npm scripts**

In `sand-wiki/package.json`, add to `scripts` (after `db:load-curated-extras`):

```json
    "loot:build": "python ../sek/sand-expedition-kit/datamine/scripts/build_container_loot.py",
    "db:load-loot-containers": "tsx prisma/load-loot-containers.ts",
    "loot:update": "npm run loot:build && npm run db:load-loot-containers",
    "loot:promote": "node -e \"if(process.env.LOOT_TARGET!=='prod'){console.error('Refusing: set LOOT_TARGET=prod to promote');process.exit(1)}\" && tsx prisma/load-loot-containers.ts",
```

- [ ] **Step 3: Run the loader against the dev branch DB**

Run: `cd sand-wiki && npm run db:load-loot-containers`
Expected: prints `✓` per container and `Loaded 12 containers, ~201 loot links. Pruned N stale container(s).`
- If it throws `Loot slugs not in DB`, that slug must be created in the branch DB first (see spec transition note) — fix and re-run.
- **CAUTION (verify on the safe branch):** the prune deletes ALL `loot-containers` envs not in the datamined keep-list — including any pre-existing wiki-scraped ones (e.g. `crate-of-shells`, `food-crate` under a different slug). This is intended under "scrape authoritative," but before the first prod promote, eyeball the pruned list and confirm none carried key-links/recipes you want to keep. To preview without deleting, comment out the `deleteMany` prune block and inspect `prisma.entity.findMany({where:{kind:'environment',category:'loot-containers'}})` first.

- [ ] **Step 4: Verify idempotency — run it again**

Run: `cd sand-wiki && npm run db:load-loot-containers`
Expected: identical summary; no duplicate links (delete+recreate guarantees this).

- [ ] **Step 5: Spot-check in the DB**

Run: `cd sand-wiki && npx tsx -e "import {PrismaClient} from '@prisma/client';const p=new PrismaClient();p.entityLink.count({where:{role:'loot',source:{category:'loot-containers'}}}).then(n=>console.log('loot links:',n)).finally(()=>p.$disconnect())"`
Expected: a non-zero count matching the loader summary.

- [ ] **Step 6: Commit**

```bash
git add sand-wiki/prisma/load-loot-containers.ts sand-wiki/package.json
git commit -m "feat(loot): scrape-authoritative loader + loot:update/promote scripts"
```

---

## Task 4: UI data plumbing (value2/value3 + storm bonus)

**Files:**
- Modify: `sand-wiki/src/lib/entity-links.ts`
- Modify: `sand-wiki/src/lib/loot.ts`
- Modify: `sand-wiki/src/app/environment/[slug]/page.tsx:53-63`
- Test: `sand-wiki/src/lib/loot.test.ts`

- [ ] **Step 1: Write the failing view-layer test**

Create `sand-wiki/src/lib/loot.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { lootEntryView } from "./loot";
import type { LinkRow } from "./entity-links";

const base: LinkRow = {
  targetSlug: "med-kit", targetKind: "item", name: "Med Kit", icon: null, rarity: null,
  amount: null, tier: "Tier 1", value1: "50", value2: "1-2", value3: "3-4", sortOrder: 0,
};

describe("lootEntryView", () => {
  it("surfaces chance/voyage/storm and derives the storm bonus", () => {
    const v = lootEntryView(base);
    expect(v.chance).toBe("50%");
    expect(v.voyage).toBe("1-2");
    expect(v.storm).toBe("3-4");
    expect(v.moreInStorm).toBe(true);
    expect(v.stormBonus).toBeCloseTo(2.33, 2); // avg 3.5 / avg 1.5
  });

  it("handles missing values (legacy value1-only rows)", () => {
    const v = lootEntryView({ ...base, value1: null, value2: null, value3: null });
    expect(v.chance).toBeNull();
    expect(v.moreInStorm).toBe(false);
    expect(v.stormBonus).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd sand-wiki && npm test -- loot.test`
Expected: FAIL — `value2` not on `LinkRow`; `chance` not on `LootEntryView`.

- [ ] **Step 3: Extend `LinkRow`**

In `src/lib/entity-links.ts`, add two fields to the `LinkRow` interface after `value1`:

```typescript
  value1: string | null;
  value2: string | null;
  value3: string | null;
```

- [ ] **Step 4: Extend `LootEntryView` + derive the bonus**

Replace the body of `src/lib/loot.ts` with:

```typescript
import { entityHref, type LinkRow } from "./entity-links";

/** Display-ready loot entry: identity + drop chance and voyage/storm quantities. */
export interface LootEntryView {
  name: string;
  icon: string | null;
  rarity: string | null;
  href: string | null;
  chance: string | null;   // e.g. "50%"
  voyage: string | null;   // e.g. "1-2"
  storm: string | null;    // e.g. "3-4"
  stormBonus: number | null; // avg storm / avg voyage
  moreInStorm: boolean;
}

/** Average of a "min-max" or "n" range string; null if unparseable. */
function rangeAvg(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const lo = Number(m[1]); const hi = m[2] ? Number(m[2]) : lo;
  return (lo + hi) / 2;
}

export function lootEntryView(e: LinkRow): LootEntryView {
  const href = e.targetSlug ? entityHref(e.targetKind, e.targetSlug) : null;
  const v = rangeAvg(e.value2); const s = rangeAvg(e.value3);
  const stormBonus = v && s && v > 0 ? Math.round((s / v) * 100) / 100 : null;
  return {
    name: e.name, icon: e.icon, rarity: e.rarity, href,
    chance: e.value1 == null ? null : `${e.value1}%`,
    voyage: e.value2, storm: e.value3,
    stormBonus,
    moreInStorm: v != null && s != null && s > v,
  };
}
```

- [ ] **Step 5: Map the new fields in the environment page**

In `src/app/environment/[slug]/page.tsx`, in the `lootRows` map (around line 53-63), add after `value1: l.value1,`:

```typescript
    value1: l.value1,
    value2: l.value2,
    value3: l.value3,
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd sand-wiki && npm test -- loot.test`
Expected: PASS (2 passed).

- [ ] **Step 7: Typecheck the whole app**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: no errors (any other `LinkRow` constructor now needs `value2`/`value3` — if `LinkPicker.tsx` or `contribute/actions.ts` fail, add `value2: null, value3: null` to their row literals).

- [ ] **Step 8: Commit**

```bash
git add sand-wiki/src/lib/entity-links.ts sand-wiki/src/lib/loot.ts \
        sand-wiki/src/lib/loot.test.ts "sand-wiki/src/app/environment/[slug]/page.tsx"
git commit -m "feat(loot): plumb chance + voyage/storm through the loot view layer"
```

---

## Task 5: Generalize tier ordering

**Files:**
- Modify: `sand-wiki/src/lib/entity-links.ts`
- Test: `sand-wiki/src/lib/entity-links.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `sand-wiki/src/lib/entity-links.test.ts`:

```typescript
import { groupLootByTier } from "./entity-links";

const row = (tier: string, sortOrder = 0) => ({
  targetSlug: null, targetKind: null, name: "x", icon: null, rarity: null,
  amount: null, tier, value1: null, value2: null, value3: null, sortOrder,
});

describe("groupLootByTier ordering", () => {
  it("sorts numeric Tier N labels in order, others after", () => {
    const groups = groupLootByTier([row("Tier 3"), row("Tier 1"), row("Drops"), row("Tier 2")]);
    expect(groups.map((g) => g.tier)).toEqual(["Tier 1", "Tier 2", "Tier 3", "Drops"]);
  });

  it("still orders the legacy rarity tiers", () => {
    const groups = groupLootByTier([row("Very Rare"), row("Normal"), row("Rare")]);
    expect(groups.map((g) => g.tier)).toEqual(["Normal", "Rare", "Very Rare"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd sand-wiki && npm test -- entity-links`
Expected: FAIL — `Tier 10`-style/`Drops` ordering wrong (all unknown tiers tie at the same rank).

- [ ] **Step 3: Generalize the `rank` function**

In `src/lib/entity-links.ts`, replace the `rank` helper inside `groupLootByTier`:

```typescript
  const rank = (t: string) => {
    const m = t.match(/^Tier (\d+)$/);
    if (m) return Number(m[1]);                 // Tier 1..N first, numerically
    const i = TIER_ORDER.indexOf(t);
    if (i !== -1) return 100 + i;               // legacy Normal/Rare/Very Rare next
    return t === "Other" ? 1000 : 500;          // Other last; everything else between
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd sand-wiki && npm test -- entity-links`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/entity-links.ts sand-wiki/src/lib/entity-links.test.ts
git commit -m "feat(loot): order Tier 1/2/3 labels numerically, legacy tiers after"
```

---

## Task 6: Loot table UI (frontend-design)

**Files:**
- Modify: `sand-wiki/src/components/LootTable.tsx`

- [ ] **Step 1: Invoke the frontend-design skill**

This task is visual. Invoke the `frontend-design:frontend-design` skill and design a per-tier loot table that renders, for each `LootEntryView`: the item (icon + name + rarity, linked via `href`), **Chance**, **Voyage**, and **Storm** columns, with the storm bonus visually emphasised when `moreInStorm` is true (e.g. a subtle up-arrow / accent on the Storm cell, tooltip `×{stormBonus}`). Reuse `SortableTable` (see `src/components/CraftTable.tsx` and `BuyOptions.tsx` for the column/row API) and `ItemIcon`/`ItemIconLink` for the item cell. Keep the empty-value fallback (legacy rows with no chance/qty render the item with blank cells). Dark-only theme, matching the existing shadcn/Tailwind components.

- [ ] **Step 2: Reference — current component being replaced**

`src/components/LootTable.tsx` currently renders an icon grid and takes `{ entries: LootEntryView[] }`. Keep the same prop name/shape so [environment/[slug]/page.tsx](sand-wiki/src/app/environment/[slug]/page.tsx) needs no change. `LootEntryView` now carries `chance`, `voyage`, `storm`, `stormBonus`, `moreInStorm`.

- [ ] **Step 3: Add a render test**

Add `src/components/LootTable.test.tsx` (or extend an existing component test) asserting that given an entry with `chance:"50%"`, `voyage:"1-2"`, `storm:"3-4"`, `moreInStorm:true`, the rendered output contains "50%", "1-2", "3-4". Use the project's existing component-test setup (vitest + testing-library; see any existing `*.test.tsx`). If no component tests exist yet, assert via `renderToStaticMarkup`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LootTable } from "./LootTable";

describe("LootTable", () => {
  it("renders chance and both quantities", () => {
    const html = renderToStaticMarkup(
      <LootTable entries={[{ name: "Med Kit", icon: null, rarity: null, href: "/items/med-kit",
        chance: "50%", voyage: "1-2", storm: "3-4", stormBonus: 2.33, moreInStorm: true }]} />,
    );
    expect(html).toContain("50%");
    expect(html).toContain("1-2");
    expect(html).toContain("3-4");
  });
});
```

- [ ] **Step 4: Run the test + typecheck**

Run: `cd sand-wiki && npm test -- LootTable && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Visually verify on the dev site**

Run: `cd sand-wiki && npm run dev`, open an environment page for a loaded container (e.g. `/environment/weapons-crate`), confirm tier tabs show Tier 1/2/3 with chance + voyage/storm columns and the storm-bonus emphasis.

- [ ] **Step 6: Commit**

```bash
git add sand-wiki/src/components/LootTable.tsx sand-wiki/src/components/LootTable.test.tsx
git commit -m "feat(loot): rich per-tier loot table with chance + voyage/storm"
```

---

## Task 7: Reverse view — chance/amount on item pages

**Files:**
- Modify: `sand-wiki/src/lib/queries.ts` (`getCratesContaining`, `CrateDrop`)
- Modify: `sand-wiki/src/components/CrateDropList.tsx`

- [ ] **Step 1: Widen the query + type**

In `src/lib/queries.ts`, extend `CrateDrop` and `getCratesContaining`:

```typescript
export interface CrateDrop { crateSlug: string; crateName: string; tier: string; chance: string | null }
```

In `getCratesContaining`, the `findMany` already returns all scalar fields via the row; change the final map to include chance:

```typescript
  return rows.map((r) => ({
    crateSlug: r.source.slug, crateName: r.source.name, tier: r.tier ?? "",
    chance: r.value1 == null ? null : `${r.value1}%`,
  }));
```

- [ ] **Step 2: Show chance in the reverse list**

In `src/components/CrateDropList.tsx`, the `byCrate` aggregation currently joins tier labels. Append the chance to each tier label when present so the existing two-column table needs no structural change:

```typescript
  for (const d of drops) {
    const e = byCrate.get(d.crateSlug) ?? { name: d.crateName, tiers: [] };
    const label = d.chance ? `${d.tier} (${d.chance})` : d.tier;
    if (!e.tiers.includes(label)) e.tiers.push(label);
    byCrate.set(d.crateSlug, e);
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify on the dev site**

Run (dev server already running): open an item that drops from a container (e.g. `/items/med-kit`), confirm the "Crates that drop this item" table shows the tier with a chance suffix.

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/queries.ts sand-wiki/src/components/CrateDropList.tsx
git commit -m "feat(loot): show drop chance in the item-page crate reverse view"
```

---

## Task 8: Full pipeline dry-run + docs

**Files:**
- Modify: `sek/sand-expedition-kit/datamine/UPDATE_PIPELINE.md`

- [ ] **Step 1: Run the end-to-end update command**

Run: `cd sand-wiki && npm run loot:update`
Expected: converter prints `100.0% resolved` + writes the artifact; loader prints the `Loaded N containers` summary. The `git diff sand-wiki/prisma/loot-containers.json` is the reviewable change surface.

- [ ] **Step 2: Run the whole test suite**

Run: `cd sand-wiki && npm test`
Expected: all green, including the new loot tests.
Run: `cd sek/sand-expedition-kit && python -m pytest datamine/scripts -q`
Expected: green.

- [ ] **Step 3: Document the update procedure**

Append a section to `sek/sand-expedition-kit/datamine/UPDATE_PIPELINE.md` describing the loot path: `npm run loot:update` (dev), inspect dev site, `LOOT_TARGET=prod npm run loot:promote` (prod), and that corrections go in `overrides/loot-overrides.json` (never hand-edited in the DB). Note the reusable `build_X / X.json / load-X` convention for future datasets.

- [ ] **Step 4: Commit**

```bash
git add sek/sand-expedition-kit/datamine/UPDATE_PIPELINE.md sand-wiki/prisma/loot-containers.json
git commit -m "docs(loot): document the loot update + promote workflow"
```

---

## Self-Review Notes

- **Spec coverage:** ① converter+overrides → Task 1; canonical artifact → Tasks 1-2; loader full-overwrite+prune+fail-loud → Task 3; npm scripts dev/prod → Task 3; UI plumbing → Task 4; tier ordering → Task 5; loot table UI → Task 6; reverse view → Task 7; extensibility docs + dry-run → Task 8. Testing (Python/loader/UI) covered in Tasks 1, 2, 4, 5, 6.
- **Transition concern** (slugs must exist in target DB): enforced by the loader's fail-loud check (Task 3 Step 3) and the integrity test (Task 2).
- **Backward compatibility:** legacy `value1`-only loot rows render with blank chance/qty (Task 4 Step 4 handles null; Task 6 keeps the fallback).
- **Open item for executor:** if `npx tsc --noEmit` flags other `LinkRow` literals (LinkPicker, contribute actions), add `value2: null, value3: null` — called out in Task 4 Step 7.
```
