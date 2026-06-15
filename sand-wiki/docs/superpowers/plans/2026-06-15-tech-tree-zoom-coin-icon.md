# Tech Tree Zoom + Coin Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add wheel + button zoom to the `/tech` tree so it can be fit to the viewport instead of scrolled, and replace the fake CSS diamond on each node's cost with the node's real Crowns coin icon.

**Architecture:** Derive a `crownsIcon` field at transform time and render it on the card with the existing `Glyph` (diamond as fallback). Zoom is CSS `transform: scale()` on `#tt-canvas` inside the existing native-scroll viewport; a sizer wrapper keeps scrollbars correct, a non-passive wheel listener does zoom-to-cursor, and the sticky tier bar is scaled by multiplying its label coordinates by `zoom`.

**Tech Stack:** Next.js (App Router) client component, TypeScript, React hooks, Vitest, plain CSS.

All paths are relative to the `sand-wiki/` app directory. Run commands from `sand-wiki/`.

---

## File Structure

- `src/lib/tech-tree/types.ts` — add `crownsIcon: string | null` to `TechNode`.
- `src/lib/tech-tree/transform.ts` — populate `crownsIcon` from the `Crowns` cost.
- `src/lib/tech-tree/transform.test.ts` — assert `crownsIcon` is derived.
- `src/components/tech-tree/TechTreeView.tsx` — zoom state/handlers, +/−/Fit buttons, sizer wrapper + canvas transform, tier-bar scaling, `select` scroll math, coin span on the card.
- `src/components/tech-tree/tech-tree.css` — `.tnode-coin`, zoom-controls and sizer styles.

---

## Task 1: Derive `crownsIcon` on each tech node

**Files:**
- Modify: `src/lib/tech-tree/types.ts:23-34`
- Modify: `src/lib/tech-tree/transform.ts:44-65`
- Test: `src/lib/tech-tree/transform.test.ts`

- [ ] **Step 1: Add the failing assertion**

In `src/lib/tech-tree/transform.test.ts`, inside the existing `it("maps crowns, costs (with icons), unlocks, glyph and prereqs", ...)` test, add after the `n.crowns` assertion (currently line 42):

```ts
    expect(n.crownsIcon).toBe("/icons/coin.png");
```

Also add a second assertion to the `it("keeps same-faction prereqs and drops cross-faction ones", ...)` test (the `great` node has no Crowns cost), after the existing `great.prereqs` assertion:

```ts
    expect(great.crownsIcon).toBeNull();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- transform`
Expected: FAIL — TypeScript error / assertion failure because `crownsIcon` does not exist on `TechNode`.

- [ ] **Step 3: Add the field to the type**

In `src/lib/tech-tree/types.ts`, add the field to the `TechNode` interface immediately after the `crowns` line:

```ts
  crowns: number; // Crowns cost shown on the card (0 if none)
  crownsIcon: string | null; // icon for the Crowns cost (real coin icon shown on the card)
  costs: TechCost[]; // all resources (tooltip + planner); Crowns first
```

- [ ] **Step 4: Populate it in the transform**

In `src/lib/tech-tree/transform.ts`, find:

```ts
      const crowns = costs.find((c) => c.name === CROWNS_NAME)?.amount ?? 0;
```

Replace it with (compute the Crowns cost once, reuse for amount + icon):

```ts
      const crownsCost = costs.find((c) => c.name === CROWNS_NAME);
      const crowns = crownsCost?.amount ?? 0;
      const crownsIcon = crownsCost?.icon ?? null;
```

Then add `crownsIcon,` to the returned node object, right after the `crowns,` line:

```ts
        crowns,
        crownsIcon,
        costs,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- transform`
Expected: PASS (all `transform` tests green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tech-tree/types.ts src/lib/tech-tree/transform.ts src/lib/tech-tree/transform.test.ts
git commit -m "feat(tech-tree): derive crownsIcon for each node"
```

---

## Task 2: Render the real coin icon on the node card

**Files:**
- Modify: `src/components/tech-tree/TechTreeView.tsx:226-229`
- Modify: `src/components/tech-tree/tech-tree.css:60-62`

- [ ] **Step 1: Swap the diamond for the coin icon**

In `src/components/tech-tree/TechTreeView.tsx`, find the card cost markup:

```tsx
                  <div className="tnode-cost"><span className="tnode-scrap" /><span className="tnode-num">{fmt(n.crowns)}</span></div>
```

Replace it with (use the real icon when present, fall back to the diamond when null):

```tsx
                  <div className="tnode-cost">
                    {n.crownsIcon
                      ? <span className="tnode-coin"><Glyph icon={n.crownsIcon} alt="Crowns" /></span>
                      : <span className="tnode-scrap" />}
                    <span className="tnode-num">{fmt(n.crowns)}</span>
                  </div>
```

- [ ] **Step 2: Add the coin style**

In `src/components/tech-tree/tech-tree.css`, find:

```css
  .tnode-scrap { width: 11px; height: 11px; flex: none; background: var(--accent); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
```

Add directly below it:

```css
  .tnode-coin { width: 14px; height: 14px; flex: none; display: grid; place-items: center; }
  .tnode-coin img { width: 100%; height: 100%; object-fit: contain; display: block; }
```

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual check**

Run `npm run dev`, open `/tech`. Expected: node cards show the round coin icon next to the Crowns amount instead of the yellow diamond; any node without a Crowns cost still shows the diamond.

- [ ] **Step 5: Commit**

```bash
git add src/components/tech-tree/TechTreeView.tsx src/components/tech-tree/tech-tree.css
git commit -m "feat(tech-tree): show real coin icon on node cost"
```

---

## Task 3: Add zoom state, +/−/Fit buttons, sizer wrapper, and canvas transform

This task makes zoom controllable via buttons and applies the transform. Wheel-to-zoom is added in Task 4.

**Files:**
- Modify: `src/components/tech-tree/TechTreeView.tsx` (state near line 25-29; toolbar near line 134-138; viewport/canvas near line 148-165)
- Modify: `src/components/tech-tree/tech-tree.css` (viewport/canvas section ~line 22-28)

- [ ] **Step 1: Add zoom state and constants**

In `src/components/tech-tree/TechTreeView.tsx`, near the top of the file after `const fmt = ...` (line 12), add zoom constants:

```ts
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 1.1; // multiplicative per wheel notch / button press
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
```

Inside `TechTreeView`, add zoom state alongside the other `useState` hooks (after line 29 `const [resetOpen, setResetOpen] = useState(false);`):

```ts
  const [zoom, setZoom] = useState(1);
```

- [ ] **Step 2: Add a center-anchored zoom helper and a fit helper**

In `src/components/tech-tree/TechTreeView.tsx`, add these callbacks after the `endPan` callback (after line 120). They re-anchor scroll so the viewport center stays fixed when zooming, and Fit scales the whole canvas to the viewport:

```ts
  const zoomTo = useCallback((next: number, anchorX?: number, anchorY?: number) => {
    const vp = viewportRef.current; if (!vp) return;
    setZoom((prev) => {
      const z = clampZoom(next);
      const ax = anchorX ?? vp.clientWidth / 2;
      const ay = anchorY ?? vp.clientHeight / 2;
      const ratio = z / prev;
      vp.scrollLeft = (vp.scrollLeft + ax) * ratio - ax;
      vp.scrollTop = (vp.scrollTop + ay) * ratio - ay;
      return z;
    });
  }, []);

  const zoomBy = useCallback((factor: number) => zoomTo(zoom * factor), [zoom, zoomTo]);

  const fitToScreen = useCallback(() => {
    const vp = viewportRef.current; if (!vp) return;
    const z = clampZoom(Math.min(vp.clientWidth / layout.canvasW, vp.clientHeight / layout.canvasH));
    setZoom(z);
    vp.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }, [layout.canvasW, layout.canvasH]);
```

- [ ] **Step 3: Add the toolbar buttons**

In `src/components/tech-tree/TechTreeView.tsx`, find the toolbar block:

```tsx
        <div className="tt-toolbar">
          <span className="tt-progress">{unlocked.size} / {tree.nodes.length} unlocked</span>
          <button type="button" className={actionButtonClass} onClick={() => setSelected(new Set())}>Clear selection</button>
          <button type="button" className={actionButtonClass} onClick={() => setResetOpen(true)}>Reset progress</button>
        </div>
```

Add the zoom controls just before the "Clear selection" button:

```tsx
        <div className="tt-toolbar">
          <span className="tt-progress">{unlocked.size} / {tree.nodes.length} unlocked</span>
          <div className="tt-zoom">
            <button type="button" className={actionButtonClass} onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">−</button>
            <span className="tt-zoom-val">{Math.round(zoom * 100)}%</span>
            <button type="button" className={actionButtonClass} onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">+</button>
            <button type="button" className={actionButtonClass} onClick={fitToScreen}>Fit</button>
          </div>
          <button type="button" className={actionButtonClass} onClick={() => setSelected(new Set())}>Clear selection</button>
          <button type="button" className={actionButtonClass} onClick={() => setResetOpen(true)}>Reset progress</button>
        </div>
```

- [ ] **Step 4: Scale the tier bar**

In `src/components/tech-tree/TechTreeView.tsx`, find the tier-bar block:

```tsx
        <div id="tt-tierbar" style={{ width: layout.canvasW }}>
          {layout.tiers.map((t) => {
            const first = t.cols[0], last = t.cols[t.cols.length - 1];
            const left = LAYOUT.PAD_LEFT + first * LAYOUT.COL_W - 24;
            const right = LAYOUT.PAD_LEFT + last * LAYOUT.COL_W + LAYOUT.CARD_W + 24;
            return (
              <div key={t.tier} className="tt-tier-label" style={{ left, width: right - left }}>
                <span className="tt-tier-roman">{t.roman}</span>{t.label}
              </div>
            );
          })}
        </div>
```

Replace it with the zoom-scaled version (multiply `width`, `left`, and the label width by `zoom`; font size is untouched so text does not stretch):

```tsx
        <div id="tt-tierbar" style={{ width: layout.canvasW * zoom }}>
          {layout.tiers.map((t) => {
            const first = t.cols[0], last = t.cols[t.cols.length - 1];
            const left = LAYOUT.PAD_LEFT + first * LAYOUT.COL_W - 24;
            const right = LAYOUT.PAD_LEFT + last * LAYOUT.COL_W + LAYOUT.CARD_W + 24;
            return (
              <div key={t.tier} className="tt-tier-label" style={{ left: left * zoom, width: (right - left) * zoom }}>
                <span className="tt-tier-roman">{t.roman}</span>{t.label}
              </div>
            );
          })}
        </div>
```

- [ ] **Step 5: Wrap the canvas in a sizer and apply the transform**

In `src/components/tech-tree/TechTreeView.tsx`, find the canvas opening tag:

```tsx
        <div id="tt-canvas" style={{ position: "relative", width: layout.canvasW, height: layout.canvasH }}>
```

Replace it with a sizer wrapper that owns the scaled dimensions, and a transformed canvas inside:

```tsx
        <div className="tt-sizer" style={{ width: layout.canvasW * zoom, height: layout.canvasH * zoom }}>
        <div id="tt-canvas" style={{ position: "relative", width: layout.canvasW, height: layout.canvasH, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
```

Then find the matching closing tags for the canvas (the `</div>` that closes `#tt-canvas`, currently line 234, immediately before `</div>` that closes the viewport on line 235). Add one extra closing `</div>` for the sizer. The end of the block should read:

```tsx
          })}
        </div>
        </div>
      </div>
```

(The first `</div>` closes `#tt-canvas`, the second closes `.tt-sizer`, the third closes `.tt-viewport`.)

- [ ] **Step 6: Update the `select` deep-link scroll math for zoom**

In `src/components/tech-tree/TechTreeView.tsx`, find the auto-scroll effect body:

```ts
    const vp = viewportRef.current, pos = posById[slug];
    if (vp && pos) {
      vp.scrollTo({
        left: Math.max(0, pos.x + LAYOUT.CARD_W / 2 - vp.clientWidth / 2),
        top: Math.max(0, pos.y + LAYOUT.CARD_H / 2 - vp.clientHeight / 2),
        behavior: "smooth",
      });
    }
```

Replace the `scrollTo` coordinates so they account for the current zoom (positions are canvas coordinates, scroll is in scaled pixels):

```ts
    const vp = viewportRef.current, pos = posById[slug];
    if (vp && pos) {
      vp.scrollTo({
        left: Math.max(0, (pos.x + LAYOUT.CARD_W / 2) * zoom - vp.clientWidth / 2),
        top: Math.max(0, (pos.y + LAYOUT.CARD_H / 2) * zoom - vp.clientHeight / 2),
        behavior: "smooth",
      });
    }
```

Then add `zoom` to that effect's dependency array. Find:

```ts
  }, [byId, posById]);
```

(the one closing the `select` effect, currently line 56) and replace with:

```ts
  }, [byId, posById, zoom]);
```

- [ ] **Step 7: Add zoom CSS**

In `src/components/tech-tree/tech-tree.css`, find:

```css
  #tt-canvas { position: relative; }
```

Add directly below it:

```css
  .tt-sizer { position: relative; }
  .tt-zoom { display: flex; align-items: center; gap: 6px; }
  .tt-zoom-val { font-family: var(--font-mono); font-size: 12px; color: var(--muted-foreground); min-width: 38px; text-align: center; }
```

- [ ] **Step 8: Verify lint and build**

Run: `npm run lint`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Manual check**

Run `npm run dev`, open `/tech`. Expected: +/− change zoom and the percentage updates; Fit scales the whole tree into view; tier labels stay aligned over their columns at every zoom level; pan-drag still works; clicking a node from another page via `?select=<slug>` still scrolls it into view.

- [ ] **Step 10: Commit**

```bash
git add src/components/tech-tree/TechTreeView.tsx src/components/tech-tree/tech-tree.css
git commit -m "feat(tech-tree): button + fit zoom for the canvas"
```

---

## Task 4: Wheel-to-zoom (zoom-to-cursor)

Plain mouse wheel zooms toward the cursor. Uses a non-passive native listener because React's synthetic `onWheel` is passive and cannot call `preventDefault`.

**Files:**
- Modify: `src/components/tech-tree/TechTreeView.tsx` (add an effect; uses `viewportRef`, `zoomTo`)

- [ ] **Step 1: Add the non-passive wheel listener effect**

In `src/components/tech-tree/TechTreeView.tsx`, add this effect after the `select` deep-link effect (after its closing `}, [byId, posById, zoom]);`):

```ts
  useEffect(() => {
    const vp = viewportRef.current; if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomTo(zoom * factor, e.clientX - r.left, e.clientY - r.top);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoom, zoomTo]);
```

- [ ] **Step 2: Verify lint and build**

Run: `npm run lint`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual check**

Run `npm run dev`, open `/tech`. Expected: scrolling the mouse wheel over the canvas zooms in/out and the point under the cursor stays roughly fixed; zoom clamps at 40% and 150%; plain wheel no longer scrolls the page vertically; pan-drag and node selection still work.

- [ ] **Step 4: Commit**

```bash
git add src/components/tech-tree/TechTreeView.tsx
git commit -m "feat(tech-tree): wheel zoom-to-cursor on the canvas"
```

---

## Self-Review notes

- **Spec coverage:** coin icon (Task 1 data + Task 2 render, with diamond fallback) ✓; zoom via buttons + Fit (Task 3) ✓; wheel zoom-to-cursor, non-passive listener (Task 4) ✓; tier-bar scaling (Task 3 Step 4) ✓; `select` scroll math updated for zoom (Task 3 Step 6) ✓; clamp 0.4–1.5 (`clampZoom`) ✓.
- **Type consistency:** `crownsIcon` defined in Task 1 (types + transform) and consumed in Task 2; `zoom`/`zoomTo`/`zoomBy`/`fitToScreen`/`clampZoom`/`ZOOM_*` defined in Task 3 and reused in Task 4. Names match across tasks.
- **Pan math:** pointer-drag pan operates in viewport pixels (`scrollLeft/scrollTop` deltas) and needs no zoom scaling — intentionally untouched.
- **Out of scope (per spec):** pinch/touch zoom, persisting zoom, Steam sync — none included.
