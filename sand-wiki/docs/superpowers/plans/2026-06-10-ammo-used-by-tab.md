# Ammo "Used by" Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Used by" tab to ammunition item pages listing the weapons/artillery that fire that ammo, rendered as an icon grid with name tooltips.

**Architecture:** The reverse link already lives in `Item.stats.ammoSlug` (a gun records the slug of its ammo). A new query finds every item whose `stats.ammoSlug` equals the current item's slug; a new icon-grid component renders them; the item detail page pushes the tab when the result is non-empty — the same manual-push pattern already used for the Loot tab. No schema change.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Prisma 6 (Postgres JSON path filter) + Tailwind v4/DaisyUI 5. Tests: Playwright e2e (`@axe-core/playwright`), Vitest for pure libs.

---

## File Structure

- `sand-wiki/instructions.md` — add a deferred-TODO line for the gun-side ammo icon+tooltip (task 1, doc only).
- `sand-wiki/src/lib/queries.ts` — add `AmmoUser` interface + `getWeaponsUsingAmmo(ammoSlug)`.
- `sand-wiki/src/lib/item-view.ts` — add `"used-by"` to the `TabId` union.
- `sand-wiki/src/components/AmmoUsedByGrid.tsx` — new icon-grid component (mirrors `LootTable`).
- `sand-wiki/src/app/items/[slug]/page.tsx` — query + push the tab before Loot.
- `sand-wiki/tests/e2e/wiki.spec.ts` — add an e2e test against `/items/pistol-ammo`.

All paths below are relative to the repo root (the `sand-wiki/` Next.js app). Run all `npm`/`git` commands from inside `sand-wiki/`.

**Known facts (verified against the dev DB):**
- `pistol-ammo` ("8x21 mm Ammo", category `ammo`) is used by 5 weapons. The alphabetically-first is `semi-automatic-pistol` → name `Blitz 10R Pistol`.
- The Prisma filter `where: { stats: { path: ["ammoSlug"], equals: "pistol-ammo" } }` returns exactly those 5 weapons.
- `ItemIconLink` puts the item name in `aria-label` on the `<a>` and links to `/items/<slug>`.

---

## Task 1: Document the deferred gun-side ammo icon+tooltip (docs only)

**Files:**
- Modify: `instructions.md` (the `Requirements / TODO` list near the end)

- [ ] **Step 1: Add the TODO line**

In `instructions.md`, inside the `## Requirements / TODO` list, replace the final bullet:

```markdown
- [ ] (add more here…)
```

with:

```markdown
- [ ] Weapon/artillery pages: render the `StatBox` "Ammo" stat as an icon + tooltip
      (`ItemIconLink`) instead of the current plain text link, matching the loot/recipe
      icon grids. (Reverse view — ammo's "Used by" tab — is already implemented.)
- [ ] (add more here…)
```

- [ ] **Step 2: Commit**

```bash
git add instructions.md
git commit -m "docs(wiki): note deferred gun-side ammo icon+tooltip TODO"
```

---

## Task 2: Failing e2e test for the "Used by" tab

**Files:**
- Modify: `tests/e2e/wiki.spec.ts` (append a new test at the end)

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/wiki.spec.ts`:

```ts
test("ammo page lists the weapons that use it via a Used by tab", async ({ page }) => {
  await page.goto("/items/pistol-ammo");
  const tab = page.getByRole("tab", { name: "Used by" });
  await expect(tab).toBeVisible();
  await tab.click();
  const weaponLink = page.locator('[role="tabpanel"] a[href="/items/semi-automatic-pistol"]');
  await expect(weaponLink).toBeVisible();
  await expect(weaponLink).toHaveAttribute("aria-label", "Blitz 10R Pistol");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Ensure no stale dev server is holding `:3000` (see Gotchas in `instructions.md`); if one is running, stop it first so Playwright builds + serves current code.

Run: `npm run test:e2e -- -g "Used by tab"`

Expected: FAIL — the "Used by" tab is not rendered yet, so `getByRole("tab", { name: "Used by" })` times out / is not visible.

---

## Task 3: Implement the query, component, type, and wiring

**Files:**
- Modify: `src/lib/queries.ts` (append at end)
- Modify: `src/lib/item-view.ts:31` (the `TabId` union)
- Create: `src/components/AmmoUsedByGrid.tsx`
- Modify: `src/app/items/[slug]/page.tsx`

- [ ] **Step 1: Add the query to `src/lib/queries.ts`**

Append at the end of the file:

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

- [ ] **Step 2: Add `"used-by"` to the `TabId` union in `src/lib/item-view.ts`**

Change line 31 from:

```ts
export type TabId = "crafted-by" | "used-in" | "buy" | "sell" | "loot";
```

to:

```ts
export type TabId = "crafted-by" | "used-in" | "buy" | "sell" | "used-by" | "loot";
```

(Leave `availableTabs` unchanged — this tab is pushed manually like Loot.)

- [ ] **Step 3: Create `src/components/AmmoUsedByGrid.tsx`**

```tsx
import { ItemIconLink } from "@/components/ItemIconLink";
import type { AmmoUser } from "@/lib/queries";

/** "Used by" tab on an ammo page: the weapons/artillery that fire this ammo, as an icon grid
 *  (icon + name tooltip, linked to each weapon). Mirrors the loot grid; no amounts. */
export function AmmoUsedByGrid({ items }: { items: AmmoUser[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((w) => (
        <ItemIconLink key={w.slug} slug={w.slug} name={w.name} icon={w.icon} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire the query + tab into `src/app/items/[slug]/page.tsx`**

Add to the imports block (after the existing `getCratesContaining` import on line 3 and the component imports):

```ts
import { getItemBySlug, getCratesContaining, getWeaponsUsingAmmo } from "@/lib/queries";
```

(Replace the existing `import { getItemBySlug, getCratesContaining } from "@/lib/queries";` line — do not add a second import line.)

Add the component import alongside the other component imports (e.g. after the `CrateDropList` import on line 15):

```ts
import { AmmoUsedByGrid } from "@/components/AmmoUsedByGrid";
```

After the existing `const drops = await getCratesContaining(item.slug);` line, add:

```ts
  const ammoUsers = await getWeaponsUsingAmmo(item.slug);
```

Then, after the `availableTabs(...).map(...)` block builds `tabs` and **before** the existing `if (drops.length > 0)` Loot push, insert:

```ts
  if (ammoUsers.length > 0) {
    tabs.push({ id: "used-by", label: "Used by", content: <AmmoUsedByGrid items={ammoUsers} /> });
  }
```

This yields tab order: Crafted by · Used in · Buy · Sell · **Used by** · Loot.

- [ ] **Step 5: Run the e2e test to verify it passes**

Run: `npm run test:e2e -- -g "Used by tab"`

Expected: PASS — the "Used by" tab is visible, and after clicking it the panel contains a link to `/items/semi-automatic-pistol` with `aria-label="Blitz 10R Pistol"`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries.ts src/lib/item-view.ts src/components/AmmoUsedByGrid.tsx src/app/items/[slug]/page.tsx tests/e2e/wiki.spec.ts
git commit -m "feat(wiki): add Used by tab on ammo listing weapons that fire it"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Type-check via production build**

Run: `npm run build`
Expected: build succeeds (Next.js fails the build on type errors).

- [ ] **Step 3: Unit tests still green**

Run: `npm test`
Expected: PASS (no pure-logic changes, but confirms nothing broke).

- [ ] **Step 4: Full e2e suite (incl. axe a11y)**

Ensure no stale `:3000` server (see Gotchas in `instructions.md`); if needed, build + `next start -p 3100` + a throwaway `playwright.tmp.config.ts` pointed at `:3100` to avoid `reuseExistingServer` serving stale code.

Run: `npm run test:e2e`
Expected: PASS, including the existing axe checks on `/items/pistol-ammo` (which now also renders the Used by tab).

---

## Self-Review Notes

- **Spec coverage:** query (§Components.1) → Task 3.1; component (§Components.2) → Task 3.3; wire-up (§Components.3) → Task 3.4; `TabId` (§Components.4) → Task 3.2; deferred task 1 doc (§Task 1 deferred) → Task 1; testing (§Testing) → Tasks 2 & 4. All spec sections covered.
- **Type consistency:** `AmmoUser` is defined in `queries.ts` (Task 3.1) and imported by both `AmmoUsedByGrid` (Task 3.3) and implicitly used by the page (Task 3.4). `getWeaponsUsingAmmo` name is identical across the query def, the page import, and the e2e expectations. `"used-by"` tab id matches between `TabId` (Task 3.2) and the page push (Task 3.4).
- **No placeholders:** every code/command step shows the actual content.
