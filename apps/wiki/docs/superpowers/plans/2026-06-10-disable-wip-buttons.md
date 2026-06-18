# Disable WIP-Page Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render in-app buttons that point to WIP destinations (the `Tech Tree`/`Tools` placeholder sections and the empty `NPCs` env category) as disabled — dimmed, non-interactive, `aria-disabled`, with a "soon" badge — instead of links.

**Architecture:** Single source of truth in `taxonomy.ts` (`isWipSection` for placeholder sections; a `wip` flag on the NPCs category). A shared `WipBadge` component and disabled-span/card treatment applied at the four link sites: MainNav top bar, MainNav Environment dropdown, the home "Browse by section" cards, and the environment landing cards. Placeholder pages stay reachable by direct URL.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript, Tailwind v4 / DaisyUI 5, Vitest, Playwright + axe.

---

## File Structure

- **Modify** `src/lib/taxonomy.ts` — `Category.wip` + `isWipSection` (Task 1).
- **Modify** `src/lib/taxonomy.test.ts` — cover both (Task 1).
- **Create** `src/components/WipBadge.tsx` — shared "soon" badge (Task 2).
- **Modify** `src/components/MainNav.tsx` — disable placeholder sections + wip categories (Task 3).
- **Modify** `src/app/page.tsx` — disable placeholder section cards (Task 4).
- **Modify** `src/app/environment/page.tsx` — disable wip category cards (Task 5).
- **Modify** `tests/e2e/wiki.spec.ts` — nav disabled-state test (Task 6).
- **Modify** `TODO.md` — mark done (Task 7).

---

## Task 1: Taxonomy WIP markers (TDD)

**Files:**
- Modify: `src/lib/taxonomy.ts`
- Test: `src/lib/taxonomy.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/lib/taxonomy.test.ts`, add `isWipSection` to the existing import from `./taxonomy` (it currently imports several names — add `isWipSection`, and `getSection`/`SECTIONS` if not already imported; both are exported). Then add this block before the file's final closing line:

```ts
import { isWipSection, getSection } from "./taxonomy"; // if not already imported above

describe("WIP markers", () => {
  it("flags placeholder sections as WIP", () => {
    expect(isWipSection(getSection("tech")!)).toBe(true);
    expect(isWipSection(getSection("tools")!)).toBe(true);
  });
  it("does not flag data sections as WIP", () => {
    expect(isWipSection(getSection("items")!)).toBe(false);
    expect(isWipSection(getSection("environment")!)).toBe(false);
    expect(isWipSection(getSection("tramplers")!)).toBe(false);
  });
  it("marks the NPCs env category wip and leaves the others live", () => {
    const env = getSection("environment")!;
    const bySlug = Object.fromEntries(env.categories.map((c) => [c.slug, c]));
    expect(bySlug["npcs"].wip).toBe(true);
    expect(bySlug["loot-containers"].wip).toBeFalsy();
    expect(bySlug["landmarks"].wip).toBeFalsy();
    expect(bySlug["game-modes"].wip).toBeFalsy();
  });
});
```

(If `describe`/`expect`/`it` and the `./taxonomy` import already exist at the top, do NOT duplicate the vitest import — only add the names you need. Avoid a duplicate `getSection` import.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/taxonomy.test.ts`
Expected: FAIL — `isWipSection` not exported / `wip` missing.

- [ ] **Step 3: Implement**

In `src/lib/taxonomy.ts`:

(a) add `wip` to the `Category` interface:

```ts
export interface Category {
  slug: string;
  label: string;
  wip?: boolean;
}
```

(b) set the NPCs category `wip` in the environment section's categories (in `SECTIONS`):

```ts
      { slug: "npcs", label: "NPCs", wip: true },
```

(c) add the helper (next to the other section helpers, e.g. after `getSection`):

```ts
/** A section whose page is a placeholder ("coming soon") rather than real data. */
export function isWipSection(section: Section): boolean {
  return section.kind === "placeholder";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/taxonomy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/lib/taxonomy.ts src/lib/taxonomy.test.ts && git commit -F - <<'EOF'
feat(wiki): mark WIP sections (isWipSection) and the empty NPCs category

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Shared `WipBadge` component

**Files:**
- Create: `src/components/WipBadge.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/WipBadge.tsx`:

```tsx
/** Small "soon" tag shown next to disabled (work-in-progress) navigation entries. */
export function WipBadge() {
  return <span className="badge badge-ghost badge-xs uppercase tracking-wide">soon</span>;
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/components/WipBadge.tsx && git commit -F - <<'EOF'
feat(wiki): add shared WipBadge ("soon") component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: MainNav — disable placeholder sections + wip categories

**Files:**
- Modify: `src/components/MainNav.tsx`

Replace the ENTIRE contents of `src/components/MainNav.tsx` with:

```tsx
import Link from "next/link";
import { SECTIONS, isWipSection } from "@/lib/taxonomy";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchBox } from "@/components/SearchBox";
import { CategoryIcon } from "@/components/CategoryIcon";
import { WipBadge } from "@/components/WipBadge";

// Explicit full-contrast text (not DaisyUI's dimmed .menu links) so the nav
// meets WCAG AA contrast in both the dark and light themes.
const linkCls = "nav-link text-base-content px-2 py-1 rounded";
const dropdownItemCls = "flex items-center gap-2 px-2 py-1 rounded text-base-content hover:bg-base-300";
const disabledCls = "text-base-content/40 cursor-not-allowed";

export function MainNav() {
  return (
    <nav aria-label="Primary" className="navbar max-w-6xl mx-auto px-4">
      <div className="flex-1 flex flex-wrap items-center gap-2">
        <Link href="/" className="font-display text-xl font-bold text-primary tracking-wide">
          SAND
        </Link>
        <ul className="flex flex-wrap items-center gap-1">
          {SECTIONS.map((section) => {
            if (section.kind === "data" && section.categories.length > 0) {
              return (
                <li key={section.slug} className="relative group">
                  <button type="button" className={`${linkCls} cursor-pointer`} aria-haspopup="true">
                    {section.label} ▾
                  </button>
                  <ul
                    className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute left-0 top-full z-20 pt-2 w-48 space-y-1"
                  >
                    <li className="rounded-box border border-base-300 bg-base-200 p-2 shadow space-y-1 list-none">
                      <ul className="space-y-1">
                        {section.categories.map((c) => (
                          <li key={c.slug}>
                            {c.wip ? (
                              <span className={`${dropdownItemCls} ${disabledCls}`} aria-disabled="true">
                                <CategoryIcon slug={c.slug} className="size-4 shrink-0" />
                                {c.label}
                                <span className="ml-auto"><WipBadge /></span>
                              </span>
                            ) : (
                              <Link href={`/${section.slug}?category=${c.slug}`} className={dropdownItemCls}>
                                <CategoryIcon slug={c.slug} className="size-4 shrink-0" />
                                {c.label}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  </ul>
                </li>
              );
            }
            if (isWipSection(section)) {
              return (
                <li key={section.slug}>
                  <span className={`${linkCls} ${disabledCls} inline-flex items-center gap-1`} aria-disabled="true">
                    {section.label} <WipBadge />
                  </span>
                </li>
              );
            }
            const href = section.href ?? `/${section.slug}`;
            return (
              <li key={section.slug}>
                <Link href={href} className={linkCls}>{section.label}</Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex-none flex items-center gap-2">
        <SearchBox variant="navbar" />
        <Link href="/about" className={linkCls}>About</Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/components/MainNav.tsx && git commit -F - <<'EOF'
feat(wiki): disable WIP nav entries (Tech, Tools, NPCs)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Home cards — disable placeholder sections

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add the import**

In `src/app/page.tsx`, change:

```tsx
import { SECTIONS, ITEM_CATEGORIES } from "@/lib/taxonomy";
```

to:

```tsx
import { SECTIONS, ITEM_CATEGORIES, isWipSection } from "@/lib/taxonomy";
import { WipBadge } from "@/components/WipBadge";
```

- [ ] **Step 2: Branch the section card on WIP**

Replace this block:

```tsx
          {SECTIONS.map((section) => (
            <Link
              key={section.slug}
              href={section.href ?? `/${section.slug}`}
              className="card bg-base-200"
            >
              <div className="card-body">
                <h3 className="card-title font-display">{section.label}</h3>
                <p className="text-sm text-base-content/70">
                  {section.categories.length > 0
                    ? section.categories.map((c) => c.label).join(", ")
                    : "Explore"}
                </p>
              </div>
            </Link>
          ))}
```

with:

```tsx
          {SECTIONS.map((section) =>
            isWipSection(section) ? (
              <div
                key={section.slug}
                className="card bg-base-200 opacity-60 cursor-not-allowed"
                aria-disabled="true"
              >
                <div className="card-body">
                  <h3 className="card-title font-display">{section.label} <WipBadge /></h3>
                  <p className="text-sm text-base-content/70">Coming soon</p>
                </div>
              </div>
            ) : (
              <Link key={section.slug} href={section.href ?? `/${section.slug}`} className="card bg-base-200">
                <div className="card-body">
                  <h3 className="card-title font-display">{section.label}</h3>
                  <p className="text-sm text-base-content/70">
                    {section.categories.length > 0
                      ? section.categories.map((c) => c.label).join(", ")
                      : "Explore"}
                  </p>
                </div>
              </Link>
            )
          )}
```

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/app/page.tsx && git commit -F - <<'EOF'
feat(wiki): disable WIP section cards on the home page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Environment landing — disable wip category cards

**Files:**
- Modify: `src/app/environment/page.tsx`

- [ ] **Step 1: Add the import**

In `src/app/environment/page.tsx`, add the WipBadge import near the other component imports:

```tsx
import { WipBadge } from "@/components/WipBadge";
```

- [ ] **Step 2: Branch the category card on `c.wip`**

Replace this block (inside the `section?.categories.map`):

```tsx
            return (
              <li key={c.slug} className="list-none">
                <Link
                  href={`/environment?category=${c.slug}`}
                  className="card bg-base-200 p-4 flex flex-row items-center gap-3"
                >
                  <CategoryIcon slug={c.slug} className="size-5 shrink-0" />
                  <span className="font-medium flex-1">{c.label}</span>
                  <span className="badge badge-ghost badge-sm">{n > 0 ? n : "coming soon"}</span>
                </Link>
              </li>
            );
```

with:

```tsx
            return (
              <li key={c.slug} className="list-none">
                {c.wip ? (
                  <div
                    className="card bg-base-200 p-4 flex flex-row items-center gap-3 opacity-60 cursor-not-allowed"
                    aria-disabled="true"
                  >
                    <CategoryIcon slug={c.slug} className="size-5 shrink-0" />
                    <span className="font-medium flex-1">{c.label}</span>
                    <WipBadge />
                  </div>
                ) : (
                  <Link
                    href={`/environment?category=${c.slug}`}
                    className="card bg-base-200 p-4 flex flex-row items-center gap-3"
                  >
                    <CategoryIcon slug={c.slug} className="size-5 shrink-0" />
                    <span className="font-medium flex-1">{c.label}</span>
                    <span className="badge badge-ghost badge-sm">{n > 0 ? n : "coming soon"}</span>
                  </Link>
                )}
              </li>
            );
```

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add src/app/environment/page.tsx && git commit -F - <<'EOF'
feat(wiki): disable the empty NPCs card on the environment landing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: E2E — WIP nav entries are disabled

**Files:**
- Modify: `tests/e2e/wiki.spec.ts`

- [ ] **Step 1: Append the test**

Append to `tests/e2e/wiki.spec.ts` (after the existing tests):

```ts
test("WIP destinations are disabled (not links) in the nav", async ({ page }) => {
  await page.goto("/items");
  const nav = page.getByRole("navigation", { name: "Primary" });

  // Placeholder sections are shown but not clickable.
  await expect(nav.getByRole("link", { name: "Tech Tree" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Tools", exact: true })).toHaveCount(0);
  await expect(nav.getByText("Tech Tree")).toBeVisible();

  // The Environment dropdown: NPCs is disabled, a populated category is a live link.
  await nav.getByRole("button", { name: /Environment/ }).hover();
  await expect(nav.getByRole("link", { name: "Loot Containers" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "NPCs" })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it**

Run: `cd /d/Documents/SandLabs/sand-wiki && npx playwright test -g "WIP destinations are disabled"`
Expected: PASS. (Playwright config runs `next build && next start` against the dev DB; if the build cannot reach the DB, run `npm run build` to confirm compilation and report the live run is DB-gated.)

- [ ] **Step 3: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add tests/e2e/wiki.spec.ts && git commit -F - <<'EOF'
test(wiki): e2e asserting WIP nav entries are disabled

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: Full verification + mark TODO done

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Unit + lint**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm run test && npm run lint`
Expected: unit suite PASS (106 prior + new taxonomy tests), lint clean.

- [ ] **Step 2: Full e2e (both-theme axe gate + new test)**

Run: `cd /d/Documents/SandLabs/sand-wiki && npm run test:e2e`
Expected: all PASS, including axe in both themes (disabled entries are `aria-disabled` spans, not empty links). DB-gated — report if unreachable.

- [ ] **Step 3: Mark the TODO done**

In `TODO.md`, change the line:

```
- Disable buttons to currently WIP pages
```

to:

```
- [x] Disable buttons to currently WIP pages (Tech, Tools, NPCs shown dimmed + "soon", non-interactive)
```

- [ ] **Step 4: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki && git add TODO.md && git commit -F - <<'EOF'
docs(wiki): mark "disable WIP buttons" TODO done

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Self-review notes

- **Spec coverage:** taxonomy markers `isWipSection` + `Category.wip` on NPCs (Task 1); shared `WipBadge` (Task 2); all four link sites disabled — MainNav top (Task 3), MainNav dropdown (Task 3), home cards (Task 4), env landing cards (Task 5); unit tests (Task 1) + e2e (Task 6) + axe gate (Task 7). Placeholder pages untouched/reachable by URL.
- **Type/name consistency:** `isWipSection` and `Category.wip` defined in Task 1 and consumed in Tasks 3–5; `WipBadge` created in Task 2 and imported in Tasks 3–5; `disabledCls` is local to MainNav.
- **Behavior preserved:** live sections/categories still render as links exactly as before; the env landing keeps its count badge for non-wip categories; the home hero category tags are untouched.
- **No placeholders:** every step shows exact before/after text or full file content.
