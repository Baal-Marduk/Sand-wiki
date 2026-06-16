# Stored "Ammo type" Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace name-regex caliber derivation with a stored, editable `ItemStats.ammoType` field that weapons and ammo are matched on by equality.

**Architecture:** Add a nullable `ammoType` column to `ItemStats`. A single resolver (`ammoTypeFor`) computes its value from the existing parse logic; the seed and a one-time backfill script populate it. Runtime matching (item detail page + `getAmmoByCaliber`/`getWeaponsByCaliber`) and the weapon-class filter read the stored column instead of re-parsing names. The correction form exposes it as an editable "Ammo type" field, which the generic proposal pipeline applies and the seed's lock map protects.

**Tech Stack:** Next.js 16, Prisma 6 (Neon Postgres), Vitest, Playwright.

**Working directory note:** All paths below are relative to the repo root `d:/Documents/SandLabs`. The app lives in `sand-wiki/`. Run all `npm`/`npx` commands from inside `sand-wiki/`.

**Branch:** `feat/stored-ammo-type` (already created; spec committed there).

---

### Task 1: Add the `ammoType` column

**Files:**
- Modify: `sand-wiki/prisma/schema.prisma` (model `ItemStats`, after the `ammoName` line ~57)
- Create: `sand-wiki/prisma/migrations/<timestamp>_add_ammo_type/migration.sql` (generated)

- [ ] **Step 1: Add the field to the schema**

In `sand-wiki/prisma/schema.prisma`, inside `model ItemStats`, add `ammoType` directly after `ammoName`:

```prisma
  magazine       Int?
  ammoName       String?
  ammoType       String?

  @@index([workbenchTier])
```

- [ ] **Step 2: Create the migration (nullable column, no seed)**

Run (from `sand-wiki/`):
```bash
npx prisma migrate dev --name add_ammo_type --skip-seed
```
Expected: a new `migrations/<timestamp>_add_ammo_type/migration.sql` containing `ALTER TABLE "ItemStats" ADD COLUMN "ammoType" TEXT;`, and "Your database is now in sync with your schema."

- [ ] **Step 3: Regenerate the Prisma client**

Run:
```bash
npx prisma generate
```
Expected: "Generated Prisma Client". `ItemStats.ammoType` is now a typed field.

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/prisma/schema.prisma sand-wiki/prisma/migrations
git commit -m "feat(schema): add ItemStats.ammoType column"
```

---

### Task 2: `ammoTypeFor` resolver

**Files:**
- Modify: `sand-wiki/src/lib/ammo.ts` (add resolver near `weaponCaliber`)
- Test: `sand-wiki/src/lib/ammo.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `sand-wiki/src/lib/ammo.test.ts` (and add `ammoTypeFor` to the import on line 2):

```ts
describe("ammoTypeFor", () => {
  it("derives ammo items from their own name", () => {
    expect(ammoTypeFor("ammo", "ammo-1154", "11x54 mm AP Ammo", null)).toBe("11x54 mm");
  });
  it("derives weapons from ammoName", () => {
    expect(ammoTypeFor("weapons", "service-rifle", "Service Rifle", "9x42 mm Ammo")).toBe("9x42 mm");
  });
  it("derives artillery turrets from the slug override when ammoName is null", () => {
    expect(ammoTypeFor("artillery", "game-packed-shotgun-turret-t1-container", "Packed Shotgun Turret", null)).toBe("70 mm");
  });
  it("returns null for non-weapon, non-ammo categories", () => {
    expect(ammoTypeFor("medical", "bandages", "Bandages", null)).toBeNull();
  });
});
```

Update line 2 import to:
```ts
import { ammoCaliber, weaponCaliber, caliberLabel, ammoTypeFor, itemClasses, CLASS_ORDER } from "./ammo";
```
(Note: `itemClass` is dropped from the import here; it is removed in Task 4.)

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/lib/ammo.test.ts
```
Expected: FAIL — `ammoTypeFor is not a function` (and an unresolved-import error).

- [ ] **Step 3: Implement the resolver**

In `sand-wiki/src/lib/ammo.ts`, add after `weaponCaliber` (after line 32):

```ts
/** The caliber-family value to STORE on an item (the weapon↔ammo match key), or null.
 *  Ammo derives from its own name; weapons/artillery from ammoName or a slug override.
 *  This is the only runtime consumer of ammoCaliber/weaponCaliber — matching itself
 *  reads the stored ItemStats.ammoType column. */
export function ammoTypeFor(
  category: string,
  slug: string,
  name: string,
  ammoName: string | null | undefined,
): string | null {
  if (category === "ammo") return ammoCaliber(name);
  if (category === "weapons" || category === "artillery") return weaponCaliber(slug, ammoName);
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/lib/ammo.test.ts
```
Expected: the `ammoTypeFor` block PASSES. (The `itemClass`/`itemClasses` blocks may still fail to import until Task 4 — that is expected; re-run after Task 4.)

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/ammo.ts sand-wiki/src/lib/ammo.test.ts
git commit -m "feat(ammo): add ammoTypeFor resolver for stored caliber"
```

---

### Task 3: Seed writes `ammoType`

**Files:**
- Modify: `sand-wiki/prisma/seed.ts` (item loop, `stats` object ~126-137; import line ~6)

- [ ] **Step 1: Import the resolver**

In `sand-wiki/prisma/seed.ts`, add an import for `ammoTypeFor` from the app lib. Near the other `../src/lib/...` imports (e.g. after line 5):

```ts
import { ammoTypeFor } from "../src/lib/ammo";
```

- [ ] **Step 2: Add `ammoType` to the seeded stats**

In the item loop, extend the `stats` object (after the `ammoName` line ~136). `category` and `i`/`flat`/`identity` are already in scope:

```ts
      ammoName: opt(flat.ammoName),
      ammoType: ammoTypeFor(category, i.slug, identity.name, flat.ammoName),
```

(`identity.name` is the Entity display name — the same string the detail page reads as `item.name`, so ammo derivation matches runtime exactly.)

- [ ] **Step 3: Typecheck the seed**

Run:
```bash
npx tsc --noEmit -p sand-wiki/tsconfig.json
```
Expected: no errors referencing `seed.ts` or `ammoType`. (Other pre-existing errors unrelated to this change, if any, can be ignored — but there should be none introduced here.)

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/prisma/seed.ts
git commit -m "feat(seed): populate ItemStats.ammoType from ammoTypeFor"
```

Note: do NOT run `db:seed` against the live DB (hard rule). Fresh/dev seeds will now populate `ammoType`; the live DB is handled by the backfill script in Task 6.

---

### Task 4: Read matching + class from the stored column

**Files:**
- Modify: `sand-wiki/src/lib/ammo.ts` (change `itemClasses` signature; remove `itemClass`)
- Modify: `sand-wiki/src/lib/item-filter.ts` (filter via `ammoType`)
- Modify: `sand-wiki/src/lib/queries.ts` (`listItems`, `listItemClasses`, `getAmmoByCaliber`, `getWeaponsByCaliber`)
- Modify: `sand-wiki/src/app/items/[slug]/page.tsx` (read `stats.ammoType`; display label; imports)
- Test: `sand-wiki/src/lib/ammo.test.ts`, `sand-wiki/src/lib/item-filter.test.ts`

- [ ] **Step 1: Update the failing tests for the new class-derivation shape**

In `sand-wiki/src/lib/ammo.test.ts`, DELETE the entire `describe("itemClass", ...)` block (lines ~53-66) and REPLACE the `describe("itemClasses", ...)` block (lines ~68-81) with:

```ts
describe("itemClasses", () => {
  it("returns distinct present classes in canonical order, from stored ammoType", () => {
    const rows = [
      { ammoType: "11x54 mm" }, // Sniper
      { ammoType: "9x42 mm" },  // Rifle
      { ammoType: "8x21 mm" },  // Pistol
      { ammoType: null },       // none
    ];
    expect(itemClasses(rows)).toEqual(["Pistol", "Rifle", "Sniper"]);
  });
  it("CLASS_ORDER lists every label caliberLabel can return", () => {
    expect(CLASS_ORDER).toEqual(["Pistol", "Rifle", "Sniper", "Shotgun", "Autocannon", "Naval", "Rocket"]);
  });
});
```

In `sand-wiki/src/lib/item-filter.test.ts`, find any case that builds rows with `ammoName` for the weapon-class filter and change those rows to use `ammoType` with caliber-family values instead. Concretely, replace weapon-class filter fixtures of the form `{ slug, name, ammoName: "9x42 mm Ammo" }` with `{ slug, name, ammoType: "9x42 mm" }`, and any ammo fixture `{ slug, name: "11x54 mm Ammo", ammoName: null }` with `{ slug, name, ammoType: "11x54 mm" }`. Leave the asserted class outputs ("Rifle", "Sniper", etc.) unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
npx vitest run src/lib/ammo.test.ts src/lib/item-filter.test.ts
```
Expected: FAIL — `itemClasses` is called with `ammoType` rows it does not accept yet, and `item-filter` references the old `itemClass(slug,name,ammoName)` path.

- [ ] **Step 3: Rework the class helpers in `ammo.ts`**

In `sand-wiki/src/lib/ammo.ts`, REMOVE `itemClass` (lines ~56-58) and REPLACE `itemClasses` (lines ~60-68) with a version keyed on the stored value:

```ts
/** Distinct caliber-class labels present in the given rows, in CLASS_ORDER.
 *  Reads each row's stored ammoType (the match key) rather than re-parsing names. */
export function itemClasses(rows: { ammoType: string | null }[]): string[] {
  const present = new Set<string>();
  for (const r of rows) {
    const c = caliberLabel(r.ammoType);
    if (c) present.add(c);
  }
  return CLASS_ORDER.filter((c) => present.has(c));
}
```

- [ ] **Step 4: Update `item-filter.ts` to filter on `ammoType`**

In `sand-wiki/src/lib/item-filter.ts`:

Change the import on line 3 from `itemClass` to `caliberLabel`:
```ts
import { caliberLabel } from "./ammo";
```

Change the `ViewItem` type (line 39) and its comment to carry `ammoType`:
```ts
// ViewItem reads ammoType (the stored weapon↔ammo match key), which lives on the
// ItemStats extension. listItems flattens itemStats onto each row before calling
// applyItemView, so the field is read here as a plain top-level `ammoType`.
type ViewItem = { slug: string; name: string; rarity: string | null; ammoType: string | null };
```

Change the filter line (line 50) to derive the class from the stored value:
```ts
    out = out.filter((i) => caliberLabel(i.ammoType) === opts.weaponClass);
```

- [ ] **Step 5: Update `queries.ts` reads**

In `sand-wiki/src/lib/queries.ts`:

`listItems` (line ~63) — flatten `ammoType` instead of `ammoName`:
```ts
  const flat = items.map((i) => ({ ...i, ammoType: i.itemStats?.ammoType ?? null }));
```

`listItemClasses` (lines ~104-108) — select and map `ammoType`:
```ts
  const rows = await prisma.entity.findMany({
    where: { ...where, disabled: false },
    select: { slug: true, name: true, itemStats: { select: { ammoType: true } } },
  });
  return itemClasses(rows.map((r) => ({ ammoType: r.itemStats?.ammoType ?? null })));
```

`getAmmoByCaliber` (lines ~304-311) — match in the DB and drop the regex filter:
```ts
export async function getAmmoByCaliber(caliber: string): Promise<LinkItem[]> {
  return prisma.entity.findMany({
    where: { kind: "item", category: "ammo", disabled: false, itemStats: { is: { ammoType: caliber } } },
    select: { slug: true, name: true, icon: true, rarity: true },
    orderBy: { name: "asc" },
  });
}
```

`getWeaponsByCaliber` (lines ~314-322) — match in the DB and drop the regex filter:
```ts
export async function getWeaponsByCaliber(caliber: string): Promise<LinkItem[]> {
  return prisma.entity.findMany({
    where: { kind: "item", category: { in: ["weapons", "artillery"] }, disabled: false, itemStats: { is: { ammoType: caliber } } },
    select: { slug: true, name: true, icon: true, rarity: true },
    orderBy: { name: "asc" },
  });
}
```

Remove the now-unused `weaponCaliber`/`ammoCaliber` imports from `queries.ts` if they are no longer referenced (check the top-of-file import; delete only the symbols that are now unused).

- [ ] **Step 6: Update the item detail page**

In `sand-wiki/src/app/items/[slug]/page.tsx`:

Change the import on line 8 to drop the parse functions (keep `caliberLabel`):
```ts
import { caliberLabel } from "@/lib/ammo";
```

Replace the caliber derivation (line 68) with a read of the stored column:
```ts
  const caliber = stats?.ammoType ?? null;
```

The existing `ammo`/`ammoUsers` lines (69-70) and the display label (line 141, `isAmmo ? caliberLabel(caliber) ?? undefined : undefined`) keep working unchanged because `caliber` now comes from the stored field.

- [ ] **Step 7: Run the unit tests**

Run:
```bash
npx vitest run src/lib/ammo.test.ts src/lib/item-filter.test.ts
```
Expected: PASS.

- [ ] **Step 8: Typecheck the whole app**

Run:
```bash
npx tsc --noEmit -p sand-wiki/tsconfig.json
```
Expected: no errors. (If `weaponCaliber`/`ammoCaliber` are reported as unused imports anywhere, remove those import symbols.)

- [ ] **Step 9: Commit**

```bash
git add sand-wiki/src/lib/ammo.ts sand-wiki/src/lib/ammo.test.ts sand-wiki/src/lib/item-filter.ts sand-wiki/src/lib/item-filter.test.ts sand-wiki/src/lib/queries.ts "sand-wiki/src/app/items/[slug]/page.tsx"
git commit -m "feat(matching): read weapon/ammo pairing from stored ammoType"
```

---

### Task 5: Editable "Ammo type" field in the correction form

**Files:**
- Modify: `sand-wiki/src/lib/proposal-schema.ts` (`EDITABLE_FIELDS.item`)
- Modify: `sand-wiki/src/components/EditProposalForm.tsx` (help text)
- Test: `sand-wiki/src/lib/proposal-apply.test.ts`

- [ ] **Step 1: Write the failing test (apply routes ammoType to ItemStats)**

In `sand-wiki/src/lib/proposal-apply.test.ts`, add a test asserting `applyableUpdate` includes `ammoType` and that `partitionUpdate` (if exported) routes it to stats. If `partitionUpdate` is not exported, assert via `applyableUpdate` only. Add:

```ts
it("includes ammoType as an applyable item field routed to the stat extension", () => {
  const diff = { ammoType: { old: null, new: "11x54 mm" } } as unknown as Diff;
  const update = applyableUpdate("item", diff);
  expect(update).toEqual({ ammoType: "11x54 mm" });
});
```

Ensure the test file imports `applyableUpdate` and the `Diff` type (it already imports from `./proposal-apply` / `./proposal-diff`; match the existing import style in the file).

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/lib/proposal-apply.test.ts
```
Expected: FAIL — `update` is `{}` because `ammoType` is not yet whitelisted (`fieldDef("item","ammoType")` returns undefined).

- [ ] **Step 3: Whitelist the field**

In `sand-wiki/src/lib/proposal-schema.ts`, add to `EDITABLE_FIELDS.item` (after the `ammoName` entry, line ~34):

```ts
    { field: "ammoName", label: "Ammo", type: "string" },
    { field: "ammoType", label: "Ammo type", type: "string" },
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/lib/proposal-apply.test.ts
```
Expected: PASS. `ammoType` is not in `ENTITY_OWN_FIELDS`, so `partitionUpdate` already routes it into the `itemStats` upsert — no change needed in `proposal-apply.ts`.

- [ ] **Step 5: Add the help text under the field**

In `sand-wiki/src/components/EditProposalForm.tsx`, extend the per-field hint block (after the `description` hint, line ~44):

```tsx
          {f.field === "description" && (
            <span className={hintCls}>
              Link to any wiki page with <code>[[slug]]</code>.
            </span>
          )}
          {f.field === "ammoType" && (
            <span className={hintCls}>
              Weapons and ammo sharing the same Ammo type appear on each other&apos;s pages
              (e.g. <code>11x54 mm</code>).
            </span>
          )}
```

- [ ] **Step 6: Typecheck**

Run:
```bash
npx tsc --noEmit -p sand-wiki/tsconfig.json
```
Expected: no errors. (`getEntityFields` already flattens `itemStats`, so the form auto-prefills the current `ammoType`.)

- [ ] **Step 7: Commit**

```bash
git add sand-wiki/src/lib/proposal-schema.ts sand-wiki/src/components/EditProposalForm.tsx sand-wiki/src/lib/proposal-apply.test.ts
git commit -m "feat(contribute): editable Ammo type field with matching help text"
```

---

### Task 6: One-time live/dev backfill script

**Files:**
- Create: `sand-wiki/prisma/backfill-ammo-type.mjs`

- [ ] **Step 1: Write the backfill script**

Create `sand-wiki/prisma/backfill-ammo-type.mjs`:

```js
// One-time, seed-SAFE backfill: computes ItemStats.ammoType for every weapon/ammo
// item and writes ONLY that column. Touches nothing else, so it cannot revert any
// contributor field/rarity/loot edit. Idempotent — safe to re-run.
import { PrismaClient } from "@prisma/client";
import { ammoTypeFor } from "../src/lib/ammo.ts";

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.entity.findMany({
    where: { kind: "item", category: { in: ["ammo", "weapons", "artillery"] } },
    select: { id: true, slug: true, name: true, category: true, itemStats: { select: { ammoName: true } } },
  });

  let updated = 0;
  for (const it of items) {
    const ammoType = ammoTypeFor(it.category, it.slug, it.name, it.itemStats?.ammoName ?? null);
    if (ammoType === null) continue;
    await prisma.itemStats.update({
      where: { entityId: it.id },
      data: { ammoType },
    });
    updated++;
  }
  console.log(`Backfilled ammoType on ${updated} of ${items.length} weapon/ammo item(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

Note: importing a `.ts` file from a `.mjs` script requires the project's existing TS-execution path. If other `prisma/*.mjs` scripts in this repo import `.ts` via a loader (check sibling scripts like `import-wiki-enrichment.mjs`), mirror their run command. If they instead run through `tsx`, run this script with `tsx` too (next step covers both).

- [ ] **Step 2: Run the backfill against the dev DB**

From `sand-wiki/`, run whichever matches the repo's existing `prisma/*.mjs` convention:
```bash
npx tsx prisma/backfill-ammo-type.mjs
```
(If sibling `.mjs` scripts are run with plain `node --import=...`, use that exact invocation instead.)
Expected: prints `Backfilled ammoType on N of M weapon/ammo item(s).` with N > 0.

- [ ] **Step 3: Verify a known pairing in the dev DB**

Run a quick check that an ammo item and its weapons now share a non-null `ammoType`:
```bash
npx tsx -e "import('@prisma/client').then(async ({PrismaClient})=>{const p=new PrismaClient();const r=await p.entity.findMany({where:{category:{in:['ammo','weapons','artillery']},itemStats:{is:{ammoType:{not:null}}}},select:{name:true,category:true,itemStats:{select:{ammoType:true}}},take:10});console.log(r.map(x=>({name:x.name,cat:x.category,t:x.itemStats?.ammoType})));await p.\$disconnect();})"
```
Expected: a list where ammo and weapon rows show matching `ammoType` values (e.g. an `11x54 mm` ammo and an `11x54 mm` weapon).

- [ ] **Step 4: Commit the script**

```bash
git add sand-wiki/prisma/backfill-ammo-type.mjs
git commit -m "chore(prisma): seed-safe one-time ammoType backfill script"
```

Note for deployment: run this same script once against the live DB after the migration is applied there. It only writes `ammoType`, so it is consistent with the never-reseed rule.

---

### Task 7: End-to-end verification

**Files:**
- Modify: `sand-wiki/tests/e2e/wiki.spec.ts` (add/extend ammo-pairing coverage)

- [ ] **Step 1: Add an e2e assertion for the stored-match tabs**

In `sand-wiki/tests/e2e/wiki.spec.ts`, following the existing ammo/used-by e2e pattern, add a test that:
- loads an ammo item page known to have `ammoType` (pick one surfaced by Task 6 Step 3),
- opens the "Used by" tab and asserts it lists at least one weapon link to `/items/<weapon-slug>`,
- loads that weapon page, opens the "Ammo" tab, and asserts it lists the ammo back.

Use the same locators/structure as the current "Used by" e2e test already in this file (mirror it; do not invent new helpers).

- [ ] **Step 2: Run the unit suite**

Run:
```bash
npx vitest run
```
Expected: PASS (all suites, including the updated `ammo`, `item-filter`, and `proposal-apply` tests).

- [ ] **Step 3: Run the e2e suite**

Run:
```bash
npx playwright test tests/e2e/wiki.spec.ts
```
Expected: PASS, including the new ammo-pairing test, in both themes if the existing tests parametrize themes.

- [ ] **Step 4: Build to confirm no runtime/type regressions**

Run:
```bash
npm run build
```
Expected: successful production build.

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/tests/e2e/wiki.spec.ts
git commit -m "test(e2e): verify weapon/ammo pairing via stored ammoType"
```

---

## Self-Review

**Spec coverage:**
- Data model (new `ammoType` column) → Task 1. ✓
- Resolver `ammoTypeFor` → Task 2. ✓
- Matching reads stored field (page + both queries) → Task 4 Steps 5-6. ✓
- Display & filters (caliberLabel from ammoType; `/items` class filter; listItems/listItemClasses) → Task 4 Steps 3-5. ✓
- Editable "Ammo type" + help text + generic apply → Task 5. ✓
- Seed-path population + lock-map protection → Task 3 (lock map needs no change: `ammoType` becomes a whitelisted edit field in Task 5, so applied edits land in the map automatically). ✓
- Live backfill, seed-safe → Task 6. ✓
- Cleanup (parse fns become backfill/seed-only) → Task 2 (resolver is sole runtime consumer) + Task 4 import removals. ✓
- Testing (unit + e2e) → Tasks 2, 4, 5, 7. ✓
- Out of scope items are not implemented. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. The only conditional instruction is the `.mjs` run command in Task 6, which gives an explicit default (`tsx`) and a check against sibling scripts — not a placeholder.

**Type consistency:** `ammoTypeFor(category, slug, name, ammoName)` signature identical across Tasks 2/3/6. `itemClasses` redefined to `{ ammoType: string|null }[]` in Task 4 and used with that shape in `queries.ts` and the test. `ViewItem` carries `ammoType`; `listItems` flatten produces `ammoType`. `caliberLabel` is the single class-deriver after `itemClass` removal. Consistent.
