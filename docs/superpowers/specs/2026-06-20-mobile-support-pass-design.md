# Mobile Support Pass — Design

**Date:** 2026-06-20
**Branch:** `feat/mobile-support-pass`
**App:** `apps/wiki` (Next.js 16 / Prisma 6 / Tailwind v4 + shadcn tokens)

## Goal

Make the wiki usable on phones for the parts that can be, and gracefully block
the part that can't:

- **Builder** — gate behind a desktop-only message (3D + 3-column layout can't fit a phone).
- **Gallery** — make the page responsive and add it to the site nav.
- **Tech Tree** — fix the zoom-out breakage and add pinch-to-zoom.
- **Mobile nav drawer** — polish the existing hamburger drawer to design-system standard.

Non-goals: a mobile redesign of the builder or the tech-tree node layout; changes
to the shared `ToolNavBrand` tool app-bar chrome.

## Design tokens / conventions (apply throughout)

- Dark-only, `radius: 0`, Oswald display font (`--font-display`), token colors from
  `globals.css`. **No hard-coded hex.**
- Breakpoints reuse existing tokens — `sm` (640px), `lg` (1024px), `nav` (1088px,
  `--breakpoint-nav`). No new breakpoints introduced.
- Tool pages own scoped CSS files (`tb-` / `tt-` / `tg-`); `@media` queries are
  acceptable in those files. Tailwind utility components keep using `sm:`/`lg:`/`nav:`.

---

## 1. Builder — desktop-only gate

**File:** `apps/wiki/src/components/builder/BuilderClient.tsx`

The builder body is `grid-template-columns: 300px 1fr 324px` (624px of fixed panels)
at `height: 100vh; overflow: hidden`, plus a Three.js scene. Unusable below ~1024px.

- Add a client-side width check **before** the `dynamic(() => import("./Builder"))`
  resolves, so three.js never loads on mobile.
- Threshold: `window.innerWidth < 1024` (the `lg` token — smallest width where the
  fixed columns fit with viewport room; landscape tablets pass, phones don't).
- Re-evaluate on `resize` (debounced) so rotating/resizing into range recovers without
  a reload. Guard against SSR (`useState(false)` + `useEffect`), consistent with the
  existing `ssr: false` mount.
- Below threshold: render a branded full-screen panel reusing `.bld-loading` token
  styling — heading *"The Trampler Builder needs a larger screen"*, a short line, and
  links to **Gallery** (`/gallery`) and **Tech Tree** (`/tech`) as mobile-friendly
  alternatives, plus a back-home link (`/`).
- At/above threshold: unchanged — mounts the real `<Builder />`.

**Acceptance:** at 390px and 768px the gate shows with working links; at 1024px+ the
builder mounts; resizing across 1024 flips without reload; no three.js network/JS
work happens while gated.

---

## 2. Gallery — responsive + nav entry

**Files:** `apps/wiki/src/lib/taxonomy.ts`, `apps/wiki/src/components/gallery/gallery.css`

Current grid: `repeat(auto-fill, minmax(304px, 1fr))`; desktop app-bar with a 230px
search and segmented filter controls. No `@media` today.

**Nav entry:**
- Add a `gallery` entry to `SECTIONS` as `kind: "link"` (href `/gallery`). It then
  appears in the desktop `MainNav` and the mobile drawer automatically. Place it
  alongside `tech` and `builder` (the other `link` sections).
- Verify nothing iterates `SECTIONS` assuming only data sections have categories that
  break with an empty-category link entry (tech/builder already set this precedent, so
  this is safe — confirm during implementation).

**Responsive CSS (`gallery.css`, scoped, `@media`):**
- `@media (max-width: 640px)`:
  - `.tg-grid` → single column: `grid-template-columns: minmax(0, 1fr)` (overrides the
    304px min so cards never overflow a 390px screen).
  - `.tg-appbar` wraps (`flex-wrap` / reduced padding); search + segmented controls go
    full-width and the filter chips become a horizontally scrollable row.
  - Reduce `.tg-scroll` padding (24px → ~14px) to reclaim width.
- Modal already uses `max-width: calc(100vw - 32px)` — leave as is.

**Acceptance:** at 390px the gallery is a single readable column, the toolbar/filters
are reachable and not clipped, and Gallery is listed in both desktop nav and the mobile
drawer.

---

## 3. Tech Tree — fix zoom-out + pinch-to-zoom

**File:** `apps/wiki/src/components/tech-tree/TechTreeView.tsx`

Zoom is `transform: scale(zoom)` on `#tt-canvas` inside a native-scroll `.tt-viewport`;
pan writes `scrollLeft/scrollTop`. `ZOOM_MIN = 0.4`, `ZOOM_MAX = 1.5`.

**Fix the break:**
- The zoom-anchor re-scroll (`vp.scrollLeft = (vp.scrollLeft + p.ax) * ratio - p.ax`,
  same for top) produces out-of-range values when the scaled canvas approaches/falls
  below the viewport size — this is the jump on zoom-out. After computing, clamp:
  `scrollLeft ∈ [0, max(0, scrollWidth - clientWidth)]`, `scrollTop` likewise.
- Make `fitToScreen()` the on-load default (run once after layout) so a small viewport
  opens fully fit instead of mid-zoom.
- Decision (avoids a snap-back jump): the effective zoom floor becomes
  `min(ZOOM_MIN, fitRatio)` rather than a fixed `0.4`. On a phone the whole tree may need
  e.g. 0.2 to fit; if interactive zoom were still floored at 0.4, the first pinch would
  snap back up. So `clampZoom` uses a dynamic minimum derived from the current viewport's
  fit ratio (recomputed on resize); `ZOOM_MAX` stays `1.5`. Fit, wheel, buttons, and
  pinch all share this same floor and stay consistent.

**Pinch-to-zoom:**
- Track active pointers in a `Map<pointerId, {x,y}>` updated in the existing
  `onPanDown/onPanMove/endPan` handlers (which already exist on `.tt-viewport`).
- When exactly two pointers are down, switch from pan to pinch: on move, `factor =
  currentDistance / startDistance` (recomputed incrementally), anchored at the two-pointer
  midpoint relative to the viewport rect, fed into the existing
  `zoomTo(factor, cx, cy)`.
- When pointer count drops back to 1 or 0, resume/stop panning cleanly. Preserve the
  existing 4px click-vs-drag movement threshold so taps on nodes still register.
- Single-finger drag-pan unchanged.

**Acceptance:** on a touch device (or devtools touch emulation) two-finger pinch zooms
smoothly about the pinch center; zooming all the way out no longer jumps/teleports the
view; the tree opens fit-to-screen; tapping a node still selects it (no accidental drag).

---

## 4. Mobile nav drawer — design polish

**File:** `apps/wiki/src/components/SiteHeader.tsx`

The drawer (`Sheet`, shown below `nav` / 1088px) is currently a flat link list filtered
to `data`/`link` sections. Bring it to design-system standard:

- SAND·HELP brand/logo at the top of the drawer (mirrors the header lockup).
- Group the links with small uppercase Oswald section labels (the `--font-display`
  label style used elsewhere):
  - **Browse** — Items, Environment, Tramplers (`data` sections).
  - **Tools** — Tech Tree, Builder, Gallery (`link` sections, incl. the new Gallery).
- Active-route highlighting (primary accent) on the current section; `card-elevated`
  hover, consistent spacing/dividers using `border` tokens.
- Keep the search pinned in the drawer (bottom).
- Continue deriving items from `SECTIONS` so the new Gallery entry appears automatically.

**Acceptance:** the drawer shows the brand, grouped Browse/Tools sections (Gallery
present), highlights the active route, and matches the dark/radius-0/Oswald system.

---

## 5. Verification

Run the dev server (likely already on :3000) and check in devtools responsive mode:

- **390px (phone):** builder shows the gate with working links; gallery is one column
  with reachable filters; tech tree opens fit and pinch/zoom-out behave; drawer lists
  Gallery and is styled.
- **768px (tablet portrait):** builder still gated; gallery readable; nav drawer still
  used (below 1088px).
- **1024px:** builder gate flips to the real builder on crossing the threshold (resize,
  no reload).
- No hard-coded hex added; no new breakpoint tokens; `npm run lint`/typecheck clean.

## Risk notes

- **Tech-tree pinch** is the only part with real interaction risk (two-pointer state
  machine). Mitigate by reusing the existing `zoomTo` anchor path and preserving the
  click-vs-drag threshold; test tap-to-select after.
- Everything else is mechanical responsive CSS + a gate + a taxonomy entry.
