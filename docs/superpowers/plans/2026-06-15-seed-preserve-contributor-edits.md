# Seed Hardening: Preserve Contributor Field Edits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `prisma/seed.ts` never overwrite an entity field that a contributor edited via the wiki contribute flow, on every seed run (including `--force`), with no schema change.

**Architecture:** Two pure helpers in a new `src/lib/seed-curation.ts` — `buildLockMap` (folds applied `edit` proposals into `Map<slug, Set<editedField>>`) and `omitLocked` (drops locked keys from an upsert payload) — plus `lockedHits` for a visibility log line. The seed loads the lock map once and filters the **`update`** side of the item/env/trampler upserts; the `create` side stays full (new rows have no proposals). Driven entirely by the `Proposal` table — `applyProposal`, the proposal schema, and the contribute UI are unchanged.

**Tech Stack:** Next.js 16 / Prisma 6 / Postgres (Neon), TypeScript, Vitest. App lives in `sand-wiki/`.

**Spec:** `docs/superpowers/specs/2026-06-14-seed-preserve-contributor-edits-design.md`

---

## Pre-flight (controller, before Task 1)

The feature branch `feat/seed-preserve-edits` currently holds only the spec commit and may be based on an older `master`. **Before implementing, rebase/recreate it onto the current `master` tip** so edits land on current code:

```bash
cd /d/Documents/SandLabs
git fetch 2>/dev/null; git log --oneline -1 master
git rebase master            # from feat/seed-preserve-edits, onto current master
# resolve trivially if needed; the only branch commit is the spec doc
```
Confirm `sand-wiki/prisma/seed.ts` matches the line references below (item upsert ~124–128, env upsert ~185–189, trampler upsert ~242–246). If they've shifted, locate the same `prisma.entity.upsert(...)` blocks by content rather than line number.

**Tooling note (Windows):** run npm/npx from `sand-wiki/`. Tests: `npx vitest run <path>` (or `node_modules/.bin/vitest`). Type-check: `node_modules/.bin/tsc --noEmit -p tsconfig.json`. Use git paths relative to the current dir.

---

## Task 1: Pure curation helpers (`seed-curation.ts`)

**Files:**
- Create: `sand-wiki/src/lib/seed-curation.ts`
- Test: `sand-wiki/src/lib/seed-curation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sand-wiki/src/lib/seed-curation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLockMap, omitLocked, lockedHits } from "./seed-curation";

describe("buildLockMap", () => {
  it("folds applied-edit proposal change-keys into a slug -> field-set map", () => {
    const m = buildLockMap([
      { targetSlug: "rocket-ammo", changes: { rarity: { old: "Rare", new: "Noteworthy" } } },
      { targetSlug: "rocket-ammo", changes: { description: { old: "a", new: "b" } } },
      { targetSlug: "health-emitter", changes: { rarity: { old: "Common", new: "Experimental" } } },
    ]);
    expect(m.get("rocket-ammo")).toEqual(new Set(["rarity", "description"]));
    expect(m.get("health-emitter")).toEqual(new Set(["rarity"]));
  });

  it("ignores rows with no slug, no changes, or empty changes", () => {
    const m = buildLockMap([
      { targetSlug: null, changes: { rarity: { old: 1, new: 2 } } },
      { targetSlug: "x", changes: null },
      { targetSlug: "y", changes: {} },
    ]);
    expect(m.size).toBe(0);
  });
});

describe("omitLocked", () => {
  it("drops locked keys and keeps the rest (returns a copy)", () => {
    const payload = { name: "N", rarity: "Common", category: "ammo" };
    const out = omitLocked(payload, new Set(["rarity"]));
    expect(out).toEqual({ name: "N", category: "ammo" });
    expect(out).not.toBe(payload);
  });

  it("is a no-op copy when locked is undefined or empty", () => {
    const payload = { rarity: "Common" };
    expect(omitLocked(payload, undefined)).toEqual({ rarity: "Common" });
    expect(omitLocked(payload, new Set())).toEqual({ rarity: "Common" });
  });
});

describe("lockedHits", () => {
  it("counts defined payload keys that are locked", () => {
    expect(lockedHits({ rarity: "Common", magazine: 5, damage: undefined }, new Set(["rarity", "damage"]))).toBe(1);
  });
  it("returns 0 when nothing is locked", () => {
    expect(lockedHits({ rarity: "Common" }, undefined)).toBe(0);
    expect(lockedHits({ rarity: "Common" }, new Set())).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/seed-curation.test.ts`
Expected: FAIL — module `./seed-curation` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `sand-wiki/src/lib/seed-curation.ts`:

```ts
/** Contributor-edit protection for the seed.
 *  Applied `edit` proposals record exactly which fields a contributor changed (the keys of
 *  `Proposal.changes`). The seed uses these to skip overwriting those fields on re-seed. */

/** Fold applied `edit` proposals into `Map<slug, Set<editedFieldName>>`.
 *  Skips rows with no slug / no object changes / empty changes. Caller is responsible for
 *  passing only `status:"applied", kind:"edit"` proposals. */
export function buildLockMap(
  proposals: { targetSlug: string | null; changes: unknown }[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of proposals) {
    if (!p.targetSlug || !p.changes || typeof p.changes !== "object") continue;
    const fields = Object.keys(p.changes as Record<string, unknown>);
    if (fields.length === 0) continue;
    const set = map.get(p.targetSlug) ?? new Set<string>();
    for (const f of fields) set.add(f);
    map.set(p.targetSlug, set);
  }
  return map;
}

/** Shallow copy of `payload` with every locked key removed. No-op copy when `locked` is
 *  empty/undefined. Only the keys present in `payload` matter, so an unknown locked name
 *  is harmless. */
export function omitLocked<T extends Record<string, unknown>>(
  payload: T,
  locked?: ReadonlySet<string>,
): Partial<T> {
  if (!locked || locked.size === 0) return { ...payload };
  const out: Partial<T> = {};
  for (const k of Object.keys(payload) as (keyof T & string)[]) {
    if (!locked.has(k)) out[k] = payload[k];
  }
  return out;
}

/** Count of defined `payload` values whose key is locked — i.e. fields this seed run would
 *  have overwritten but is now preserving. For the seed's visibility log. */
export function lockedHits(payload: Record<string, unknown>, locked?: ReadonlySet<string>): number {
  if (!locked || locked.size === 0) return 0;
  let n = 0;
  for (const k of Object.keys(payload)) if (payload[k] !== undefined && locked.has(k)) n++;
  return n;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/lib/seed-curation.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/seed-curation.ts sand-wiki/src/lib/seed-curation.test.ts
git commit -m "feat(seed): pure helpers to preserve contributor-edited fields"
```
(End every commit body with a blank line then `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.)

---

## Task 2: Wire protection into the seed

**Files:**
- Modify: `sand-wiki/prisma/seed.ts` (imports; lock-map load before the item loop; item/env/trampler upsert `update` payloads; summary log)

- [ ] **Step 1: Add the import**

At the top of `prisma/seed.ts`, after the existing `seed-transform` import (line ~6), add:

```ts
import { buildLockMap, omitLocked, lockedHits } from "../src/lib/seed-curation";
```

- [ ] **Step 2: Load the lock map + counters before the item loop**

Immediately after the `const enrichment = JSON.parse(...)` block (ends ~line 86) and before the `// --- Items:` comment (line ~88), insert:

```ts
  // Contributor field edits (applied "edit" proposals) are preserved across re-seeds: the
  // upsert `update` omits any field a contributor edited. `create` stays full (new rows have
  // no proposals). Applies even under --force — there is no bypass. See seed-curation.ts.
  const lockMap = buildLockMap(
    await prisma.proposal.findMany({
      where: { status: "applied", kind: "edit" },
      select: { targetSlug: true, changes: true },
    }),
  );
  let preservedFields = 0;
  const preservedSlugs = new Set<string>();
```

- [ ] **Step 3: Filter the ITEM upsert update payload**

Replace the item `prisma.entity.upsert({...})` call (lines ~124–128):

```ts
    await prisma.entity.upsert({
      where: { slug: i.slug },
      create: { slug: i.slug, kind: "item", ...identity, itemStats: { create: stats } },
      update: { ...identity, itemStats: { upsert: { create: stats, update: stats } } },
    });
```

with:

```ts
    const locked = lockMap.get(i.slug);
    const hits = lockedHits({ ...identity, ...stats }, locked);
    if (hits > 0) { preservedFields += hits; preservedSlugs.add(i.slug); }
    await prisma.entity.upsert({
      where: { slug: i.slug },
      create: { slug: i.slug, kind: "item", ...identity, itemStats: { create: stats } },
      update: { ...omitLocked(identity, locked), itemStats: { upsert: { create: stats, update: omitLocked(stats, locked) } } },
    });
```

- [ ] **Step 4: Filter the ENVIRONMENT upsert update payload**

Replace the env `prisma.entity.upsert({...})` call (lines ~185–189):

```ts
    const entity = await prisma.entity.upsert({
      where: { slug },
      create: { slug, kind: "environment", ...scraped },
      update: scraped,
    });
```

with:

```ts
    const lockedEnv = lockMap.get(slug);
    const envHits = lockedHits(scraped, lockedEnv);
    if (envHits > 0) { preservedFields += envHits; preservedSlugs.add(slug); }
    const entity = await prisma.entity.upsert({
      where: { slug },
      create: { slug, kind: "environment", ...scraped },
      update: omitLocked(scraped, lockedEnv),
    });
```

- [ ] **Step 5: Filter the TRAMPLER upsert update payload**

Replace the trampler `prisma.entity.upsert({...})` call (lines ~242–246):

```ts
    const part = await prisma.entity.upsert({
      where: { slug },
      create: { slug, kind: "trampler-part", ...identity, tramplerStats: { create: stats } },
      update: { ...identity, tramplerStats: { upsert: { create: stats, update: stats } } },
    });
```

with:

```ts
    const lockedT = lockMap.get(slug);
    const tHits = lockedHits({ ...identity, ...stats }, lockedT);
    if (tHits > 0) { preservedFields += tHits; preservedSlugs.add(slug); }
    const part = await prisma.entity.upsert({
      where: { slug },
      create: { slug, kind: "trampler-part", ...identity, tramplerStats: { create: stats } },
      update: { ...omitLocked(identity, lockedT), tramplerStats: { upsert: { create: stats, update: omitLocked(stats, lockedT) } } },
    });
```

- [ ] **Step 6: Add the summary log**

In the final `console.log("Seeded ...")` area (after line ~390, before the closing `}` of `main`), add a line right before that final summary `console.log`:

```ts
  if (preservedFields > 0) {
    console.log(`Preserved ${preservedFields} contributor-edited field(s) across ${preservedSlugs.size} entit(ies) (not overwritten by source).`);
  }
```

- [ ] **Step 7: Type-check**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: exit 0. If Prisma's `EntityUpdateInput` rejects the `Partial<...>` spread, cast at the call site, e.g. `...(omitLocked(identity, locked) as typeof identity)`. (Prisma update inputs are all-optional, so this should compile without a cast.)

- [ ] **Step 8: Run the unit suite (no DB touched)**

Run: `npx vitest run`
Expected: all tests pass (vitest does not execute the seed).

- [ ] **Step 9: Commit**

```bash
git add sand-wiki/prisma/seed.ts
git commit -m "feat(seed): never overwrite contributor-edited fields (per-field, all runs)"
```

---

## Task 3: Update `instructions.md` to reflect the new protection

The current 🚨 note says re-seeding reverts contributor field edits. After this change that's no longer true for **applied-proposal** edits — update the note so it's accurate (while keeping the standing caution that link recreation + Directus-only edits are still affected).

**Files:**
- Modify: `sand-wiki/instructions.md` (the "🚨 DO NOT re-seed" block in the Data pipeline section)

- [ ] **Step 1: Replace the 🚨 block**

Find the block that begins `> **🚨 DO NOT re-seed the live DB — `curated` does NOT protect field values.**` and replace that entire block with:

```markdown
> **Re-seed & contributor field edits.** As of the 2026-06 seed-curation change, the seed
> **preserves every field a contributor edited via the contribute flow**: at start it reads
> applied `edit` proposals (`buildLockMap` in `src/lib/seed-curation.ts`) and the item/env/
> trampler upserts omit those fields from the `update` (even under `--force`; no bypass). So a
> re-seed no longer reverts manual `rarity`/`description`/stat edits. Caveats that REMAIN:
> - **Directus-only edits are NOT protected** — only edits recorded as applied proposals are.
> - The seed still **delete+recreates loot/cost/tech links** for non-`lootCurated` rows, and
>   still upserts source values for fields the contributor never touched.
> So: still prefer surgical loaders (`db:load-*`) for data changes, and don't run `db:seed`
> casually. Background: a 2026-06-14 `db:seed:force` reverted ~42 rarity edits before this
> protection existed; they were recovered from the `Proposal` table.
```

- [ ] **Step 2: Commit**

```bash
git add sand-wiki/instructions.md
git commit -m "docs: seed now preserves contributor field edits (update re-seed note)"
```

---

## Task 4: Verification on a disposable Neon branch (controller-run; needs Neon API key)

> Run by the controller, not a subagent. **Never seed the live `production` branch.** This proves the hardened seed preserves edits by seeding a throwaway copy and asserting. Requires a Neon **management** API key (`napi_…`); ask the user for one at this step (it can be revoked after).

- [ ] **Step 1: Create a disposable branch of production (current state)**

```bash
KEY="<napi_...>"; PROJ="long-unit-01036276"; PARENT="br-cool-boat-a2on95k9"
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  "https://console.neon.tech/api/v2/projects/$PROJ/branches" \
  -d "{\"branch\":{\"name\":\"seedtest\",\"parent_id\":\"$PARENT\"},\"endpoints\":[{\"type\":\"read_write\"}]}"
```
Note the new `branch.id` and the endpoint `host` from the response.

- [ ] **Step 2: Build the branch connection string**

Take `DATABASE_URL` from `sand-wiki/.env`, swap the host for the new branch endpoint host (branch roles inherit the parent password):
```bash
node -e "const fs=require('fs');const u=new URL(fs.readFileSync('sand-wiki/.env','utf8').match(/DATABASE_URL=\"?([^\"\n]+)/)[1]);u.host='<NEW_BRANCH_HOST>';require('fs').writeFileSync('/tmp/seedtest_url.txt',u.toString());console.log('ok')"
```

- [ ] **Step 3: Record a few known contributor-edited values on the branch (baseline)**

```bash
cd sand-wiki
DATABASE_URL="$(cat /tmp/seedtest_url.txt)" node_modules/.bin/tsx -e "import {PrismaClient} from '@prisma/client';const p=new PrismaClient();(async()=>{for(const s of['rocket-launcher-ammo-armor-piercing','health-emitter','projectile-amplifier']){const e=await p.entity.findUnique({where:{slug:s},select:{rarity:true}});console.log(s,e&&e.rarity);}await p.\$disconnect();})()"
```
Expected: `rocket-launcher-ammo-armor-piercing Noteworthy`, `health-emitter Experimental`, `projectile-amplifier Experimental`.

- [ ] **Step 4: Run the HARDENED seed against the BRANCH (never live)**

```bash
cd sand-wiki
DATABASE_URL="$(cat /tmp/seedtest_url.txt)" npx tsx prisma/seed.ts --force
```
Expected: completes; logs `Preserved <N> contributor-edited field(s) across <M> entit(ies)`.

- [ ] **Step 5: Re-check the same values — they must be UNCHANGED**

```bash
cd sand-wiki
DATABASE_URL="$(cat /tmp/seedtest_url.txt)" node_modules/.bin/tsx -e "import {PrismaClient} from '@prisma/client';const p=new PrismaClient();(async()=>{const want={'rocket-launcher-ammo-armor-piercing':'Noteworthy','health-emitter':'Experimental','projectile-amplifier':'Experimental'};let ok=true;for(const [s,exp] of Object.entries(want)){const e=await p.entity.findUnique({where:{slug:s},select:{rarity:true}});const got=e&&e.rarity;console.log(s,'want',exp,'got',got,got===exp?'OK':'FAIL');if(got!==exp)ok=false;}console.log(ok?'VERIFY PASS':'VERIFY FAIL');await p.\$disconnect();})()"
```
Expected: all `OK` and `VERIFY PASS`. (Optionally also confirm a non-edited item's rarity equals its source/enrichment value, proving untouched fields still refresh.)

- [ ] **Step 6: Delete the disposable branch + temp file**

```bash
curl -s -X DELETE -H "Authorization: Bearer $KEY" "https://console.neon.tech/api/v2/projects/$PROJ/branches/<NEW_BRANCH_ID>"
rm -f /tmp/seedtest_url.txt
```
Confirm only `production` remains. (No commit — verification only.)

---

## Final verification

- [ ] `cd sand-wiki && npx vitest run` → all pass (incl. the 3 new `seed-curation` suites).
- [ ] `cd sand-wiki && node_modules/.bin/tsc --noEmit -p tsconfig.json` → exit 0.
- [ ] `cd sand-wiki && npm run lint` → no new errors.
- [ ] Task 4 disposable-branch verification returned **VERIFY PASS**.

---

## Self-review notes

- **Spec coverage:** §Design.1 lock-set builder → Task 1 `buildLockMap`; §Design.2 field filter → Task 1 `omitLocked` + Task 2 Steps 3–5; §Design.3 where-it-applies (item/env/trampler) → Task 2 Steps 3/4/5; §Design.4 unconditional + log → Task 2 (no `--force` gate; Step 6 log); §Design.5 edge cases → Task 1 tests (null slug / empty changes / unknown key harmless); §Design.6 testing → Task 1 (unit) + Task 4 (disposable-branch integration); §Decision "unconditional, no bypass" → filter runs regardless of `--force`. Spec §Non-goals respected (no schema change, no `applyProposal` change, no Directus protection). `instructions.md` accuracy → Task 3.
- **Type consistency:** `buildLockMap(proposals) -> Map<string, Set<string>>`; `omitLocked(payload, locked?) -> Partial<T>`; `lockedHits(payload, locked?) -> number`. Same names/signatures used in seed Task 2. Lock-map keyed by slug; `Entity.slug` is globally unique so one map serves all kinds.
- **Field-name alignment:** `Proposal.changes` keys are the editable field names (`rarity`, `description`, `category`, `name`, `sourceUrl`, and stat names like `magazine`/`statValue`), which match the seed's `identity`/`stats` payload keys — proven by the 2026-06-14 recovery. `omitLocked` filters whichever payload contains the key, so no Entity-vs-stat partition is needed.
- **Order dependency:** Task 1 (helpers) before Task 2 (seed import). Task 4 runs after Tasks 1–2 are on the branch.
