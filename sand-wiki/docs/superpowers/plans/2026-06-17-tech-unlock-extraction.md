# Tech-Unlock → Buy-Option Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-populate, for every item the tech tree unlocks, a price-less buy option carrying the `buy-unlock` link (item → node) + a `buy-yield` of 1, derived from existing `tech-unlocks` EntityLinks — so prices can be added by hand later.

**Architecture:** A pure planner decides which `(item, node)` options to create (deduped against existing `buy-unlock` links); a transactional DB routine inserts them; a one-time `tsx` script runs it. The option validator is relaxed to allow unlock-only options, and the public item page filters to priced options so the price-less scaffolds stay hidden until priced. Builds on the `feat/buy-options` branch.

**Tech Stack:** Prisma 6 (Neon Postgres), TypeScript, Vitest, tsx scripts, Next.js App Router (server component item page).

**Conventions for every task:**
- Work from `d:\Documents\SandLabs\sand-wiki` (paths below are relative to it).
- Run a test file: `npx vitest run <path>`. Lint: `npm run lint`. Script: `npx tsx <path>` or the npm alias.
- Stay on branch `feat/buy-options`.
- The `.env` `DATABASE_URL` is a safe DEV Neon DB — the extraction script (insert-only) is authorized against it. NEVER target prod; never run `db:seed`/`db:seed:force`/`db:reset`.
- There is a known PRE-EXISTING tsc error in `src/lib/tech-tree/layout.test.ts` (`crownsIcon`) unrelated to this work — ignore it; it does not affect `npx vitest run` (esbuild transpiles tests without type-checking).

---

## Task 1: Pure planner `planTechUnlockOptions`

**Files:**
- Create: `prisma/tech-unlock-extract.ts`
- Test: `prisma/tech-unlock-extract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `prisma/tech-unlock-extract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planTechUnlockOptions, type UnlockPair, type ExistingUnlock } from "./tech-unlock-extract";

const pair = (itemId: string, nodeId: string): UnlockPair => ({
  itemId, itemName: `item-${itemId}`, nodeId, nodeName: `node-${nodeId}`,
});

describe("planTechUnlockOptions", () => {
  it("creates an option for a new (item, node) pair", () => {
    const planned = planTechUnlockOptions([pair("i1", "n1")], []);
    expect(planned).toEqual([{ itemId: "i1", itemName: "item-i1", nodeId: "n1", nodeName: "node-n1" }]);
  });

  it("skips a pair that already has a buy-unlock", () => {
    const existing: ExistingUnlock[] = [{ itemId: "i1", nodeId: "n1" }];
    expect(planTechUnlockOptions([pair("i1", "n1")], existing)).toEqual([]);
  });

  it("an item unlocked by two nodes yields two options", () => {
    const planned = planTechUnlockOptions([pair("i1", "n1"), pair("i1", "n2")], []);
    expect(planned.map((p) => p.nodeId)).toEqual(["n1", "n2"]);
  });

  it("de-dupes duplicate input pairs", () => {
    const planned = planTechUnlockOptions([pair("i1", "n1"), pair("i1", "n1")], []);
    expect(planned).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/tech-unlock-extract.test.ts`
Expected: FAIL — cannot find module `./tech-unlock-extract`.

- [ ] **Step 3: Implement the planner**

Create `prisma/tech-unlock-extract.ts`:

```ts
export interface UnlockPair { itemId: string; itemName: string; nodeId: string; nodeName: string }
export interface ExistingUnlock { itemId: string; nodeId: string }
export interface PlannedOption { itemId: string; itemName: string; nodeId: string; nodeName: string }

const key = (itemId: string, nodeId: string) => `${itemId}|${nodeId}`;

/** Decide which (item, node) buy-unlock options to create. Skips pairs that already have a
 *  buy-unlock between that item and node (idempotent + composes with the coin-trade
 *  migration). De-dupes repeated input pairs. Input order is preserved. */
export function planTechUnlockOptions(pairs: UnlockPair[], existing: ExistingUnlock[]): PlannedOption[] {
  const seen = new Set<string>(existing.map((e) => key(e.itemId, e.nodeId)));
  const planned: PlannedOption[] = [];
  for (const p of pairs) {
    const k = key(p.itemId, p.nodeId);
    if (seen.has(k)) continue;
    seen.add(k);
    planned.push({ itemId: p.itemId, itemName: p.itemName, nodeId: p.nodeId, nodeName: p.nodeName });
  }
  return planned;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run prisma/tech-unlock-extract.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add prisma/tech-unlock-extract.ts prisma/tech-unlock-extract.test.ts
git commit -m "feat(tech-extract): pure planTechUnlockOptions planner"
```

---

## Task 2: DB routine `extractTechUnlocksToBuyOptions`

**Files:**
- Modify: `prisma/tech-unlock-extract.ts` (append)

This appends the transactional routine that loads tech-unlocks + existing buy-unlocks, calls the planner, and inserts the option rows. It inserts only — never updates/deletes.

- [ ] **Step 1: Pre-check the link direction**

Read `prisma/seed.ts` and confirm the `tech-unlocks` rows are created as `{ sourceId: <tech node>, role: "tech-unlocks", targetId: <unlocked entity> }` (source = node, target = unlocked). Read `src/lib/proposal-apply.ts` `applyBuyOptionsProposal` and confirm a `buy-unlock` row is written as `{ sourceId: <item>, role: "buy-unlock", targetId: <tech node> }` (source = item, target = node). The routine below depends on both directions. If either differs, adapt the field mapping and report it.

- [ ] **Step 2: Append the routine**

Add `import type { PrismaClient } from "@prisma/client";` to the TOP of `prisma/tech-unlock-extract.ts`, then append:

```ts
export interface TechUnlockResult { itemsTouched: number; optionsCreated: number; pairsSkipped: number }

/** Create price-less buy options (buy-unlock + buy-yield qty 1) on each item the tech tree
 *  unlocks, derived from existing tech-unlocks links. Insert-only and idempotent: a pair that
 *  already has a buy-unlock is skipped. Does NOT set lootCurated (buy-unlock is not
 *  seed-managed). Runs in one transaction. */
export async function extractTechUnlocksToBuyOptions(prisma: PrismaClient): Promise<TechUnlockResult> {
  return prisma.$transaction(async (tx) => {
    // tech-unlocks: source = tech node, target = unlocked entity.
    const unlockLinks = await tx.entityLink.findMany({
      where: { role: "tech-unlocks" },
      select: {
        source: { select: { id: true, name: true } },
        target: { select: { id: true, name: true, kind: true } },
      },
    });

    const pairs: UnlockPair[] = unlockLinks
      .filter((l) => l.target && l.target.kind === "item")
      .map((l) => ({
        itemId: l.target!.id, itemName: l.target!.name,
        nodeId: l.source.id, nodeName: l.source.name,
      }));

    // buy-unlock: source = item, target = node.
    const existingLinks = await tx.entityLink.findMany({
      where: { role: "buy-unlock" },
      select: { sourceId: true, targetId: true },
    });
    const existing: ExistingUnlock[] = existingLinks
      .filter((l) => l.targetId)
      .map((l) => ({ itemId: l.sourceId, nodeId: l.targetId! }));

    const planned = planTechUnlockOptions(pairs, existing);
    const pairsSkipped = pairs.length - planned.length;
    if (planned.length === 0) return { itemsTouched: 0, optionsCreated: 0, pairsSkipped };

    // Current max buyGroup per item, so appended options don't collide with existing ones.
    const itemIds = [...new Set(planned.map((p) => p.itemId))];
    const maxByItem = new Map<string, number>();
    for (const itemId of itemIds) {
      const agg = await tx.entityLink.aggregate({
        where: { sourceId: itemId, buyGroup: { not: null } },
        _max: { buyGroup: true },
      });
      maxByItem.set(itemId, agg._max.buyGroup ?? -1);
    }

    const rows: {
      sourceId: string; targetId: string; role: string; name: string;
      amount: number | null; sortOrder: number; buyGroup: number;
    }[] = [];
    for (const p of planned) {
      const group = maxByItem.get(p.itemId)! + 1;
      maxByItem.set(p.itemId, group);
      rows.push({ sourceId: p.itemId, targetId: p.nodeId, role: "buy-unlock", name: p.nodeName, amount: null, sortOrder: 0, buyGroup: group });
      rows.push({ sourceId: p.itemId, targetId: p.itemId, role: "buy-yield", name: p.itemName, amount: 1, sortOrder: 1, buyGroup: group });
    }
    await tx.entityLink.createMany({ data: rows });

    return { itemsTouched: itemIds.length, optionsCreated: planned.length, pairsSkipped };
  });
}
```

- [ ] **Step 3: Verify it type-checks/lints**

Run: `npm run lint`
Expected: no NEW errors in `prisma/tech-unlock-extract.ts`.

- [ ] **Step 4: Commit**

```bash
git add prisma/tech-unlock-extract.ts
git commit -m "feat(tech-extract): extractTechUnlocksToBuyOptions DB routine"
```

---

## Task 3: One-time script + npm entry + dev run

**Files:**
- Create: `prisma/extract-tech-unlocks-to-buy.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

Create `prisma/extract-tech-unlocks-to-buy.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { extractTechUnlocksToBuyOptions } from "./tech-unlock-extract";

const prisma = new PrismaClient();

async function main() {
  const result = await extractTechUnlocksToBuyOptions(prisma);
  console.log("Tech-unlock -> buy-option extraction complete:", result);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add after `db:migrate-buy-options`:

```json
    "db:extract-tech-unlocks": "tsx prisma/extract-tech-unlocks-to-buy.ts",
```

Keep JSON valid. Verify with: `node -e "require('./package.json')"` (succeeds silently).

- [ ] **Step 3: Run against the dev DB (authorized, insert-only)**

Run: `npm run db:extract-tech-unlocks`
Expected: prints a `TechUnlockResult` with `optionsCreated` > 0 (≈115, minus any already present) and `itemsTouched` > 0. Then run it a SECOND time — expected `optionsCreated: 0` (idempotent; all pairs now skipped). Capture both outputs.
If it errors (DB unreachable / wrong relation accessor), STOP and report BLOCKED with the full error — do not reset/reseed.

- [ ] **Step 4: Commit**

```bash
git add prisma/extract-tech-unlocks-to-buy.ts package.json
git commit -m "feat(tech-extract): one-time db:extract-tech-unlocks script"
```

> **Live DB:** after this branch deploys, run `npm run db:extract-tech-unlocks` once against prod. It only inserts rows — safe under the never-reseed rule.

---

## Task 4: Relax the option validator + add `pricedOptions`

**Files:**
- Modify: `src/lib/buy-options.ts`
- Test: `src/lib/buy-options.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/buy-options.test.ts` (import `pricedOptions` and reuse the existing `BuyOptionsForm`/`BuyOptionView` imports — add `pricedOptions` to the existing `./buy-options` import line):

```ts
import { pricedOptions } from "./buy-options";

describe("parseBuyOptionsForm — unlock-only options", () => {
  it("accepts an option with an unlock and no costs", () => {
    const { options, error } = parseBuyOptionsForm({
      optGroups: ["0"], optYields: ["1"], optUnlockSlugs: ["heavy-ordnance"],
      costGroups: [], costSlugs: [], costAmounts: [],
    });
    expect(error).toBeNull();
    expect(options).toEqual([{ yield: 1, unlockSlug: "heavy-ordnance", costs: [] }]);
  });

  it("rejects an option with neither cost nor unlock", () => {
    const { error } = parseBuyOptionsForm({
      optGroups: ["0"], optYields: ["1"], optUnlockSlugs: [""],
      costGroups: [], costSlugs: [], costAmounts: [],
    });
    expect(error).toMatch(/cost or .*unlock/i);
  });
});

describe("pricedOptions", () => {
  it("keeps options with costs and drops cost-less ones", () => {
    const withCost = { group: 0, costs: [{ slug: "coin-crown", name: "Coin Crown", icon: null, rarity: null, amount: 5 }], yield: 1, unlock: null };
    const unlockOnly = { group: 1, costs: [], yield: 1, unlock: { slug: "n1", name: "Node 1" } };
    expect(pricedOptions([withCost, unlockOnly])).toEqual([withCost]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/buy-options.test.ts`
Expected: FAIL — the unlock-only option is currently rejected ("needs at least one cost component"); `pricedOptions` is not exported.

- [ ] **Step 3: Relax the validator**

In `src/lib/buy-options.ts`, inside `parseBuyOptionsForm`, the option loop currently reads (roughly):

```ts
    const costs = costsByGroup.get(g) ?? [];
    if (costs.length === 0) return { options: [], error: "Each buy option needs at least one cost component." };
    const y = posInt(form.optYields[i] ?? "");
    if (y === null) return { options: [], error: "Buy option yield must be a positive whole number." };
    const unlockSlug = (form.optUnlockSlugs[i] ?? "").trim() || null;
    options.push({ yield: y, unlockSlug, costs });
```

Change it to compute `unlockSlug` first and require cost OR unlock:

```ts
    const costs = costsByGroup.get(g) ?? [];
    const unlockSlug = (form.optUnlockSlugs[i] ?? "").trim() || null;
    if (costs.length === 0 && !unlockSlug) {
      return { options: [], error: "Each buy option needs at least one cost or a tech-tree unlock." };
    }
    const y = posInt(form.optYields[i] ?? "");
    if (y === null) return { options: [], error: "Buy option yield must be a positive whole number." };
    options.push({ yield: y, unlockSlug, costs });
```

(Read the actual current code and adapt the edit to match its exact lines — the logic change is: move `unlockSlug` above the empty-costs check, and gate the error on `costs.length === 0 && !unlockSlug`.)

- [ ] **Step 4: Add `pricedOptions`**

Append to `src/lib/buy-options.ts`:

```ts
/** Options shown publicly: only those with at least one priced cost component. */
export function pricedOptions(views: BuyOptionView[]): BuyOptionView[] {
  return views.filter((o) => o.costs.length > 0);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/buy-options.test.ts`
Expected: PASS (all prior buy-options tests still pass, plus the 3 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/lib/buy-options.ts src/lib/buy-options.test.ts
git commit -m "feat(buy): allow unlock-only options; add pricedOptions filter"
```

---

## Task 5: Filter the public Buy tab to priced options

**Files:**
- Modify: `src/app/items/[slug]/page.tsx`

- [ ] **Step 1: Pre-check the current wiring**

Read `src/app/items/[slug]/page.tsx`. Confirm it currently does (from the buy-options work):
- `const buyOptions = await getBuyOptions(slug);`
- `availableTabs(trades, buyOptions.length > 0)`
- a `buy:` entry in the tab content map: `buy: <BuyOptions options={buyOptions} itemName={item.name} />`

- [ ] **Step 2: Apply the filter**

Add `pricedOptions` to the existing `@/lib/buy-options` import (the page already imports `getBuyOptions` from `@/lib/queries`; `pricedOptions` comes from `@/lib/buy-options` — add an import if none exists). Then:
- After `const buyOptions = await getBuyOptions(slug);`, add:
  ```tsx
  const priced = pricedOptions(buyOptions);
  ```
- Change the tab gate to `availableTabs(trades, priced.length > 0)`.
- Change the buy tab content to `buy: <BuyOptions options={priced} itemName={item.name} />`.

(The editor path is untouched — `getBuyOptionsForEdit` still loads all options, including the price-less scaffolds, so they remain available to price.)

- [ ] **Step 3: Verify**

Run: `npm run lint` and `npx tsc --noEmit` (ignore the pre-existing `crownsIcon` error). No new errors.
Run: `npm run build` — confirm the `/items/[slug]` route compiles.

- [ ] **Step 4: Commit**

```bash
git add src/app/items/[slug]/page.tsx
git commit -m "feat(buy): hide price-less unlock options from the public Buy tab"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full test suite** — Run `npx vitest run`. Expected: all pass (existing 313 + the new tech-extract and buy-options tests).
- [ ] **Step 2: Lint** — Run `npm run lint`. Expected: 0 errors (the 2 pre-existing directus warnings are acceptable).
- [ ] **Step 3: Build** — Run `npm run build`. Expected: succeeds.
- [ ] **Step 4: DB spot-check (dev)** — confirm price-less options exist and stay hidden:
  ```bash
  npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); Promise.all([p.entityLink.count({where:{role:'buy-unlock'}}), p.entityLink.count({where:{role:'buy-yield'}})]).then(([u,y])=>{console.log('buy-unlock:',u,'buy-yield:',y); return p.\$disconnect();});"
  ```
  Expected: `buy-unlock` ≈ number of unlocked items (plus any from edits). (On PowerShell escaping issues, write a temp `prisma/_check.ts`, run with tsx, then delete it — don't commit it.)
- [ ] **Step 5: Manual smoke (optional, dev)** — open an unlocked item's edit page (`/contribute/edit-tabs?type=item&slug=<unlocked-item>`): the "Buy options" section shows an option with the tech node pre-filled and no price. The public item page shows NO Buy tab for that item (price-less). Add a price + submit + approve → the Buy tab then appears.
- [ ] **Step 6: Finish the branch** — use `superpowers:finishing-a-development-branch` (this work shares the `feat/buy-options` branch with the buy-options feature).

---

## Self-review (coverage map)

- Spec "pure planner, dedupe per (item,node), multi-node → multiple options" → Task 1.
- Spec "DB routine from existing tech-unlocks links, insert-only, idempotent, no lootCurated, next-buyGroup append" → Task 2.
- Spec "one-time script + npm entry, dev run, live later" → Task 3.
- Spec "relax validator to cost-OR-unlock; pricedOptions helper" → Task 4.
- Spec "public page filters to priced; editor loads all" → Task 5.
- Spec "tests: planner, relaxed validator, pricedOptions" → Tasks 1 & 4.
- Spec "not seed-run; builds on feat/buy-options" → no seed change made; all commits on feat/buy-options.
