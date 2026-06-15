# Tech tree: zoom controls + real coin icon — design

**Date:** 2026-06-15
**Status:** Approved — preparation only (design + implementation plan). No code written yet.

## Goal

Two contained improvements to the interactive `/tech` page so the tall tree no
longer forces vertical page scrolling, and node costs read clearly:

1. **Zoom** the tech-tree canvas in/out (mouse wheel + on-screen buttons) so the
   whole tree can be fit to the viewport instead of scrolled up/down.
2. Replace the fake CSS diamond on each node's cost (`.tnode-scrap`, a
   `var(--accent)` square) with the node's **real Crowns coin icon**.

## Context

- Page: [page.tsx](../../../src/app/tech/page.tsx) → [TechTreeView.tsx](../../../src/components/tech-tree/TechTreeView.tsx) + [tech-tree.css](../../../src/components/tech-tree/tech-tree.css).
- The tree renders a fixed-size absolutely-positioned canvas (`#tt-canvas`,
  `layout.canvasW × layout.canvasH`) inside a native-scroll viewport
  (`.tt-viewport`, `overflow:auto`). Pan is via pointer-drag (`onPanDown/Move`,
  scrolling `scrollLeft/scrollTop`); plain wheel currently scrolls.
- A sticky `#tt-tierbar` sits above the canvas as a sibling (not a child), with
  tier labels positioned in canvas X-coordinates derived from `LAYOUT`.
- Edges are an absolutely-positioned `<svg>` overlay inside `#tt-canvas`.
- Cost data already exists per node: `n.crowns` (number) and
  `n.costs` (`TechCost[]`, includes the `Crowns` entry with its `icon`). The
  card today renders `<span className="tnode-scrap" />` + `n.crowns`.

## Feature 1 — Real coin icon

**Data:** add `crownsIcon: string | null` to `TechNode` ([types.ts](../../../src/lib/tech-tree/types.ts)),
computed in [transform.ts](../../../src/lib/tech-tree/transform.ts) as
`costs.find((c) => c.name === CROWNS_NAME)?.icon ?? null`. Deriving it once at
transform time (rather than re-scanning `costs` on every card render) keeps the
client component lean and the value consistent with the tooltip/planner.

**Render:** in the card's `.tnode-cost`, replace `<span className="tnode-scrap" />`
with `<span className="tnode-coin"><Glyph icon={n.crownsIcon} alt="Crowns" /></span>`.
`Glyph` already falls back to a `▦` placeholder when `icon` is null; to preserve
the existing visual when no icon is present we keep `.tnode-scrap` as a CSS
fallback rendered only when `crownsIcon` is null. So: render the icon when
present, otherwise the diamond. Nothing ever renders blank.

**CSS:** `.tnode-coin` sized ~14px square (slightly larger than the 11px diamond
so the icon is legible), `display:grid; place-items:center; flex:none;`, with
`img { width:100%; height:100%; object-fit:contain; }`. `.tnode-scrap` is kept
unchanged for the fallback path.

## Feature 2 — Zoom

**Approach (chosen):** CSS `transform: scale()` on the canvas, keeping the
existing native-scroll viewport for panning. No layout recompute, no SVG
re-render — `#tt-canvas` (cards + SVG) scales as one composited layer. Rejected
alternatives: recomputing `LAYOUT` per zoom (expensive, re-renders the whole SVG
every notch); a full custom transform-based pan/zoom surface (throws away the
working native-scroll panning).

**State:** `zoom` number, default `1`, clamped **0.4–1.5**, step factor ~`1.1×`
per wheel notch / button press.

**Scroll geometry:** wrap `#tt-canvas` in a sizer element whose
`width/height = canvasW*zoom / canvasH*zoom`, so the viewport's scrollbars track
the scaled content. `#tt-canvas` gets `transform: scale(zoom)` with
`transform-origin: 0 0`.

**Wheel zoom (plain wheel, no modifier):** attach a **non-passive** `wheel`
listener via `useEffect`/ref + `addEventListener` (React's synthetic `onWheel` is
passive and cannot `preventDefault`). Handler: `preventDefault()`, derive the new
clamped zoom from `deltaY`, then re-anchor `scrollLeft/scrollTop` so the canvas
point under the cursor stays fixed (zoom-to-cursor):
`newScroll = (cursorOffset + oldScroll) * (newZoom/oldZoom) - cursorOffset`.

**Buttons:** add **+**, **−**, and **Fit/Reset** to the existing `.tt-toolbar`,
reusing `actionButtonClass`. +/− step the zoom about the viewport center; Fit
sets `zoom = min(viewportW/canvasW, viewportH/canvasH)` clamped to the range and
re-centers scroll to the canvas.

**Tierbar:** because it is a sticky sibling (not inside `#tt-canvas`), it does not
inherit the transform. Multiply each tier label's `left` and `width` by `zoom` in
the JSX (font-size stays constant — no text stretching) and set `#tt-tierbar`
width to `canvasW*zoom`.

**Coordinate math touched by zoom:**
- The `?select=` auto-scroll-into-view effect computes target scroll from
  `pos.x/pos.y` (canvas coords) — multiply those by `zoom`.
- Pointer-drag pan uses raw `scrollLeft/scrollTop` deltas and needs no scaling
  (it pans in viewport pixels), but the click-vs-drag threshold is unaffected.

## Affected files

- `src/lib/tech-tree/types.ts` — add `crownsIcon` to `TechNode`.
- `src/lib/tech-tree/transform.ts` — populate `crownsIcon`.
- `src/lib/tech-tree/transform.test.ts` — assert `crownsIcon`.
- `src/components/tech-tree/TechTreeView.tsx` — zoom state, non-passive wheel
  handler, +/−/Fit buttons, sizer wrapper + canvas transform, tierbar scaling,
  `select` scroll math, coin span.
- `src/components/tech-tree/tech-tree.css` — `.tnode-coin`, sizer/zoom styles.

## Testing

- Unit: `transform.test.ts` gains a `crownsIcon` assertion (real icon when the
  Crowns cost has one, `null` otherwise).
- Manual: wheel zoom in/out stays anchored under the cursor; +/−/Fit behave;
  tier labels stay aligned to columns at every zoom; coin icon renders on cards
  with a Crowns cost and falls back to the diamond when absent; panning and
  `?select=` deep-links still work after zooming.

## Out of scope (not now)

- Writing the implementation code (this document is the preparation step; an
  implementation plan follows).
- Pinch-to-zoom / touch gestures.
- Persisting zoom level across reloads.
- Any Steam progress-sync work.
