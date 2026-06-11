# Loot Ordering, Rarity Saturation & Recipe Quantity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order container loot by rarity (Common→Experimental), bump the rarity palette saturation, and make recipe `×N` amounts bolder.

**Architecture:** All three are presentation-only. A new pure comparator `byRarityThenName` in `rarity.ts` (unit-tested) drives the loot sort; the palette change is a hex swap in the same file that every consumer reads automatically; the quantity change is a Tailwind class swap in `ItemIconLink`.

**Tech Stack:** Next.js (custom build — read `node_modules/next/dist/docs/` before touching framework APIs), React, TypeScript, Tailwind v4 + daisyUI, Vitest.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/rarity.ts` | Rarity palette + helpers | New palette hex; add `byRarityThenName` comparator |
| `src/lib/rarity.test.ts` | Rarity unit tests | Update color/gradient assertions; add comparator tests |
| `src/app/environment/[slug]/page.tsx` | Container detail page | Sort loot entries with `byRarityThenName` |
| `src/components/ItemIconLink.tsx` | Icon + `×amount` | Bolder quantity classes |

---

## Setup

- [ ] **Create a working branch**

Repo root `d:\Documents\SandLabs` (branch `master`); app in `sand-wiki/`.

Run:
```bash
git switch -c feat/loot-order-rarity-quantity
```

---

## Task 1: Palette saturation + rarity comparator

**Files:**
- Modify: `sand-wiki/src/lib/rarity.ts`
- Test: `sand-wiki/src/lib/rarity.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `src/lib/rarity.test.ts`:

(a) Update the two color assertions to the new palette:
```ts
    expect(rarityColor("Common")).toBe("#AEAEB2");
    expect(rarityColor("noteworthy")).toBe("#A37FC9");
```

(b) Make the `rarityGradient` test palette-independent — replace the hard-coded `#9C86B7`
inputs with `rarityColor("Noteworthy")`. The test body becomes:
```ts
  it("rarityGradient builds a top-left gradient with pre-mixed hex stops; null for unknown/absent", () => {
    const c = rarityColor("Noteworthy");
    const g = rarityGradient("Noteworthy");
    expect(g).toBe(
      `linear-gradient(135deg, ${mixHex(c, "#FFFFFF", 0.05)} 0%, ` +
        `${mixHex(c, "#14171F", 0.65)} 38%, #11131A 100%)`,
    );
    expect(rarityGradient("nope")).toBeNull();
    expect(rarityGradient(null)).toBeNull();
    expect(rarityGradient(undefined)).toBeNull();
  });
```

(c) Add `byRarityThenName` to the import on line 2, and add a new test block inside
`describe("rarity", ...)`:
```ts
  it("byRarityThenName orders by rarity tier asc, unknown last, then by name", () => {
    const rare = { rarity: "Rare", name: "Bolt" };
    const rareEarly = { rarity: "Rare", name: "Axle" };
    const common = { rarity: "Common", name: "Zinc" };
    const unknown = { rarity: null, name: "Mystery" };
    const sorted = [rare, unknown, common, rareEarly].sort(byRarityThenName);
    expect(sorted.map((x) => x.name)).toEqual(["Zinc", "Axle", "Bolt", "Mystery"]);
    expect(byRarityThenName(common, rare)).toBeLessThan(0);
    expect(byRarityThenName(unknown, common)).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /d/Documents/SandLabs/sand-wiki && npx vitest run src/lib/rarity.test.ts`
Expected: FAIL — colors mismatch and `byRarityThenName` is not exported.

- [ ] **Step 3: Update the palette and add the comparator**

In `src/lib/rarity.ts`, replace the `RARITIES` array values:
```ts
export const RARITIES: Rarity[] = [
  { name: "Common", tier: 1, color: "#AEAEB2" },
  { name: "Uncommon", tier: 2, color: "#7CB079" },
  { name: "Rare", tier: 3, color: "#7AA8D2" },
  { name: "Noteworthy", tier: 4, color: "#A37FC9" },
  { name: "Remarkable", tier: 5, color: "#E59A52" },
  { name: "Experimental", tier: 6, color: "#D85F64" },
];
```

Add the comparator (place it after `rarityTier`):
```ts
/** Array sort comparator: rarity tier ascending (Common→Experimental), unknown/absent
 *  rarity last, then name A→Z. For ordering item lists by rarity. */
export function byRarityThenName<T extends { rarity?: string | null; name: string }>(a: T, b: T): number {
  const ta = rarityTier(a.rarity) || Infinity; // unknown (tier 0) sorts last
  const tb = rarityTier(b.rarity) || Infinity;
  if (ta !== tb) return ta - tb;
  return a.name.localeCompare(b.name);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /d/Documents/SandLabs/sand-wiki && npx vitest run src/lib/rarity.test.ts`
Expected: PASS (all rarity tests green, including the new comparator test).

- [ ] **Step 5: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki
git add src/lib/rarity.ts src/lib/rarity.test.ts
git commit -m "feat(wiki): boost rarity palette saturation + byRarityThenName comparator"
```
(Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

## Task 2: Order container loot by rarity

**Files:**
- Modify: `sand-wiki/src/app/environment/[slug]/page.tsx`

- [ ] **Step 1: Sort the loot entries**

Add `byRarityThenName` to the queries/lib import. The file currently imports from `@/lib/queries`;
add a new import line near the top:
```ts
import { byRarityThenName } from "@/lib/rarity";
```

Change the entries expression (currently the `t.entries.map(...)` passed to `LootTable`) to
sort after mapping:
```tsx
      <LootTable
        entries={t.entries
          .map((e) => ({ slug: e.item?.slug ?? null, name: e.name, icon: e.item?.icon ?? null, rarity: e.item?.rarity ?? null }))
          .sort(byRarityThenName)}
      />
```

- [ ] **Step 2: Typecheck**

Run: `cd /d/Documents/SandLabs/sand-wiki && npx tsc --noEmit`
Expected: clean. (The mapped objects have `{ rarity, name }`, satisfying the comparator's generic constraint.)

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki
git add src/app/environment/[slug]/page.tsx
git commit -m "feat(wiki): order container loot by rarity (common first)"
```

---

## Task 3: Bolder recipe quantity

**Files:**
- Modify: `sand-wiki/src/components/ItemIconLink.tsx`

- [ ] **Step 1: Swap the quantity classes**

In `src/components/ItemIconLink.tsx`, change the amount span (line 18) from:
```tsx
      {amount != null && <span className="text-xs text-base-content/60">×{amount}</span>}
```
to:
```tsx
      {amount != null && <span className="text-sm font-bold text-base-content">×{amount}</span>}
```

- [ ] **Step 2: Typecheck**

Run: `cd /d/Documents/SandLabs/sand-wiki && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki
git add src/components/ItemIconLink.tsx
git commit -m "feat(wiki): make recipe quantity (xN) bolder and larger"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests + typecheck**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm test && npx tsc --noEmit`
Expected: all tests pass, tsc clean.

- [ ] **Step 2: Production build**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Visual check (dev server)**

If a dev server isn't already running, `npm run dev`, then confirm:
- A container's detail page lists loot Common → Experimental within each tier; unknown-rarity items last.
- Grey (Common) / green (Uncommon) / blue (Rare) tiles are clearly distinguishable.
- Recipe ingredient `×N` reads boldly (item detail Crafted-by/Used-in tabs; trampler build cost).

---

## Self-Review Notes

- **Spec coverage:** loot ordering (Task 2 via Task 1 comparator), palette saturation (Task 1), quantity visibility (Task 3); all test updates incl. the palette-independent gradient test (Task 1).
- **Placeholder scan:** none — exact code and commands throughout.
- **Consistency:** `byRarityThenName` signature/name identical in Task 1 (definition + test) and Task 2 (usage); the mapped loot entry shape `{ slug, name, icon, rarity }` satisfies the comparator's `{ rarity?, name }` constraint.
- **Note:** loot-order correctness is covered by the `byRarityThenName` unit test; the page change just applies it (verified by tsc + the visual check), so no separate page-level test.
