# Tech Tree Cost-Icon Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each cost/material icon in the `/tech` path planner and the node hover tooltip a link to that entity's detail page, opening in a new tab.

**Architecture:** Derive an `href` on each `TechCost` at transform time (via the existing `entityHref` helper), carry it through `pathCost`'s material aggregation, and wrap the icon in an anchor at the two render sites through a small shared `CostIcon` helper.

**Tech Stack:** Next.js (App Router) client component, TypeScript, Vitest, plain CSS.

All paths are relative to the `sand-wiki/` app directory. Run commands from `sand-wiki/`.

---

## File Structure

- `src/lib/tech-tree/types.ts` — add `href` to `TechCost`.
- `src/lib/tech-tree/transform.ts` — derive `href` per cost via `entityHref`.
- `src/lib/tech-tree/transform.test.ts` — assert cost `href` derivation.
- `src/lib/tech-tree/layout.ts` — add `href` to `PathCost.materials`; carry it in `pathCost`.
- `src/lib/tech-tree/layout.test.ts` — fixtures carry `href`; assert it survives aggregation.
- `src/components/tech-tree/TechTreeView.tsx` — `CostIcon` helper + two call sites.
- `src/components/tech-tree/tech-tree.css` — `.tt-cost-link` affordance.

---

## Task 1: Thread `href` through the cost data + tests

**Files:**
- Modify: `src/lib/tech-tree/types.ts:10-14`
- Modify: `src/lib/tech-tree/transform.ts:44`
- Modify: `src/lib/tech-tree/layout.ts:119` and `:133-145`
- Test: `src/lib/tech-tree/transform.test.ts`, `src/lib/tech-tree/layout.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `src/lib/tech-tree/transform.test.ts`, the first test's Weird Coral cost target currently has no `kind`. Add `kind: "item"` to it. Find:

```ts
          { role: "tech-unlock-cost", name: "Weird Coral", amount: 15, sortOrder: 1,
            target: { slug: "weird-coral", name: "Weird Coral", icon: "/icons/coral.png", techNodeStats: null } },
```

Replace with:

```ts
          { role: "tech-unlock-cost", name: "Weird Coral", amount: 15, sortOrder: 1,
            target: { slug: "weird-coral", name: "Weird Coral", icon: "/icons/coral.png", kind: "item", techNodeStats: null } },
```

Then update the `costs` assertion in that test (the Crowns target has no `kind` → `href: null`; Weird Coral is an item → `/items/weird-coral`). Find:

```ts
    expect(n.costs).toEqual([
      { name: "Crowns", amount: 1500, icon: "/icons/coin.png" },
      { name: "Weird Coral", amount: 15, icon: "/icons/coral.png" },
    ]);
```

Replace with:

```ts
    expect(n.costs).toEqual([
      { name: "Crowns", amount: 1500, icon: "/icons/coin.png", href: null },
      { name: "Weird Coral", amount: 15, icon: "/icons/coral.png", href: "/items/weird-coral" },
    ]);
```

In `src/lib/tech-tree/layout.test.ts`, add `href` to the cost fixtures (TechCost now requires it). Find:

```ts
    node({ slug: "g1a-small", faction: "godlewski", tier: 1, letter: "a", crowns: 100, costs: [{ name: "Crowns", amount: 100, icon: null }] }),
    node({ slug: "g1a-energy", faction: "godlewski", tier: 1, letter: "a", crowns: 150, costs: [{ name: "Crowns", amount: 150, icon: null }, { name: "Coral", amount: 5, icon: "/c.png" }] }),
    node({ slug: "g2a-mid", faction: "godlewski", tier: 2, letter: "a", crowns: 500, costs: [{ name: "Crowns", amount: 500, icon: null }, { name: "Coral", amount: 10, icon: "/c.png" }], prereqs: ["g1a-small"] }),
```

Replace with (Crowns `href: null`, Coral `href: "/items/coral"`):

```ts
    node({ slug: "g1a-small", faction: "godlewski", tier: 1, letter: "a", crowns: 100, costs: [{ name: "Crowns", amount: 100, icon: null, href: null }] }),
    node({ slug: "g1a-energy", faction: "godlewski", tier: 1, letter: "a", crowns: 150, costs: [{ name: "Crowns", amount: 150, icon: null, href: null }, { name: "Coral", amount: 5, icon: "/c.png", href: "/items/coral" }] }),
    node({ slug: "g2a-mid", faction: "godlewski", tier: 2, letter: "a", crowns: 500, costs: [{ name: "Crowns", amount: 500, icon: null, href: null }, { name: "Coral", amount: 10, icon: "/c.png", href: "/items/coral" }], prereqs: ["g1a-small"] }),
```

Then update the `pathCost` materials assertion to include `href`. Find:

```ts
    expect(r.materials).toEqual([{ name: "Coral", amount: 10, icon: "/c.png" }]);
```

Replace with:

```ts
    expect(r.materials).toEqual([{ name: "Coral", amount: 10, icon: "/c.png", href: "/items/coral" }]);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tech-tree`
Expected: FAIL — TypeScript errors (`href` not on `TechCost`) and assertion mismatches.

- [ ] **Step 3: Add `href` to the `TechCost` type**

In `src/lib/tech-tree/types.ts`, find:

```ts
export interface TechCost {
  name: string;
  amount: number;
  icon: string | null;
}
```

Replace with:

```ts
export interface TechCost {
  name: string;
  amount: number;
  icon: string | null;
  href: string | null; // detail-page link for the cost entity, or null if it has no page
}
```

- [ ] **Step 4: Derive `href` in the transform**

In `src/lib/tech-tree/transform.ts`, `entityHref` is already imported. Find:

```ts
      const costs = costLinks.map((l) => ({ name: l.name, amount: l.amount ?? 0, icon: l.target?.icon ?? null }));
```

Replace with:

```ts
      const costs = costLinks.map((l) => ({
        name: l.name,
        amount: l.amount ?? 0,
        icon: l.target?.icon ?? null,
        href: l.target ? entityHref(l.target.kind ?? null, l.target.slug) : null,
      }));
```

- [ ] **Step 5: Carry `href` through `pathCost`**

In `src/lib/tech-tree/layout.ts`, update the `PathCost.materials` element type. Find:

```ts
  materials: { name: string; amount: number; icon: string | null }[]; // aggregated, un-unlocked only, excludes Crowns
```

Replace with:

```ts
  materials: { name: string; amount: number; icon: string | null; href: string | null }[]; // aggregated, un-unlocked only, excludes Crowns
```

Then update the aggregation map. Find:

```ts
  const mat = new Map<string, { name: string; amount: number; icon: string | null }>();
```

Replace with:

```ts
  const mat = new Map<string, { name: string; amount: number; icon: string | null; href: string | null }>();
```

And find:

```ts
      const e = mat.get(c.name) ?? { name: c.name, amount: 0, icon: c.icon };
```

Replace with:

```ts
      const e = mat.get(c.name) ?? { name: c.name, amount: 0, icon: c.icon, href: c.href };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- tech-tree`
Expected: PASS (transform + layout suites green).

- [ ] **Step 7: Commit**

```bash
git add src/lib/tech-tree/types.ts src/lib/tech-tree/transform.ts src/lib/tech-tree/layout.ts src/lib/tech-tree/transform.test.ts src/lib/tech-tree/layout.test.ts
git commit -m "feat(tech-tree): derive href on costs and carry through pathCost"
```

---

## Task 2: Render the cost icons as new-tab links

**Files:**
- Modify: `src/components/tech-tree/TechTreeView.tsx:19-22` (add `CostIcon`), `:335`, `:406`
- Modify: `src/components/tech-tree/tech-tree.css`

- [ ] **Step 1: Add the `CostIcon` helper**

In `src/components/tech-tree/TechTreeView.tsx`, find the `Glyph` component:

```tsx
function Glyph({ icon, alt }: { icon: string | null; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return icon ? <img src={icon} alt="" aria-hidden loading="lazy" decoding="async" /> : <span aria-label={alt}>▦</span>;
}
```

Add directly below it:

```tsx
function CostIcon({ icon, href, alt }: { icon: string | null; href: string | null; alt: string }) {
  const g = <Glyph icon={icon} alt={alt} />;
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="tt-cost-link" title={alt}>{g}</a>
    : g;
}
```

- [ ] **Step 2: Use it in the planner "Materials needed" grid**

In `src/components/tech-tree/TechTreeView.tsx`, find (line ~335):

```tsx
                      <span key={m.name} className="tt-mat"><span className="tt-mat-ic"><Glyph icon={m.icon} alt={m.name} /></span><b>{fmt(m.amount)}</b><span className="tt-mat-name">{m.name}</span></span>
```

Replace the inner icon span so it reads:

```tsx
                      <span key={m.name} className="tt-mat"><span className="tt-mat-ic"><CostIcon icon={m.icon} href={m.href} alt={m.name} /></span><b>{fmt(m.amount)}</b><span className="tt-mat-name">{m.name}</span></span>
```

- [ ] **Step 3: Use it in the hover tooltip cost rows**

In `src/components/tech-tree/TechTreeView.tsx`, find (line ~406):

```tsx
            <span className="tt-tip-ic"><Glyph icon={c.icon} alt={c.name} /></span>
```

Replace with:

```tsx
            <span className="tt-tip-ic"><CostIcon icon={c.icon} href={c.href} alt={c.name} /></span>
```

- [ ] **Step 4: Add the link affordance CSS**

In `src/components/tech-tree/tech-tree.css`, append at the end of the file:

```css
.tt-cost-link { display: grid; place-items: center; width: 100%; height: 100%; cursor: pointer; }
.tt-cost-link img { width: 100%; height: 100%; object-fit: contain; }
.tt-cost-link:hover { opacity: .8; }
```

- [ ] **Step 5: Verify lint and build**

Run: `npm run lint`
Expected: no new errors (pre-existing Directus-extension warnings OK).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual check**

Run `npm run dev`, open `/tech`. Select a tech with material costs and hover a node. Expected: in the planner "Materials needed" grid and in the hover tooltip, clicking a material icon opens that item's page in a new tab; materials with no detail page (e.g. Crowns/raw resources) show a non-clickable icon as before.

- [ ] **Step 7: Commit**

```bash
git add src/components/tech-tree/TechTreeView.tsx src/components/tech-tree/tech-tree.css
git commit -m "feat(tech-tree): link cost icons to item pages in new tab"
```

---

## Self-Review notes

- **Spec coverage:** `href` on `TechCost` (Task 1 Step 3) ✓; derived via `entityHref` (Step 4) ✓; carried through `pathCost` aggregation (Step 5) ✓; planner grid link (Task 2 Step 2) ✓; hover tooltip link (Step 3) ✓; new tab via `target="_blank" rel="noopener noreferrer"` (Step 1) ✓; icon-only link (helper wraps only the Glyph) ✓; null-href fallback to plain icon (helper returns bare Glyph) ✓; affordance CSS scoped to fixed panels (Step 4) ✓; tests for transform + pathCost (Step 1) ✓.
- **Type consistency:** `CostIcon` props `{ icon, href, alt }` match the call sites; `m.href` (PathCost.materials) and `c.href` (TechCost) both exist after Task 1; the `mat` map element type matches the `PathCost.materials` element type.
- **Out of scope (per spec):** node-card coin icon, build-order step list, clickable name/amount text — none touched.
