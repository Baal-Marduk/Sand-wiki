# Translucent Rarity Background + Default Rarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soften the item-icon rarity tile to a ~65% translucent tint (in-game look), and give every item a rarity — defaulting to `Common` when no rarity info exists — so every item is tinted, badged, and covered by the rarity filter.

**Architecture:** Add two pure helpers to `src/lib/rarity.ts` (`rarityBgColor` for the translucent fill, `DEFAULT_RARITY` constant), unit-tested. `ItemIcon` uses `rarityBgColor` for its tile background. `prisma/seed.ts` defaults each item's stored `rarity` to `DEFAULT_RARITY` when enrichment lacks a valid one, so the filter/sort/badge/tint are all consistent. Re-seed to apply.

**Tech Stack:** TypeScript, Prisma 6 (Neon Postgres), Next.js 16, Tailwind v4 / DaisyUI 5, Vitest, Playwright + axe.

---

## File Structure

- **Modify** `src/lib/rarity.ts` — add `DEFAULT_RARITY` + `rarityBgColor` (Task 1).
- **Modify** `src/lib/rarity.test.ts` — cover both (Task 1).
- **Modify** `src/components/ItemIcon.tsx` — tile uses `rarityBgColor` (Task 2).
- **Modify** `prisma/seed.ts` — default rarity to `DEFAULT_RARITY` (Task 3).
- **Modify** `TODO.md` — mark #9 done (Task 4).

---

## Task 1: `rarityBgColor` + `DEFAULT_RARITY` (TDD)

**Files:**
- Modify: `src/lib/rarity.ts`
- Test: `src/lib/rarity.test.ts`

- [ ] **Step 1: Write failing tests**

Append inside the `describe("rarity", ...)` block in `src/lib/rarity.test.ts` (before its closing `});`):

```ts
  it("rarityBgColor appends ~65% alpha to the solid color; null for unknown/absent", () => {
    expect(rarityBgColor("Noteworthy")).toBe("#9C86B7A6");
    expect(rarityBgColor("common")).toBe("#ADADADA6");
    expect(rarityBgColor("nope")).toBeNull();
    expect(rarityBgColor(null)).toBeNull();
    expect(rarityBgColor(undefined)).toBeNull();
  });

  it("DEFAULT_RARITY is a valid rarity equal to Common", () => {
    expect(DEFAULT_RARITY).toBe("Common");
    expect(isRarity(DEFAULT_RARITY)).toBe(true);
  });
```

Update the import line at the top of the file from:

```ts
import { rarityColor, rarityTier, isRarity, RARITIES } from "./rarity";
```

to:

```ts
import { rarityColor, rarityBgColor, rarityTier, isRarity, RARITIES, DEFAULT_RARITY } from "./rarity";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/rarity.test.ts`
Expected: FAIL — `rarityBgColor`/`DEFAULT_RARITY` not exported.

- [ ] **Step 3: Implement**

In `src/lib/rarity.ts`, add after the existing `rarityColor` function:

```ts
/** Default rarity for items with no rarity info — everything is at least Common. */
export const DEFAULT_RARITY = "Common";

/** Alpha-blended rarity color for filled backgrounds (the item-icon tile), ~65% opacity —
 *  a softened tint matching the in-game slot wash. Solid `rarityColor` stays for small
 *  indicators (the badge dot). Null for unknown/absent. */
export function rarityBgColor(name?: string | null): string | null {
  const c = rarityColor(name);
  return c ? `${c}A6` : null; // 0xA6 ≈ 65% alpha
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/rarity.test.ts`
Expected: PASS (all rarity tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/lib/rarity.ts src/lib/rarity.test.ts && git commit -F - <<'EOF'
feat(wiki): add rarityBgColor (translucent) and DEFAULT_RARITY

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: ItemIcon tile uses the translucent tint

**Files:**
- Modify: `src/components/ItemIcon.tsx`

The component only uses the rarity color for the tile background, so switch its import and
call from `rarityColor` to `rarityBgColor`. No other change — `tint` already drives the
`style={{ backgroundColor: tint }}` and the `bg`/text-color fallback.

- [ ] **Step 1: Swap the import**

Change line 1 of `src/components/ItemIcon.tsx` from:

```tsx
import { rarityColor } from "@/lib/rarity";
```

to:

```tsx
import { rarityBgColor } from "@/lib/rarity";
```

- [ ] **Step 2: Swap the call**

Change the `tint` line from:

```tsx
  const tint = rarityColor(rarity);
```

to:

```tsx
  const tint = rarityBgColor(rarity);
```

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: PASS (no remaining `rarityColor` reference in this file; `git grep -n "rarityColor" src/components/ItemIcon.tsx` returns nothing).

- [ ] **Step 4: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/components/ItemIcon.tsx && git commit -F - <<'EOF'
feat(wiki): translucent rarity tint on item icon tile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Default every item's rarity to Common at seed time

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Import the default**

In `prisma/seed.ts`, the existing import is:

```ts
import { isRarity } from "../src/lib/rarity";
```

Change it to:

```ts
import { isRarity, DEFAULT_RARITY } from "../src/lib/rarity";
```

- [ ] **Step 2: Default the rarity**

Change the rarity-resolution block from:

```ts
    const e = enrichment[i.slug];
    let rarity: string | undefined;
    if (e?.rarity) {
      if (isRarity(e.rarity)) rarity = e.rarity;
      else console.warn(`Unknown rarity "${e.rarity}" for ${i.slug} — skipped`);
    }
```

to:

```ts
    const e = enrichment[i.slug];
    let rarity = DEFAULT_RARITY;
    if (e?.rarity) {
      if (isRarity(e.rarity)) rarity = e.rarity;
      else console.warn(`Unknown rarity "${e.rarity}" for ${i.slug} — defaulting to ${DEFAULT_RARITY}`);
    }
```

(The `prisma.item.create` call already passes `rarity` — it is now always a string.)

- [ ] **Step 3: Re-seed and verify no nulls remain**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm run db:seed`
Expected: `Seeded 124 items, ...` with no error.

Then verify zero null rarities:

Run:
```bash
cd /d/Documents/SandLabs/sand-wiki && npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); p.item.count({where:{rarity:null}}).then(n=>{console.log('null-rarity items:', n); return p.\$disconnect();});"
```
Expected: `null-rarity items: 0`.

- [ ] **Step 4: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add prisma/seed.ts && git commit -F - <<'EOF'
feat(wiki): default all items to Common rarity at seed time

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Full verification + mark TODO #9 done

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Unit suite + lint**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm run test && npm run lint`
Expected: unit suite PASS (99 tests — 97 prior + 2 new), lint clean.

- [ ] **Step 2: Full e2e (both-theme axe gate)**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm run test:e2e`
Expected: all tests PASS, including the axe a11y checks in both themes (the translucent tile is decorative; text sits elsewhere, so no contrast regression). DB-gated — if the build cannot reach the dev DB, run `npm run build` to confirm compilation and report that the live e2e run is DB-gated.

- [ ] **Step 3: Mark TODO #9 done**

In `TODO.md`, change:

```
- Make rarity background color slightly translucent like in game
```

to:

```
- [x] Make rarity background color slightly translucent like in game (~65% tint; all items default to Common)
```

- [ ] **Step 4: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add TODO.md && git commit -F - <<'EOF'
docs(wiki): mark TODO #9 (translucent rarity background) done

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Self-review notes

- **Spec coverage:** translucent tile (`rarityBgColor` Task 1 + ItemIcon Task 2); universal rarity default (`DEFAULT_RARITY` Task 1 + seed Task 3); badge dot stays solid (untouched — `[slug]/page.tsx` still imports `rarityColor`); tests for both helpers + null-rarity DB check (Tasks 1, 3); axe gate (Task 4).
- **Consistency:** `rarityBgColor`, `DEFAULT_RARITY` defined in Task 1 and consumed verbatim in Tasks 2–3. Alpha `A6` matches the approved ~65%.
- **No placeholders:** every step has exact before/after text and commands.
- **Note:** the badge dot in `src/app/items/[slug]/page.tsx:75` intentionally keeps the solid `rarityColor` — out of scope, not modified.
