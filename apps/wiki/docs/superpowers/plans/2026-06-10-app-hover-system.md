# App-wide Hover System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every interactive surface (text links, nav links, tabs, clickable cards, list rows, clickable item icons, selects) one consistent, subtle hover/focus treatment, centralized in global CSS so it applies app-wide and new components inherit it automatically.

**Architecture:** Hover behavior lives in `src/app/globals.css` as **unlayered** rules keyed off classes components already use (`.link`, `.tab`, `a.card`, `.select`) plus three small shared marker classes (`.nav-link`, `.row-link`, `.item-sprite`). Rules must be unlayered because Tailwind v4 utilities live in `@layer utilities` and would otherwise override layered hover colors. Components are then normalized to drop their bespoke inline `hover:*` utilities. Treatment is subtle (color / background / underline / brightness only — no motion); every `:hover` is paired with `:focus-visible` for keyboard parity; colors use the active theme's CSS variables so both themes are handled automatically.

**Tech Stack:** Tailwind CSS v4, DaisyUI 5, Next.js 16 (App Router), Playwright + axe (e2e).

---

## File Structure

- **Modify** `src/app/globals.css` — add the centralized hover/focus rules (Task 1). Single source of truth.
- **Modify** `src/components/ItemIcon.tsx` — add `item-sprite` marker class (Task 2).
- **Modify** `src/components/MainNav.tsx` — `linkCls` uses `nav-link` (Task 3).
- **Modify** `src/components/ItemLinkList.tsx`, `src/components/CategoryQuickNav.tsx` — use `row-link` (Task 4).
- **Modify** `src/components/ItemCard.tsx`, `EnvCard.tsx`, `TramplerCard.tsx`, `src/app/page.tsx`, `src/app/environment/page.tsx`, `src/app/tramplers/page.tsx` — drop redundant inline card hovers, now driven by `a.card` (Task 5).
- **Modify** `tests/e2e/wiki.spec.ts` — one hover smoke test (Task 6).

---

## Task 1: Centralized hover/focus CSS

**Files:**
- Modify: `src/app/globals.css` (append after the existing `.theme-icon-day` / `[data-theme="desertday"]` rules at the end of the file)

- [ ] **Step 1: Append the hover rules**

Add to the end of `src/app/globals.css`:

```css
/* ── App-wide hover/focus affordances (TODO #8) ──────────────────────────────
 * Centralized so every interactive surface gets a consistent treatment and new
 * components inherit it. Rules are intentionally UNLAYERED: Tailwind utilities live
 * in `@layer utilities`, which wins over any @layer — these must override utility
 * text/bg colors on hover (e.g. a non-active tab's `text-base-content/75`).
 * Subtle vocabulary: color / background / underline / brightness only — no motion,
 * so prefers-reduced-motion needs no special handling. Every :hover is paired with
 * :focus-visible for keyboard parity. Colors come from the active theme's tokens. */
a, .tab, .btn, .select, .nav-link, .row-link, .card, .item-sprite {
  transition: color 0.15s, background-color 0.15s, border-color 0.15s, filter 0.15s, opacity 0.15s;
}
.link:hover, .link:focus-visible { color: var(--color-primary); }
.nav-link:hover, .nav-link:focus-visible { color: var(--color-primary); }
.tab:not(.tab-active):hover, .tab:not(.tab-active):focus-visible {
  color: var(--color-base-content);
  background-color: color-mix(in oklab, var(--color-base-200) 50%, transparent);
}
a.card:hover, a.card:focus-visible { background-color: var(--color-base-300); }
.row-link:hover, .row-link:focus-visible { background-color: var(--color-base-200); }
.select:hover { border-color: var(--color-primary); }
a:hover .item-sprite, a:focus-visible .item-sprite,
.group:hover .item-sprite, .group:focus-within .item-sprite { filter: brightness(1.1); }
```

- [ ] **Step 2: Verify the dev/build compiles the CSS**

Run: `npm run lint`
Expected: PASS (eslint does not lint CSS; this confirms nothing else broke). The CSS is validated end-to-end by the e2e build in Task 7.

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/app/globals.css && git commit -F - <<'EOF'
feat(wiki): centralized app-wide hover/focus styles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: `item-sprite` marker on ItemIcon

**Files:**
- Modify: `src/components/ItemIcon.tsx`

The icon brightness rule from Task 1 targets `.item-sprite` inside a hovered `<a>` / `.group`. Add that class to both rendered variants (the `<img>` and the placeholder `<span>`). Static icons (e.g. the detail-page header) are unaffected because they are not inside a hovered link/group.

- [ ] **Step 1: Add the class to the `<img>` branch**

In `src/components/ItemIcon.tsx`, change the image `className` from:

```tsx
        className={`${px} rounded-box ${bg} object-contain shrink-0`}
```

to:

```tsx
        className={`item-sprite ${px} rounded-box ${bg} object-contain shrink-0`}
```

- [ ] **Step 2: Add the class to the placeholder `<span>` branch**

In the same file, change the placeholder span `className` from:

```tsx
      className={`${px} inline-flex items-center justify-center rounded-box ${bg} shrink-0 ${tint ? "text-base-100" : "text-base-content/40"}`}
```

to:

```tsx
      className={`item-sprite ${px} inline-flex items-center justify-center rounded-box ${bg} shrink-0 ${tint ? "text-base-100" : "text-base-content/40"}`}
```

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/components/ItemIcon.tsx && git commit -F - <<'EOF'
feat(wiki): mark item sprites for hover brightness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Nav links use `nav-link`

**Files:**
- Modify: `src/components/MainNav.tsx`

`linkCls` is applied to the top-level nav links and dropdown trigger buttons. Replace its inline hover/transition with the shared `nav-link` class (the global rule supplies the hover color and the transition). Keep the base text color and layout utilities. Leave `dropdownItemCls` unchanged — its `hover:bg-base-300` already reads well on the dropdown panel.

- [ ] **Step 1: Edit `linkCls`**

In `src/components/MainNav.tsx`, change:

```tsx
const linkCls = "text-base-content hover:text-primary px-2 py-1 rounded transition-colors";
```

to:

```tsx
const linkCls = "nav-link text-base-content px-2 py-1 rounded";
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/components/MainNav.tsx && git commit -F - <<'EOF'
feat(wiki): nav links use shared nav-link hover

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: List rows use `row-link`

**Files:**
- Modify: `src/components/ItemLinkList.tsx`
- Modify: `src/components/CategoryQuickNav.tsx`

- [ ] **Step 1: ItemLinkList**

In `src/components/ItemLinkList.tsx`, change the row anchor className from:

```tsx
            className="flex items-center gap-3 rounded-box p-1 hover:bg-base-200"
```

to:

```tsx
            className="row-link flex items-center gap-3 rounded-box p-1"
```

- [ ] **Step 2: CategoryQuickNav**

In `src/components/CategoryQuickNav.tsx`, the inactive branch of the link className currently reads:

```tsx
                    : "border-base-300 lg:border-transparent hover:bg-base-200 text-base-content"
```

Change it to:

```tsx
                    : "row-link border-base-300 lg:border-transparent text-base-content"
```

(Leave the active branch — `bg-base-300 text-base-content font-semibold border-base-300` — unchanged; the active chip should not show a hover state.)

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/components/ItemLinkList.tsx src/components/CategoryQuickNav.tsx && git commit -F - <<'EOF'
feat(wiki): list rows use shared row-link hover

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Remove redundant inline card hovers

**Files:**
- Modify: `src/components/ItemCard.tsx`, `src/components/EnvCard.tsx`, `src/components/TramplerCard.tsx`
- Modify: `src/app/page.tsx`, `src/app/environment/page.tsx`, `src/app/tramplers/page.tsx`

Card anchors carry `.card`; the `a.card:hover` rule from Task 1 now drives the background lift, so the inline `hover:bg-base-300 transition-colors` is redundant. Remove just that fragment from each card anchor; keep all other classes.

- [ ] **Step 1: ItemCard / EnvCard / TramplerCard**

In each of `src/components/ItemCard.tsx`, `src/components/EnvCard.tsx`, `src/components/TramplerCard.tsx`, change the anchor className from:

```tsx
        className="card card-side bg-base-200 hover:bg-base-300 transition-colors h-full items-center gap-3 p-3"
```

to:

```tsx
        className="card card-side bg-base-200 h-full items-center gap-3 p-3"
```

- [ ] **Step 2: environment and tramplers landing pages**

In `src/app/environment/page.tsx` and `src/app/tramplers/page.tsx`, change the card anchor className from:

```tsx
                  className="card bg-base-200 hover:bg-base-300 transition-colors p-4 flex flex-row items-center gap-3"
```

to:

```tsx
                  className="card bg-base-200 p-4 flex flex-row items-center gap-3"
```

- [ ] **Step 3: home page**

In `src/app/page.tsx`, change the card anchor className from:

```tsx
              className="card bg-base-200 hover:bg-base-300 transition-colors"
```

to:

```tsx
              className="card bg-base-200"
```

(Leave the home hero link's `hover:opacity-80 transition-opacity` on `src/app/page.tsx:22` as-is — it is not a card and is intentionally out of this vocabulary.)

- [ ] **Step 4: Verify no stray `hover:bg-base-300` remains on cards**

Run: `cd /d/Documents/SandLabs/sand-wiki && git grep -n "card.*hover:bg-base-300" -- src`
Expected: no output (all card hovers now come from global CSS).

Then run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/components/ItemCard.tsx src/components/EnvCard.tsx src/components/TramplerCard.tsx src/app/page.tsx src/app/environment/page.tsx src/app/tramplers/page.tsx && git commit -F - <<'EOF'
feat(wiki): drop redundant card hovers (now global a.card)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: E2E hover smoke test

**Files:**
- Modify: `tests/e2e/wiki.spec.ts`

Validates the three central treatments with deterministic fixtures: a clickable card (`/items` grid), a nav link (`About`), and a non-active tab (`/items/sniper-rifle-iron-sights-silencer` has both "Crafted by" — active — and "Used in"). Assertions compare each element's own pre-hover computed style to its hovered style (robust against theme/token changes).

- [ ] **Step 1: Append the test**

Append to `tests/e2e/wiki.spec.ts` (after the existing tests):

```ts
test("interactive surfaces show a consistent hover affordance", async ({ page }) => {
  await page.goto("/items");

  // Clickable card: background lifts on hover.
  const card = page.locator("a.card").first();
  await expect(card).toBeVisible();
  const cardBefore = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  await card.hover();
  await expect
    .poll(() => card.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(cardBefore);

  // Nav link: color shifts on hover.
  const about = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "About" });
  const linkBefore = await about.evaluate((el) => getComputedStyle(el).color);
  await about.hover();
  await expect
    .poll(() => about.evaluate((el) => getComputedStyle(el).color))
    .not.toBe(linkBefore);

  // Non-active tab: background appears on hover.
  await page.goto("/items/sniper-rifle-iron-sights-silencer");
  const usedIn = page.getByRole("tab", { name: "Used in" }); // "Crafted by" is the default-active tab
  const tabBefore = await usedIn.evaluate((el) => getComputedStyle(el).backgroundColor);
  await usedIn.hover();
  await expect
    .poll(() => usedIn.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(tabBefore);
});
```

- [ ] **Step 2: Run the test**

Run: `cd /d/Documents/SandLabs/sand-wiki && npx playwright test -g "consistent hover affordance"`
Expected: PASS. (Playwright's config runs `next build && next start`, which needs the dev `DATABASE_URL` from `.env`. If the build cannot reach the DB in this environment, run `npm run build` to confirm compilation and report that the live run is DB-gated.)

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add tests/e2e/wiki.spec.ts && git commit -F - <<'EOF'
test(wiki): e2e smoke test for global hover affordances

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: Full verification + mark TODO #8 done

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Unit suite + lint**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm run test && npm run lint`
Expected: unit suite PASS (97 tests, unaffected by CSS), lint clean.

- [ ] **Step 2: Full e2e suite (both themes axe gate + hover smoke)**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm run test:e2e`
Expected: all tests PASS — especially the axe a11y checks in both `desertnight` and `desertday`, confirming the hover/focus changes introduce no serious/critical violations. (DB-gated as in Task 6 — if unreachable, report it.)

- [ ] **Step 3: Mark TODO #8 done**

In `TODO.md`, change:

```
- add hover effect on links and tabs and interactive ui in app
```

to:

```
- [x] add hover effect on links and tabs and interactive ui in app (global hover system in globals.css)
```

- [ ] **Step 4: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add TODO.md && git commit -F - <<'EOF'
docs(wiki): mark TODO #8 (app-wide hover system) done

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Self-review notes

- **Spec coverage:** global CSS keyed off existing classes + 3 marker classes (Task 1); focus-visible parity and theme-var colors (Task 1); `item-sprite` marker (Task 2); nav-link (Task 3); row-link normalization of ItemLinkList + CategoryQuickNav (Task 4); card-hover normalization across 3 components + 3 pages, hero link left alone (Task 5); e2e smoke test for link/card/tab + reliance on the axe gate (Tasks 6–7); reduced-motion explicitly a non-issue, noted in the CSS comment (Task 1).
- **Cascade-layer correctness:** rules are unlayered so they beat Tailwind utilities (e.g. a tab's `text-base-content/75`). Called out in the spec and the CSS comment.
- **Class-name consistency:** `nav-link`, `row-link`, `item-sprite` are defined in Task 1's CSS and applied verbatim in Tasks 2–4. `a.card` targets the existing `.card` anchors normalized in Task 5.
- **No placeholders:** every code step shows the exact before/after text or full snippet.
