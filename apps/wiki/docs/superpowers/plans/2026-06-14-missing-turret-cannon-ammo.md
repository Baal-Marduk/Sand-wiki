# Missing Turret/Cannon Ammo Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three missing ammo variants (70 mm shotgun smoke + penetrating, 40 mm autocannon low-recoil) to the wiki as `curated` live-DB rows, without reseeding.

**Architecture:** A JSON data file (`prisma/new-ammo.json`) + a pure builder module (`prisma/new-ammo.ts`) + an idempotent, create-if-absent loader (`prisma/load-new-ammo.ts`), mirroring the existing `load-location-recipes.ts` pattern. Caliber grouping is runtime-derived from each entry's name, so the loader only writes `Entity` rows — no `EntityLink`. `data.json` + `icons.json` + PNG files are added for fresh-seed parity.

**Tech Stack:** TypeScript, Prisma 6 (Neon Postgres), tsx, vitest.

**Spec:** [docs/superpowers/specs/2026-06-14-missing-turret-cannon-ammo-design.md](../specs/2026-06-14-missing-turret-cannon-ammo-design.md)

---

## File Structure

- Create: `prisma/new-ammo.ts` — `NewAmmo` type + pure `ammoRowIdentity(entry)` builder/validator. Imported by both the loader and the test.
- Create: `prisma/new-ammo.json` — the 3 ammo entries (data).
- Create: `prisma/new-ammo.test.ts` — unit tests for the builder + data-file invariants + parity checks.
- Create: `prisma/load-new-ammo.ts` — CLI loader; upserts curated rows into the live DB (create-if-absent).
- Modify: `prisma/data.json` — append 3 `items` entries (fresh-seed parity).
- Modify: `prisma/icons.json` — add 3 `id → path` mappings (fresh-seed parity).
- Modify: `package.json` — add `db:load-new-ammo` script.
- Add (binary, supplied from game): `public/icons/icon_ammo_shotgunTurret_smoke.png`, `public/icons/icon_ammo_shotgunTurret_<penetrating-suffix>.png`, `public/icons/icon_ammo_smallCannon_lowRecoil.png`.

> **Penetrating round suffix:** the third icon's exact filename is read off the actual PNG in Task 5. Until then it is referred to as `<P>` (camelCase, e.g. `penetration`) for the id/icon and `<p>` (kebab, e.g. `penetration`) for the slug.

---

### Task 1: Pure builder + validator (`prisma/new-ammo.ts`)

**Files:**
- Create: `prisma/new-ammo.ts`
- Test: `prisma/new-ammo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `prisma/new-ammo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ammoRowIdentity, type NewAmmo } from "./new-ammo";

const SAMPLE: NewAmmo = {
  slug: "small-cannon-ammo-low-recoil",
  id: "item_smallCannonAmmo_lowRecoil",
  name: "Small Cannon Ammo Low Recoil",
  displayName: "Low-Recoil 40 mm Shell",
  description: "A smaller-caliber cannon shell utilized by autocannons. Tuned for reduced recoil.",
  iconFile: "icon_ammo_smallCannon_lowRecoil.png",
  caliber: "40 mm",
};

describe("ammoRowIdentity", () => {
  it("maps a NewAmmo entry to a curated Entity identity", () => {
    expect(ammoRowIdentity(SAMPLE)).toEqual({
      name: "Low-Recoil 40 mm Shell",
      derivedName: "Small Cannon Ammo Low Recoil",
      description: "A smaller-caliber cannon shell utilized by autocannons. Tuned for reduced recoil.",
      category: "ammo",
      rarity: "Common",
      icon: "/icons/icon_ammo_smallCannon_lowRecoil.png",
      curated: true,
      lootCurated: true,
    });
  });

  it("throws when the displayName's caliber token disagrees with the declared caliber", () => {
    const bad = { ...SAMPLE, caliber: "70 mm" };
    expect(() => ammoRowIdentity(bad)).toThrow(/caliber/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/new-ammo.test.ts`
Expected: FAIL — cannot resolve module `./new-ammo`.

- [ ] **Step 3: Write minimal implementation**

Create `prisma/new-ammo.ts`:

```ts
import { ammoCaliber } from "../src/lib/ammo";
import { DEFAULT_RARITY } from "../src/lib/rarity";

/** One missing ammo variant, sourced from its icon (no in-game text yet — stub). */
export interface NewAmmo {
  /** kebab-case page slug, derived from the icon suffix. */
  slug: string;
  /** data.json id = icons.json key; never becomes the Entity uuid. */
  id: string;
  /** data.json `name` form → stored as Entity.derivedName. */
  name: string;
  /** display form → stored as Entity.name; MUST contain the caliber token. */
  displayName: string;
  description: string;
  /** bare PNG filename under public/icons/. */
  iconFile: string;
  /** expected caliber family; asserted against displayName. */
  caliber: string;
}

/** Build the curated Entity identity for one ammo entry, asserting the caliber invariant
 *  that the whole family-grouping relies on (ammoCaliber(name) must equal the declared caliber). */
export function ammoRowIdentity(e: NewAmmo) {
  const derived = ammoCaliber(e.displayName);
  if (derived !== e.caliber) {
    throw new Error(
      `${e.slug}: name "${e.displayName}" yields caliber "${derived}", expected "${e.caliber}"`,
    );
  }
  return {
    name: e.displayName,
    derivedName: e.name,
    description: e.description,
    category: "ammo",
    rarity: DEFAULT_RARITY,
    icon: `/icons/${e.iconFile}`,
    curated: true,
    lootCurated: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run prisma/new-ammo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add prisma/new-ammo.ts prisma/new-ammo.test.ts
git commit -m "feat(ammo): pure builder + validator for new ammo entries"
```

---

### Task 2: Data file with the three entries (`prisma/new-ammo.json`)

**Files:**
- Create: `prisma/new-ammo.json`
- Test: `prisma/new-ammo.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `prisma/new-ammo.test.ts`:

```ts
import entries from "./new-ammo.json";

describe("new-ammo.json", () => {
  const list = entries as NewAmmo[];

  it("has exactly three entries with unique slugs and ids", () => {
    expect(list).toHaveLength(3);
    expect(new Set(list.map((e) => e.slug)).size).toBe(3);
    expect(new Set(list.map((e) => e.id)).size).toBe(3);
  });

  it("every entry passes the caliber invariant", () => {
    for (const e of list) expect(() => ammoRowIdentity(e)).not.toThrow();
  });

  it("covers the two known slugs plus one more 70 mm shotgun-turret variant", () => {
    const slugs = list.map((e) => e.slug);
    expect(slugs).toContain("shotgun-turret-ammo-smoke");
    expect(slugs).toContain("small-cannon-ammo-low-recoil");
    // The penetrating round's exact suffix is finalized in Task 5; assert only that a
    // third entry exists and is a shotgun-turret (70 mm) variant.
    const extra = slugs.filter(
      (s) => s.startsWith("shotgun-turret-ammo-") && s !== "shotgun-turret-ammo-smoke",
    );
    expect(extra).toHaveLength(1);
  });
});
```

> Note: importing `.json` in vitest requires `resolveJsonModule`, which Next.js's
> `tsconfig.json` already enables (`"esModuleInterop": true`, `"resolveJsonModule": true`).
> If the import errors, confirm `resolveJsonModule: true` in `tsconfig.json` before proceeding.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/new-ammo.test.ts`
Expected: FAIL — cannot find module `./new-ammo.json`.

- [ ] **Step 3: Create the data file**

Create `prisma/new-ammo.json`. The penetrating entry's `slug`/`id`/`iconFile` carry a
placeholder suffix (`penetration`) finalized in Task 5; `displayName`/`caliber` are already valid:

```json
[
  {
    "slug": "shotgun-turret-ammo-smoke",
    "id": "item_shotgunTurretAmmo_smoke",
    "name": "Shotgun Turret Ammo Smoke",
    "displayName": "Smoke 70 mm Shell",
    "description": "Canister shot variant for 70 mm shotgun cannons. Lays down a smoke screen rather than a lethal payload.",
    "iconFile": "icon_ammo_shotgunTurret_smoke.png",
    "caliber": "70 mm"
  },
  {
    "slug": "shotgun-turret-ammo-penetration",
    "id": "item_shotgunTurretAmmo_penetration",
    "name": "Shotgun Turret Ammo Penetration",
    "displayName": "Penetrating 70 mm Shell",
    "description": "Armor-piercing shell for 70 mm shotgun cannons.",
    "iconFile": "icon_ammo_shotgunTurret_penetration.png",
    "caliber": "70 mm"
  },
  {
    "slug": "small-cannon-ammo-low-recoil",
    "id": "item_smallCannonAmmo_lowRecoil",
    "name": "Small Cannon Ammo Low Recoil",
    "displayName": "Low-Recoil 40 mm Shell",
    "description": "A smaller-caliber cannon shell utilized by autocannons. Tuned for reduced recoil.",
    "iconFile": "icon_ammo_smallCannon_lowRecoil.png",
    "caliber": "40 mm"
  }
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run prisma/new-ammo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add prisma/new-ammo.json prisma/new-ammo.test.ts
git commit -m "feat(ammo): data file for 3 missing turret/cannon ammo entries"
```

---

### Task 3: Fresh-seed parity in `data.json` + `icons.json`

**Files:**
- Modify: `prisma/data.json` (append to `items`)
- Modify: `prisma/icons.json` (add 3 keys)
- Test: `prisma/new-ammo.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `prisma/new-ammo.test.ts`:

```ts
import data from "./data.json";
import icons from "./icons.json";

describe("fresh-seed parity", () => {
  const list = entries as NewAmmo[];
  const items = (data as { items: { slug: string; type?: string }[] }).items;
  const iconMap = icons as Record<string, string>;

  it("data.json has an AMMO item for every new entry", () => {
    for (const e of list) {
      const item = items.find((i) => i.slug === e.slug);
      expect(item, `data.json missing ${e.slug}`).toBeTruthy();
      expect(item!.type).toBe("AMMO");
    }
  });

  it("icons.json maps every new id to its PNG path", () => {
    for (const e of list) {
      expect(iconMap[e.id]).toBe(`icons/${e.iconFile}`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/new-ammo.test.ts`
Expected: FAIL — `data.json missing shotgun-turret-ammo-smoke`.

- [ ] **Step 3: Add the parity entries**

Append these three objects to the `items` array in `prisma/data.json` (note `fromCatalog: false` — these are not from the scraped catalog):

```json
{
  "slug": "shotgun-turret-ammo-smoke",
  "id": "item_shotgunTurretAmmo_smoke",
  "name": "Shotgun Turret Ammo Smoke",
  "displayName": "Smoke 70 mm Shell",
  "description": "Canister shot variant for 70 mm shotgun cannons. Lays down a smoke screen rather than a lethal payload.",
  "type": "AMMO",
  "isResource": false,
  "storageStack": 100000,
  "workbenchTier": null,
  "fromCatalog": false
}
```
```json
{
  "slug": "shotgun-turret-ammo-penetration",
  "id": "item_shotgunTurretAmmo_penetration",
  "name": "Shotgun Turret Ammo Penetration",
  "displayName": "Penetrating 70 mm Shell",
  "description": "Armor-piercing shell for 70 mm shotgun cannons.",
  "type": "AMMO",
  "isResource": false,
  "storageStack": 100000,
  "workbenchTier": null,
  "fromCatalog": false
}
```
```json
{
  "slug": "small-cannon-ammo-low-recoil",
  "id": "item_smallCannonAmmo_lowRecoil",
  "name": "Small Cannon Ammo Low Recoil",
  "displayName": "Low-Recoil 40 mm Shell",
  "description": "A smaller-caliber cannon shell utilized by autocannons. Tuned for reduced recoil.",
  "type": "AMMO",
  "isResource": false,
  "storageStack": 100000,
  "workbenchTier": null,
  "fromCatalog": false
}
```

Add these three keys to `prisma/icons.json`:

```json
"item_shotgunTurretAmmo_smoke": "icons/icon_ammo_shotgunTurret_smoke.png",
"item_shotgunTurretAmmo_penetration": "icons/icon_ammo_shotgunTurret_penetration.png",
"item_smallCannonAmmo_lowRecoil": "icons/icon_ammo_smallCannon_lowRecoil.png"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run prisma/new-ammo.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add prisma/data.json prisma/icons.json prisma/new-ammo.test.ts
git commit -m "feat(ammo): fresh-seed parity for new ammo in data.json + icons.json"
```

---

### Task 4: Curated loader (`prisma/load-new-ammo.ts`)

**Files:**
- Create: `prisma/load-new-ammo.ts`
- Modify: `package.json` (add `db:load-new-ammo` script)

This task has no unit test (it performs DB + filesystem I/O); the pure logic it depends on
(`ammoRowIdentity`) is already covered by Task 1. It is verified by running it in Task 5.

- [ ] **Step 1: Write the loader**

Create `prisma/load-new-ammo.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ammoRowIdentity, type NewAmmo } from "./new-ammo";

const prisma = new PrismaClient();

async function main() {
  const entries: NewAmmo[] = JSON.parse(
    readFileSync(join(__dirname, "new-ammo.json"), "utf-8"),
  );

  // Duplicate-slug guard: two entries sharing a slug would clobber each other.
  const slugs = entries.map((e) => e.slug);
  const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
  if (dup) throw new Error(`Duplicate slug in new-ammo.json: ${dup}`);

  let created = 0;
  let skipped = 0;
  for (const e of entries) {
    // The PNG must already be in place — its path is what we store in Entity.icon.
    const png = join(__dirname, "..", "public", "icons", e.iconFile);
    if (!existsSync(png)) {
      throw new Error(`Missing icon PNG: public/icons/${e.iconFile} (copy it in first)`);
    }

    const identity = ammoRowIdentity(e); // also asserts the caliber invariant

    // Create-if-absent: never overwrite an existing row, so re-running cannot revert
    // contributor edits made on the live DB after the initial load.
    const existing = await prisma.entity.findUnique({ where: { slug: e.slug }, select: { id: true } });
    if (existing) {
      console.log(`  • ${e.slug} already exists — skipped`);
      skipped++;
      continue;
    }
    await prisma.entity.create({ data: { slug: e.slug, kind: "item", ...identity } });
    console.log(`  ✓ ${e.slug}`);
    created++;
  }

  console.log(`Done: ${created} created, ${skipped} skipped (of ${entries.length}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add after `db:load-location-recipes`:

```json
"db:load-new-ammo": "tsx prisma/load-new-ammo.ts",
```

- [ ] **Step 3: Type-check the loader compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `prisma/load-new-ammo.ts` or `prisma/new-ammo.ts`.

- [ ] **Step 4: Commit**

```bash
git add prisma/load-new-ammo.ts package.json
git commit -m "feat(ammo): create-if-absent curated loader for new ammo"
```

---

### Task 5: Supply PNGs, finalize the penetrating entry, run against the live DB

**Files:**
- Add: 3 PNGs under `public/icons/`
- Possibly modify: `prisma/new-ammo.json`, `prisma/data.json`, `prisma/icons.json` (penetrating suffix)

This is the human-gated execution task: it writes to the live Neon DB. **Per the project's
hard rule, do NOT run `db:seed`/`db:seed:force`/`db:reset` — only the additive loader below.**

- [ ] **Step 1: Copy the three icon PNGs into `public/icons/`**

Copy from the game asset folder:
- `icon_ammo_shotgunTurret_smoke.png`
- `icon_ammo_smallCannon_lowRecoil.png`
- the penetrating 70 mm shell icon — note its **exact filename**.

- [ ] **Step 2: Reconcile the penetrating suffix**

If the real penetrating filename is NOT `icon_ammo_shotgunTurret_penetration.png`, replace
`penetration` everywhere it appears for that entry (camelCase in the `id`/`iconFile`,
kebab-case in the `slug`) across `prisma/new-ammo.json`, `prisma/data.json`, and
`prisma/icons.json`. Keep `displayName: "Penetrating 70 mm Shell"` and `caliber: "70 mm"`.

- [ ] **Step 3: Re-run the full test suite**

Run: `npm test`
Expected: PASS — including all `new-ammo.test.ts` cases (slugs/ids unique, caliber invariant, parity).

- [ ] **Step 4: Confirm the loader targets the live (production) DB**

The loader uses `DATABASE_URL`. Confirm the environment points at the live Neon DB before running
(e.g. the `.env.production` connection string). Verify with a dry read:

Run: `npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); p.entity.count({where:{kind:'item',category:'ammo'}}).then(n=>{console.log('ammo rows:',n);return p.$disconnect();})"`
Expected: prints the current ammo count (28 before load).

- [ ] **Step 5: Run the loader**

Run: `npm run db:load-new-ammo`
Expected: `✓ shotgun-turret-ammo-smoke`, `✓ shotgun-turret-ammo-<suffix>`, `✓ small-cannon-ammo-low-recoil`, then `Done: 3 created, 0 skipped (of 3).`

- [ ] **Step 6: Verify idempotency**

Run: `npm run db:load-new-ammo`
Expected: three `• … already exists — skipped` lines, then `Done: 0 created, 3 skipped (of 3).`

- [ ] **Step 7: Verify on the running app**

Run: `npm run dev`, then in the browser:
- Open each new ammo page (`/items/shotgun-turret-ammo-smoke`, the penetrating slug, `/items/small-cannon-ammo-low-recoil`) — icon renders, rarity = Common.
- Open a 70 mm shotgun turret and a 40 mm autocannon weapon page and confirm the new variants are listed as compatible ammo (via `getAmmoByCaliber`).

- [ ] **Step 8: Commit the PNGs + any suffix reconciliation**

```bash
git add public/icons/icon_ammo_shotgunTurret_smoke.png public/icons/icon_ammo_shotgunTurret_*.png public/icons/icon_ammo_smallCannon_lowRecoil.png prisma/new-ammo.json prisma/data.json prisma/icons.json
git commit -m "feat(ammo): add icon assets + finalize penetrating-round suffix"
```

---

## Notes for the executor

- **Strictly additive.** No `EntityLink`, no recipes, no prune. The only live-DB write is
  `prisma/load-new-ammo.ts`, which creates rows if absent and otherwise skips.
- **Why no manual links:** ammo↔weapon interchangeability is derived at runtime from the
  caliber token in the name (`70 mm` / `40 mm`), so a correctly-named row auto-joins its family.
- **Stubs by design.** Names/descriptions are placeholders; real in-game text is added later
  through the normal contributor edit flow — which is exactly why the loader is create-if-absent.
