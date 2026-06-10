# Caliber-Based Ammo Families Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match ammo↔weapon by a runtime-derived caliber family so same-caliber variants are interchangeable, artillery turrets get an Ammo tab, and each ammo shows a precise class label.

**Architecture:** A new pure lib (`src/lib/ammo.ts`) derives a caliber token from ammo names and weapon/turret names-or-slugs, plus a class label. Two queries filter the (tiny) item set by caliber in application code. The item page builds the Ammo / Used-by tabs and the StatBox "Type" from these. No DB schema or seed change.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Prisma 6 (Postgres) + Tailwind v4/DaisyUI 5. Tests: Vitest (pure libs), Playwright e2e (+ axe).

---

## File Structure

- `src/lib/ammo.ts` — **new**: `ammoCaliber`, `weaponCaliber`, `SLUG_CALIBER_OVERRIDES`, `caliberLabel`. One responsibility: caliber-family derivation. Pure, no imports.
- `src/lib/ammo.test.ts` — **new**: unit tests for the above.
- `src/lib/queries.ts` — **modify**: add `getAmmoByCaliber`, `getWeaponsByCaliber`; remove the now-superseded `getWeaponsUsingAmmo` + `AmmoUser`.
- `src/components/StatBox.tsx` — **modify**: optional `typeLabel` prop overriding the displayed Type.
- `src/app/items/[slug]/page.tsx` — **modify**: caliber-driven Ammo / Used-by tabs + StatBox `typeLabel`.
- `tests/e2e/wiki.spec.ts` — **modify**: add AP-variant Used-by, turret Ammo tab, ammo class-label tests.

All paths are under `d:\Documents\SandLabs\sand-wiki`; run all commands from there.

**Verified facts (dev DB):** `sniper-rifle-ammo-high-penetration` = "11x54 mm AP Ammo"; the Petros rifles (`sniper-rifle`, `sniper-rifle-iron-sights`, `sniper-rifle-iron-sights-silencer`) carry `stats.ammoName` "11x54 mm Ammo". `turret-ammo` = "80 mm Shell". `game-packed-turret-t1-container` is the T1 Naval turret (slug prefix `game-packed-turret`). `pistol-ammo` = "8x21 mm Ammo", used by `semi-automatic-pistol`.

---

## Task 1: `src/lib/ammo.ts` caliber helpers (TDD)

**Files:**
- Create: `src/lib/ammo.test.ts`
- Create: `src/lib/ammo.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ammo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ammoCaliber, weaponCaliber, caliberLabel } from "./ammo";

describe("ammoCaliber", () => {
  it("reads NxN mm without degrading to the second number", () => {
    expect(ammoCaliber("11x54 mm Ammo")).toBe("11x54 mm");
    expect(ammoCaliber("11x54 mm AP Ammo")).toBe("11x54 mm");
    expect(ammoCaliber("8x21 mm FMJ Ammo")).toBe("8x21 mm");
  });
  it("reads shotgun gauge", () => {
    expect(ammoCaliber("12 GA Toxic Ammo")).toBe("12 GA");
  });
  it("reads plain mm shells", () => {
    expect(ammoCaliber("Long-Range 40 mm Shell")).toBe("40 mm");
    expect(ammoCaliber("High Velocity 80 mm Shell")).toBe("80 mm");
  });
  it("recognises rockets and returns null otherwise", () => {
    expect(ammoCaliber("High-Explosive Rocket")).toBe("Rocket");
    expect(ammoCaliber("Bandages")).toBeNull();
  });
});

describe("weaponCaliber", () => {
  it("derives from ammoName when present", () => {
    expect(weaponCaliber("rifle-musket", "9x42 mm Ammo")).toBe("9x42 mm");
  });
  it("derives turrets from the slug prefix", () => {
    expect(weaponCaliber("game-packed-auto-turret-t1-container", null)).toBe("40 mm");
    expect(weaponCaliber("game-packed-shotgun-turret-t1-container", null)).toBe("70 mm");
    expect(weaponCaliber("game-packed-turret-t4-rail-gun-container", null)).toBe("80 mm");
  });
  it("returns null for items with no ammo and no override", () => {
    expect(weaponCaliber("c4-dynamite", null)).toBeNull();
  });
});

describe("caliberLabel", () => {
  it("maps small arms to gun class and shells to artillery class", () => {
    expect(caliberLabel("11x54 mm")).toBe("Sniper");
    expect(caliberLabel("8x21 mm")).toBe("Pistol");
    expect(caliberLabel("9x42 mm")).toBe("Rifle");
    expect(caliberLabel("12 GA")).toBe("Shotgun");
    expect(caliberLabel("40 mm")).toBe("Autocannon");
    expect(caliberLabel("70 mm")).toBe("Shotgun");
    expect(caliberLabel("80 mm")).toBe("Naval");
  });
  it("returns null for unknown or null", () => {
    expect(caliberLabel("999 mm")).toBeNull();
    expect(caliberLabel(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- ammo`
Expected: FAIL — `./ammo` cannot be resolved (module not found).

- [ ] **Step 3: Implement `src/lib/ammo.ts`**

```ts
/** Caliber-family helpers. A "caliber" string (e.g. "11x54 mm", "12 GA", "40 mm",
 *  "Rocket") is the family key that makes same-caliber ammo variants interchangeable
 *  across the weapons/turrets that fire them. Derived at runtime — there is no stored field. */

/** Extract the caliber family token from an AMMO item name. NxN mm is matched before the
 *  plain "N mm" rule so "11x54 mm" is not truncated to "54 mm". */
export function ammoCaliber(name: string): string | null {
  const cross = name.match(/\b(\d+)x(\d+)\s?mm\b/i);
  if (cross) return `${cross[1]}x${cross[2]} mm`;
  const ga = name.match(/\b(\d+)\s?GA\b/i);
  if (ga) return `${ga[1]} GA`;
  const mm = name.match(/\b(\d+)\s?mm\b/i);
  if (mm) return `${mm[1]} mm`;
  if (/rocket/i.test(name)) return "Rocket";
  return null;
}

/** slug-prefix → caliber, for items that carry no ammoName (turrets, rocket launcher).
 *  Ordered most-specific first. */
export const SLUG_CALIBER_OVERRIDES: { prefix: string; caliber: string }[] = [
  { prefix: "game-packed-auto-turret", caliber: "40 mm" },
  { prefix: "game-packed-shotgun-turret", caliber: "70 mm" },
  { prefix: "game-packed-turret", caliber: "80 mm" },
  { prefix: "rocket-launcher", caliber: "Rocket" },
];

/** Caliber a weapon/artillery item fires: from its ammoName when present, else a slug override. */
export function weaponCaliber(slug: string, ammoName?: string | null): string | null {
  if (ammoName) return ammoCaliber(ammoName);
  for (const o of SLUG_CALIBER_OVERRIDES) if (slug.startsWith(o.prefix)) return o.caliber;
  return null;
}

const LABELS: Record<string, string> = {
  "8x21 mm": "Pistol",
  "9x42 mm": "Rifle",
  "11x54 mm": "Sniper",
  "12 GA": "Shotgun",
  "40 mm": "Autocannon",
  "70 mm": "Shotgun",
  "80 mm": "Naval",
  Rocket: "Rocket",
};

/** Human class label for a caliber family (shown as an ammo item's "type"). */
export function caliberLabel(caliber: string | null): string | null {
  return caliber ? LABELS[caliber] ?? null : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- ammo`
Expected: PASS (all three describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ammo.ts src/lib/ammo.test.ts
git commit -m "feat(wiki): caliber-family helpers (ammoCaliber/weaponCaliber/caliberLabel)"
```

---

## Task 2: Caliber queries

**Files:**
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: Add the two caliber queries**

At the top of `src/lib/queries.ts`, the existing imports include `import { prisma } from "./db";`. Add below the existing import lines:

```ts
import { ammoCaliber, weaponCaliber } from "./ammo";
```

Append at the end of the file:

```ts
/** {slug,name,icon} rows for ItemLinkList. */
type LinkItem = { slug: string; name: string; icon: string | null };

/** Ammo items whose caliber family matches `caliber` (all interchangeable variants). */
export async function getAmmoByCaliber(caliber: string): Promise<LinkItem[]> {
  const rows = await prisma.item.findMany({
    where: { category: "ammo" },
    select: { slug: true, name: true, icon: true },
    orderBy: { name: "asc" },
  });
  return rows.filter((r) => ammoCaliber(r.name) === caliber);
}

/** Weapons/artillery that fire the given caliber family. */
export async function getWeaponsByCaliber(caliber: string): Promise<LinkItem[]> {
  const rows = await prisma.item.findMany({
    where: { category: { in: ["weapons", "artillery"] } },
    select: { slug: true, name: true, icon: true, stats: true },
    orderBy: { name: "asc" },
  });
  return rows
    .filter((r) => weaponCaliber(r.slug, (r.stats as { ammoName?: string } | null)?.ammoName) === caliber)
    .map(({ slug, name, icon }) => ({ slug, name, icon }));
}
```

(Leave the existing `getWeaponsUsingAmmo` / `AmmoUser` in place for now — the page still imports them until Task 4, which removes both. This keeps the tree buildable between tasks.)

- [ ] **Step 2: Verify it type-checks**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(wiki): add caliber queries (getAmmoByCaliber/getWeaponsByCaliber)"
```

---

## Task 3: StatBox `typeLabel` prop

**Files:**
- Modify: `src/components/StatBox.tsx`

- [ ] **Step 1: Add the prop and use it for the Type cell**

In `src/components/StatBox.tsx`, change the component signature from:

```tsx
export function StatBox({ stats }: { stats: ItemStats | null | undefined }) {
```

to:

```tsx
export function StatBox({ stats, typeLabel }: { stats: ItemStats | null | undefined; typeLabel?: string }) {
```

Then change the Type cell line from:

```tsx
  if (stats.type) cells.push({ label: "Type", node: stats.type });
```

to:

```tsx
  const typeValue = typeLabel ?? stats.type;
  if (typeValue) cells.push({ label: "Type", node: typeValue });
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/StatBox.tsx
git commit -m "feat(wiki): StatBox typeLabel prop to override the Type cell"
```

---

## Task 4: Page wiring — caliber-driven tabs + Type label

**Files:**
- Modify: `src/app/items/[slug]/page.tsx`

- [ ] **Step 1: Update imports**

Change:

```tsx
import { getItemBySlug, getCratesContaining, getWeaponsUsingAmmo, getItemIconMap } from "@/lib/queries";
```

to:

```tsx
import { getItemBySlug, getCratesContaining, getAmmoByCaliber, getWeaponsByCaliber } from "@/lib/queries";
import { ammoCaliber, weaponCaliber, caliberLabel } from "@/lib/ammo";
```

(`getItemIconMap` is no longer used on this page; it remains exported for the environment pages.)

- [ ] **Step 2: Replace the ammo/ammoUsers computation**

Replace this block:

```tsx
  const ammoUsers = item.category === "ammo" ? await getWeaponsUsingAmmo(item.slug) : [];

  // This item's ammo (for weapons/artillery): the stats blob names it; fetch its icon.
  const stats = item.stats as unknown as ItemStats | null;
  const ammo =
    stats?.ammoSlug && stats.ammoName
      ? [{ slug: stats.ammoSlug, name: stats.ammoName, icon: (await getItemIconMap([stats.ammoSlug]))[stats.ammoSlug] ?? null }]
      : [];
```

with:

```tsx
  // Caliber family drives both directions: a weapon/turret lists every ammo of its
  // caliber; an ammo lists every weapon/turret of its caliber.
  const stats = item.stats as unknown as ItemStats | null;
  const isAmmo = item.category === "ammo";
  const caliber = isAmmo ? ammoCaliber(item.name) : weaponCaliber(item.slug, stats?.ammoName);
  const ammo = !isAmmo && caliber ? await getAmmoByCaliber(caliber) : [];
  const ammoUsers = isAmmo && caliber ? await getWeaponsByCaliber(caliber) : [];
```

- [ ] **Step 3: Pass the Type label to StatBox**

Change:

```tsx
          <StatBox stats={stats} />
```

to:

```tsx
          <StatBox stats={stats} typeLabel={isAmmo ? caliberLabel(caliber) ?? undefined : undefined} />
```

(The tab-push blocks for `ammo` and `ammoUsers` are unchanged — they already render `<ItemLinkList items={ammo} />` / `<ItemLinkList items={ammoUsers} />`.)

- [ ] **Step 4: Remove the now-unused exact-slug query from `src/lib/queries.ts`**

The page no longer references it. Delete the `AmmoUser` interface and `getWeaponsUsingAmmo` function:

```ts
export interface AmmoUser { slug: string; name: string; icon: string | null; category: string }

/** Weapons/artillery that fire the given ammo — reverse of a weapon's `stats.ammoSlug`.
 *  Returns [] for any item nothing points at (so the tab only appears on ammo). */
export async function getWeaponsUsingAmmo(ammoSlug: string): Promise<AmmoUser[]> {
  return prisma.item.findMany({
    where: { stats: { path: ["ammoSlug"], equals: ammoSlug } },
    select: { slug: true, name: true, icon: true, category: true },
    orderBy: { name: "asc" },
  });
}
```

- [ ] **Step 5: Verify build + lint**

Run: `npm run lint`
Expected: no errors (no remaining reference to `getWeaponsUsingAmmo` / `getItemIconMap` anywhere).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/items/[slug]/page.tsx src/lib/queries.ts
git commit -m "feat(wiki): caliber-driven Ammo/Used-by tabs + ammo Type label; drop getWeaponsUsingAmmo"
```

---

## Task 5: e2e coverage

**Files:**
- Modify: `tests/e2e/wiki.spec.ts`

- [ ] **Step 1: Add the new e2e tests**

Append to the end of `tests/e2e/wiki.spec.ts`:

```ts
test("an ammo variant lists guns of its caliber via Used by", async ({ page }) => {
  // "11x54 mm AP Ammo" shares the 11x54 mm family with the base round, so it must
  // list the Petros rifles even though those weapons point at the base ammo slug.
  await page.goto("/items/sniper-rifle-ammo-high-penetration");
  await page.getByRole("tab", { name: "Used by" }).click();
  await expect(page.locator('[role="tabpanel"] a[href="/items/sniper-rifle"]')).toBeVisible();
});

test("artillery turret has an Ammo tab listing its shells", async ({ page }) => {
  await page.goto("/items/game-packed-turret-t1-container");
  await page.getByRole("tab", { name: "Ammo" }).click();
  const shell = page.locator('[role="tabpanel"] a[href="/items/turret-ammo"]');
  await expect(shell).toBeVisible();
  await expect(shell).toContainText("80 mm Shell");
});

test("ammo stat box shows the precise class label as its type", async ({ page }) => {
  await page.goto("/items/sniper-rifle-ammo");
  // The stat box is the only <dl> on the page; its Type cell now reads the class label.
  await expect(page.locator("dl").getByText("Sniper")).toBeVisible();
});
```

- [ ] **Step 2: Run the full e2e suite against a fresh prod server**

Avoid the stale-`:3000` trap (see `instructions.md` Gotchas). Build, start on an alternate port, run with a throwaway config, then clean up:

```bash
npm run build
npx next start -p 3100   # background
```

Create `playwright.tmp.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3100" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

Run: `npx playwright test -c playwright.tmp.config.ts`
Expected: ALL tests pass, including the three new ones, the existing weapon Ammo-tab test (`rifle-musket` → Ammo tab lists `9x42 mm Ammo`), the existing pistol-ammo Used-by test, and all axe a11y checks.

Then stop the port-3100 server and delete `playwright.tmp.config.ts`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/wiki.spec.ts
git commit -m "test(wiki): e2e for caliber families (variant Used-by, turret Ammo, class label)"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint** — Run: `npm run lint` — Expected: no errors.
- [ ] **Step 2: Build + typecheck** — Run: `npm run build` — Expected: succeeds.
- [ ] **Step 3: Unit tests** — Run: `npm test` — Expected: PASS (includes the new `ammo.test.ts`).
- [ ] **Step 4: Full e2e** — Ensure no stale `:3000` server; run the full suite as in Task 5 Step 2. Expected: all pass incl. axe.
- [ ] **Step 5: Confirm clean tree** — Run: `git status` — Expected: no leftover `playwright.tmp.config.ts` or stray files.

---

## Self-Review Notes

- **Spec coverage:** `ammo.ts` helpers (§Components.1) → Task 1; queries (§Components.2) → Task 2; page wiring incl. artillery Ammo tab + variant Used-by (§Components.3) → Task 4; StatBox type label (§Components.4) → Tasks 3 & 4; tests (§Testing) → Tasks 1 & 5. All covered.
- **Type consistency:** `ammoCaliber`/`weaponCaliber`/`caliberLabel` signatures identical across Task 1 (def), Task 2 (queries import `ammoCaliber`/`weaponCaliber`), and Task 4 (page imports all three). `getAmmoByCaliber`/`getWeaponsByCaliber` return `{slug,name,icon}[]`, matching `ItemLinkList`'s `LinkListItem`. `typeLabel?: string` matches between StatBox (Task 3) and the page passing `caliberLabel(caliber) ?? undefined` (Task 4).
- **No placeholders:** every code/command step is concrete.
- **Removal safety:** `getWeaponsUsingAmmo`/`AmmoUser` are referenced only by the page (updated in Task 4) and the now-deleted `AmmoUsedByGrid`; no test references the function by name.
