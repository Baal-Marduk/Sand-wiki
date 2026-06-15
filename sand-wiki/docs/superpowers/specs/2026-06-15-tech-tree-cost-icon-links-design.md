# Tech tree: clickable cost icons → item pages — design

**Date:** 2026-06-15
**Status:** Approved.

## Goal

In the `/tech` page, make each **cost/material icon link to that entity's detail
page, opening in a new tab**. This applies in two places that show cost icons:

1. The path planner's **"Materials needed"** grid (`.tt-mat`).
2. The per-node **hover tooltip** cost rows (`.tt-tip-costrow`).

Only the icon is the link (matching the request "on icons"); the name/amount
text is unchanged.

## Context

- Page: [TechTreeView.tsx](../../../src/components/tech-tree/TechTreeView.tsx),
  data via [queries.ts](../../../src/lib/queries.ts) `getTechTree` →
  [transform.ts](../../../src/lib/tech-tree/transform.ts) → `TechNode`/`TechCost`
  in [types.ts](../../../src/lib/tech-tree/types.ts); path cost aggregated by
  `pathCost` in [layout.ts](../../../src/lib/tech-tree/layout.ts).
- The query **already** selects `slug` + `kind` on cost-link targets, so the data
  needed to build hrefs is present end-to-end.
- `entityHref(kind, slug)` ([entity-links.ts](../../../src/lib/entity-links.ts))
  maps `item → /items/<slug>`, `environment → /environment/<slug>`,
  `trampler-part → /tramplers/<slug>`, and returns `null` for any other kind.
  Unlocks already use this exact helper.
- Today `TechCost` is `{ name, amount, icon }` and `PathCost.materials` is
  `{ name, amount, icon }[]` — neither carries a link, which is why this change
  is needed.

## Data plumbing — thread an `href` through

1. **`types.ts`** — add `href: string | null` to the `TechCost` interface.
2. **`transform.ts`** — when mapping `costLinks` to `costs`, derive
   `href: l.target ? entityHref(l.target.kind ?? null, l.target.slug) : null`
   (same pattern as the existing `unlocks` mapping). Resources/currencies with no
   detail page resolve to `null`.
3. **`layout.ts`** — add `href: string | null` to the `PathCost.materials` element
   type. In `pathCost`, the materials are aggregated by `c.name`; carry the href
   on first insert (`icon: c.icon, href: c.href`). Because a material name maps to
   a single target entity, the first non-null href is correct for the group.

## Render — two spots in `TechTreeView.tsx`

A small local helper keeps the two call sites DRY:

```tsx
function CostIcon({ icon, href, alt }: { icon: string | null; href: string | null; alt: string }) {
  const g = <Glyph icon={icon} alt={alt} />;
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="tt-cost-link">{g}</a>
    : g;
}
```

- **Planner "Materials needed":** the existing `<span className="tt-mat-ic"><Glyph …/></span>`
  becomes `<span className="tt-mat-ic"><CostIcon icon={m.icon} href={m.href} alt={m.name} /></span>`.
- **Hover tooltip cost rows:** the existing `<span className="tt-tip-ic"><Glyph …/></span>`
  becomes `<span className="tt-tip-ic"><CostIcon icon={c.icon} href={c.href} alt={c.name} /></span>`.

`Glyph` already renders an `<img>` (or a `▦` placeholder); wrapping it in the
anchor preserves current sizing because `.tt-mat-ic`/`.tt-tip-ic` size the inner
content.

## CSS — affordance

The summary panel (`.tt-summary`) and tooltip (`#tt-tip`) are `position: fixed`,
outside `.tt-viewport`, so they don't inherit the viewport's link cursor. Add a
scoped rule:

```css
.tt-cost-link { display: grid; place-items: center; width: 100%; height: 100%; cursor: pointer; }
.tt-cost-link img { width: 100%; height: 100%; object-fit: contain; }
.tt-cost-link:hover { opacity: .8; }
```

This keeps the icon filling its `.tt-mat-ic`/`.tt-tip-ic` box (both already
`display: grid; place-items: center`) and signals clickability.

## Testing

- `transform.test.ts`: the existing "maps crowns, costs (with icons)…" test's cost
  fixtures currently have **no `kind`** on their targets, so they'd resolve to
  `href: null`. Add `kind: "item"` to one cost-link target (e.g. Weird Coral) and
  assert its mapped cost gets `href: "/items/weird-coral"`, while a cost whose
  target has no `kind` asserts `href: null`. (Update the existing `toEqual` on
  `costs` to include the new `href` field on every entry.)
- `layout.test.ts`: in a `pathCost` test, give a node a non-Crowns cost with an
  `href` and assert the returned `materials[0].href` matches.

## Out of scope

- The node-card coin icon (Crowns, and not in the planner/tooltip this targets).
- The build-order step list (no item icons there — just a faction-color dot).
- Making the material name/amount text clickable (only the icon, per request).
