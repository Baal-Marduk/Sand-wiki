# Rarity-Gradient Icon Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every item icon as a top-left rarity gradient tile (bright rarity corner → near-black), give non-item icons a neutral slot, and enlarge the detail-page icon to 216px.

**Architecture:** A pure helper in `rarity.ts` produces a `linear-gradient` CSS string with pre-mixed concrete hex stops (no `color-mix`, so it renders identically server-side). `ItemIcon` paints that gradient on a tile `<span>` with the sprite floated inside; when there is no rarity it falls back to a fixed neutral-slot gradient. The rarity value is threaded through the view types/queries feeding every call site that renders an item icon.

**Tech Stack:** Next.js (custom build — read `node_modules/next/dist/docs/` before touching framework APIs), React, TypeScript, Tailwind v4 + daisyUI, Prisma 6, Vitest.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/rarity.ts` | Rarity palette + color/gradient helpers | Add `mixHex`, `rarityGradient`; remove unused `rarityBgColor` |
| `src/lib/rarity.test.ts` | Unit tests for rarity helpers | Add `mixHex`/`rarityGradient` tests; drop `rarityBgColor` test |
| `src/components/ItemIcon.tsx` | Single icon render point | Gradient tile + neutral fallback + sprite-in-tile + drop-shadow; `lg` → 216px |
| `src/components/ItemIconLink.tsx` | Icon + tooltip used by recipes/loot/cost | Add `rarity` prop, forward to `ItemIcon` |
| `src/lib/recipes.ts` | Recipe view types + flattening | Add `rarity` to `RecipeLineItem`/`RecipeCardRow`; map in `row()` |
| `src/lib/recipes.test.ts` | Unit test for `toRecipeCard` | New file |
| `src/components/recipe-cells.tsx` | Renders recipe ingredient/output icons | Pass `rarity` to `ItemIconLink` |
| `src/lib/queries.ts` | Prisma queries / view shaping | Add `rarity` to ammo/weapon/loot/cost selects + `LinkItem` type |
| `src/components/ItemLinkList.tsx` | Ammo / "Used by" lists | Add `rarity` to `LinkListItem`, pass to `ItemIcon` |
| `src/components/LootTable.tsx` | Env-detail loot tiers | Add `rarity` to `LootEntryView`, pass to `ItemIconLink` |
| `src/app/environment/[slug]/page.tsx` | Env detail page | Map `e.item?.rarity` into loot entries |
| `src/app/tramplers/[slug]/page.tsx` | Trampler part detail | Pass `c.item?.rarity` for build-cost icons |

**Untouched (intentionally neutral — no rarity data):** `TramplerCard`, `EnvCard`, the trampler-part header icon. `ItemCard` and the item-detail header already pass `rarity`.

---

## Setup

- [ ] **Create a working branch**

The wider repo root is `d:\Documents\SandLabs` (branch `master`); the app lives in `sand-wiki/`. Work on a branch.

Run:
```bash
git switch -c feat/rarity-gradient-icons
```

---

## Task 1: Gradient helper in rarity.ts

**Files:**
- Modify: `sand-wiki/src/lib/rarity.ts`
- Test: `sand-wiki/src/lib/rarity.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this block inside the existing `describe("rarity", ...)` in `src/lib/rarity.test.ts`, and add `mixHex, rarityGradient` to the import on line 2:

```ts
  it("mixHex blends two hex colors by weight of the second", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#102030", "#403020", 0.5)).toBe("#282828");
    expect(mixHex("#ADADAD", "#FFFFFF", 0)).toBe("#ADADAD");
    expect(mixHex("#ADADAD", "#FFFFFF", 1)).toBe("#FFFFFF");
  });

  it("rarityGradient builds a top-left gradient with pre-mixed hex stops; null for unknown/absent", () => {
    const g = rarityGradient("Noteworthy");
    expect(g).toBe(
      `linear-gradient(135deg, ${mixHex("#9C86B7", "#FFFFFF", 0.05)} 0%, ` +
        `${mixHex("#9C86B7", "#14171F", 0.65)} 38%, #11131A 100%)`,
    );
    expect(rarityGradient("nope")).toBeNull();
    expect(rarityGradient(null)).toBeNull();
    expect(rarityGradient(undefined)).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd sand-wiki && npx vitest run src/lib/rarity.test.ts`
Expected: FAIL — `mixHex`/`rarityGradient` are not exported.

- [ ] **Step 3: Implement `mixHex` and `rarityGradient`**

In `src/lib/rarity.ts`, append:

```ts
/** Parse "#RRGGBB" → [r,g,b]. */
function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Blend two "#RRGGBB" colors. `t` is the weight of `b` (0 → a, 1 → b). Uppercase output. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`.toUpperCase();
}

/** CSS background for the rarity tile: a 135° gradient with a bright rarity corner
 *  fading to near-black. Concrete hex stops (no color-mix) so SSR and client match.
 *  Null for unknown/absent rarity → caller paints the neutral slot. */
export function rarityGradient(name?: string | null): string | null {
  const c = rarityColor(name);
  if (!c) return null;
  const corner = mixHex(c, "#FFFFFF", 0.05);
  const mid = mixHex(c, "#14171F", 0.65);
  return `linear-gradient(135deg, ${corner} 0%, ${mid} 38%, #11131A 100%)`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd sand-wiki && npx vitest run src/lib/rarity.test.ts`
Expected: PASS (all rarity tests green).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/rarity.ts sand-wiki/src/lib/rarity.test.ts
git commit -m "feat(wiki): rarityGradient helper for top-left rarity tile"
```

---

## Task 2: Restyle ItemIcon (gradient tile, neutral slot, 216px detail size)

**Files:**
- Modify: `sand-wiki/src/components/ItemIcon.tsx` (full rewrite)
- Modify: `sand-wiki/src/lib/rarity.ts` (remove unused `rarityBgColor`)
- Modify: `sand-wiki/src/lib/rarity.test.ts` (remove its test)

- [ ] **Step 1: Replace ItemIcon.tsx with the gradient version**

Overwrite `src/components/ItemIcon.tsx` with:

```tsx
import { rarityGradient } from "@/lib/rarity";

/** Neutral inventory slot for icons with no rarity (trampler parts, env entities). */
const NEUTRAL_SLOT = "linear-gradient(135deg, #2A2E37 0%, #181B22 45%, #11131A 100%)";

/** Item image on a rarity-tinted tile. When `icon` is set, render the sprite floated
 *  inside the tile; otherwise a placeholder glyph. Single change point for item imagery.
 *  Pass `decorative` when the name is already shown as adjacent text. Pass `rarity` to
 *  paint the rarity gradient (decorative — the rarity name is shown as text elsewhere);
 *  absent/unknown rarity falls back to the neutral slot. */
export function ItemIcon({
  name,
  icon,
  size = "md",
  decorative = false,
  rarity,
}: {
  name: string;
  icon?: string | null;
  size?: "sm" | "recipe" | "md" | "card" | "lg";
  decorative?: boolean;
  rarity?: string | null;
}) {
  const px = { sm: "size-5", recipe: "size-14", md: "size-12", card: "size-18", lg: "size-54" }[size];
  const gradient = rarityGradient(rarity);
  const tile = `item-sprite ${px} rounded-box shrink-0 overflow-hidden inline-flex items-center justify-center`;
  const style = { background: gradient ?? NEUTRAL_SLOT };

  if (icon) {
    return (
      <span style={style} className={tile}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icon}
          alt={decorative ? "" : name}
          className="size-[80%] object-contain [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.45))]"
        />
      </span>
    );
  }
  return (
    <span
      style={style}
      className={`${tile} ${gradient ? "text-base-100" : "text-base-content/40"}`}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name, title: name })}
    >
      <span aria-hidden="true">▦</span>
    </span>
  );
}
```

- [ ] **Step 2: Remove the now-unused `rarityBgColor`**

In `src/lib/rarity.ts`, delete the `rarityBgColor` function (the block with the `0xA6 ≈ 65% alpha` comment, lines ~25–31).

In `src/lib/rarity.test.ts`, remove `rarityBgColor` from the import on line 2, and delete the entire `it("rarityBgColor appends ~65% alpha ...")` block.

- [ ] **Step 3: Typecheck and run unit tests**

Run: `cd sand-wiki && npx tsc --noEmit && npx vitest run src/lib/rarity.test.ts`
Expected: tsc clean (no references to `rarityBgColor`), tests PASS.

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/components/ItemIcon.tsx sand-wiki/src/lib/rarity.ts sand-wiki/src/lib/rarity.test.ts
git commit -m "feat(wiki): ItemIcon rarity gradient tile, neutral slot, 216px detail size"
```

---

## Task 3: ItemIconLink forwards rarity

**Files:**
- Modify: `sand-wiki/src/components/ItemIconLink.tsx`

- [ ] **Step 1: Add the `rarity` prop and pass it through**

In `src/components/ItemIconLink.tsx`, extend the props and both `ItemIcon` usages.

Change the signature:
```tsx
export function ItemIconLink({
  slug, name, icon, amount, rarity,
}: { slug?: string; name: string; icon?: string | null; amount?: number; rarity?: string | null }) {
```

Change both `<ItemIcon ... />` lines (the linked and unlinked branches) to include `rarity`:
```tsx
          <ItemIcon name={name} icon={icon} size="recipe" rarity={rarity} />
```
```tsx
        <ItemIcon name={name} icon={icon} size="recipe" rarity={rarity} />
```

- [ ] **Step 2: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: clean (the new prop is optional; no call site breaks).

- [ ] **Step 3: Commit**

```bash
git add sand-wiki/src/components/ItemIconLink.tsx
git commit -m "feat(wiki): ItemIconLink forwards rarity to the tile"
```

---

## Task 4: Recipe rows carry rarity

**Files:**
- Modify: `sand-wiki/src/lib/recipes.ts`
- Create: `sand-wiki/src/lib/recipes.test.ts`
- Modify: `sand-wiki/src/components/recipe-cells.tsx`

Context: `getItemBySlug` already includes the full related `item` (`item: true`) for recipe inputs/outputs, so `rarity` is present at runtime — only the types and the `row()` mapper need it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/recipes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toRecipeCard, type RecipeWithItems } from "./recipes";

describe("toRecipeCard", () => {
  it("carries each line item's rarity into the card rows", () => {
    const recipe: RecipeWithItems = {
      slug: "r", workbench: null, tier: null, craftTimeSeconds: null,
      inputs: [{ amount: 2, item: { slug: "a", name: "A", icon: null, rarity: "Rare" } }],
      outputs: [{ amount: 1, item: { slug: "b", name: "B", icon: "/b.png", rarity: null } }],
    };
    const card = toRecipeCard(recipe);
    expect(card.inputs[0].rarity).toBe("Rare");
    expect(card.outputs[0].rarity).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd sand-wiki && npx vitest run src/lib/recipes.test.ts`
Expected: FAIL — `rarity` is not on the line-item type / not mapped.

- [ ] **Step 3: Add `rarity` to the types and `row()`**

In `src/lib/recipes.ts`:

Add `rarity` to `RecipeLineItem`:
```ts
export interface RecipeLineItem { slug: string; name: string; icon: string | null; rarity: string | null }
```
Add `rarity` to `RecipeCardRow`:
```ts
export interface RecipeCardRow { slug: string; name: string; icon: string | null; rarity: string | null; amount: number }
```
Update `row()` to map it:
```ts
const row = (l: RecipeLine): RecipeCardRow => ({ slug: l.item.slug, name: l.item.name, icon: l.item.icon, rarity: l.item.rarity, amount: l.amount });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd sand-wiki && npx vitest run src/lib/recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass rarity from the ingredient cells**

In `src/components/recipe-cells.tsx`, update the `ItemIconLink` in `IngredientList`:
```tsx
        <ItemIconLink key={`${r.slug}-${i}`} slug={r.slug} name={r.name} icon={r.icon} amount={r.amount} rarity={r.rarity} />
```

- [ ] **Step 6: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: clean. (`getItemBySlug`'s included `item: true` already provides `rarity`, so no query change is needed.)

- [ ] **Step 7: Commit**

```bash
git add sand-wiki/src/lib/recipes.ts sand-wiki/src/lib/recipes.test.ts sand-wiki/src/components/recipe-cells.tsx
git commit -m "feat(wiki): recipe ingredient/output icons show rarity"
```

---

## Task 5: Ammo / "Used by" lists carry rarity

**Files:**
- Modify: `sand-wiki/src/lib/queries.ts`
- Modify: `sand-wiki/src/components/ItemLinkList.tsx`

- [ ] **Step 1: Add `rarity` to the LinkItem shape and queries**

In `src/lib/queries.ts`:

Extend the `LinkItem` type (the `{slug,name,icon}` rows for ItemLinkList):
```ts
type LinkItem = { slug: string; name: string; icon: string | null; rarity: string | null };
```

In `getAmmoByCaliber`, add `rarity` to the select:
```ts
    select: { slug: true, name: true, icon: true, rarity: true },
```

In `getWeaponsByCaliber`, add `rarity` to the select and carry it through the final map:
```ts
    select: { slug: true, name: true, icon: true, rarity: true, ammoName: true },
```
```ts
    .map(({ slug, name, icon, rarity }) => ({ slug, name, icon, rarity }));
```

- [ ] **Step 2: Add `rarity` to ItemLinkList and pass it through**

In `src/components/ItemLinkList.tsx`, extend the row type:
```ts
export interface LinkListItem { slug: string; name: string; icon: string | null; rarity: string | null }
```
And pass it to the icon:
```tsx
            <ItemIcon name={it.name} icon={it.icon} size="recipe" decorative rarity={it.rarity} />
```

- [ ] **Step 3: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: clean. (`getAmmoByCaliber`/`getWeaponsByCaliber` now return `rarity`, matching `LinkListItem`; the item-detail page passes these arrays straight to `ItemLinkList`.)

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/lib/queries.ts sand-wiki/src/components/ItemLinkList.tsx
git commit -m "feat(wiki): ammo and used-by list icons show rarity"
```

---

## Task 6: Environment loot-tier icons carry rarity

**Files:**
- Modify: `sand-wiki/src/lib/queries.ts`
- Modify: `sand-wiki/src/components/LootTable.tsx`
- Modify: `sand-wiki/src/app/environment/[slug]/page.tsx`

- [ ] **Step 1: Include `rarity` in the loot-entry item select**

In `src/lib/queries.ts`, inside `getEnvEntityBySlug`, change the loot entry's `item` select to include `rarity`:
```ts
            include: { item: { select: { slug: true, icon: true, rarity: true } } },
```

- [ ] **Step 2: Add `rarity` to LootEntryView and pass it to the icon**

In `src/components/LootTable.tsx`, extend the view type:
```ts
export interface LootEntryView { slug: string | null; name: string; icon: string | null; rarity: string | null }
```
And pass it to `ItemIconLink`:
```tsx
        <ItemIconLink key={`${e.slug ?? e.name}-${i}`} slug={e.slug ?? undefined} name={e.name} icon={e.icon} rarity={e.rarity} />
```

- [ ] **Step 3: Map rarity in the env detail page**

In `src/app/environment/[slug]/page.tsx`, update the entries map to include `rarity`:
```tsx
        entries={t.entries.map((e) => ({ slug: e.item?.slug ?? null, name: e.name, icon: e.item?.icon ?? null, rarity: e.item?.rarity ?? null }))}
```

- [ ] **Step 4: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/queries.ts sand-wiki/src/components/LootTable.tsx sand-wiki/src/app/environment/[slug]/page.tsx
git commit -m "feat(wiki): environment loot icons show rarity"
```

---

## Task 7: Trampler build-cost icons carry rarity

**Files:**
- Modify: `sand-wiki/src/lib/queries.ts`
- Modify: `sand-wiki/src/app/tramplers/[slug]/page.tsx`

Note: only the build-cost *ingredient* icons (real items) get rarity. The part's own header icon stays the neutral slot.

- [ ] **Step 1: Include `rarity` in the cost-entry item select**

In `src/lib/queries.ts`, inside `getTramplerPartBySlug`, change the cost entry's `item` select:
```ts
        include: { item: { select: { slug: true, icon: true, rarity: true } } },
```

- [ ] **Step 2: Pass rarity to the build-cost icons**

In `src/app/tramplers/[slug]/page.tsx`, update the cost-entry `ItemIconLink` (around line 69):
```tsx
              <ItemIconLink key={c.name} slug={c.item?.slug ?? undefined} name={c.name} icon={c.item?.icon ?? null} amount={c.amount} rarity={c.item?.rarity ?? null} />
```

- [ ] **Step 3: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/lib/queries.ts sand-wiki/src/app/tramplers/[slug]/page.tsx
git commit -m "feat(wiki): trampler build-cost icons show rarity"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `cd sand-wiki && npm test`
Expected: PASS, no failures.

- [ ] **Step 2: Typecheck the whole project**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Production build**

Run: `cd sand-wiki && npm run build`
Expected: build succeeds (server-rendered gradients require no client APIs).

- [ ] **Step 4: Visual check (dev server)**

Run: `cd sand-wiki && npm run dev`, then confirm in the browser:
- Items list cards: rarity gradient (top-left bright → dark) on every tile.
- Item detail header: icon is large (216px) with the gradient.
- A craftable item's "Crafted by" / "Used in" tabs: ingredient/output icons show rarity gradients.
- A weapon/ammo item: "Ammo" / "Used by" list icons show rarity gradients.
- An environment entity detail: loot-tier icons show rarity gradients.
- A trampler part detail: build-cost ingredient icons show rarity gradients; the part's **own header icon** is the neutral (uncolored) slot at 216px.

- [ ] **Step 5: Run e2e (optional but recommended)**

Run: `cd sand-wiki && npm run test:e2e`
Expected: existing `tests/e2e/wiki.spec.ts` still passes.

---

## Self-Review Notes

- **Spec coverage:** Gradient treatment (Task 1–2), gradient everywhere an item icon appears (Tasks 3–7 cover recipe rows, ammo/used-by lists, env loot, trampler build-cost; ItemCard + item-detail header already had it), neutral slot for non-item icons (Task 2 default; tramplers/env list cards & part header untouched), 216px detail size (Task 2, shared `lg`). All spec sections map to a task.
- **Type consistency:** `rarity: string | null` used uniformly across `RecipeLineItem`, `RecipeCardRow`, `LinkItem`/`LinkListItem`, `LootEntryView`, and the optional `rarity?: string | null` prop on `ItemIcon`/`ItemIconLink`. `mixHex`/`rarityGradient` names match between Task 1 implementation and the rarity test.
- **No placeholders:** every code step shows the exact code; every run step shows the exact command and expected result.
