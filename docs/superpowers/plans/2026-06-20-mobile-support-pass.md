# Mobile Support Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wiki usable on phones — gate the Builder behind a desktop-only message, make the Gallery responsive and reachable from the nav, fix Tech-Tree zoom-out + add pinch-to-zoom, and polish the mobile nav drawer.

**Architecture:** Four mostly-independent changes in `apps/wiki`. A pure taxonomy addition (Gallery → `SECTIONS`) unlocks both nav surfaces. The drawer is extracted into a client `MobileNav` component for active-route highlighting. Builder gating happens in `BuilderClient` *before* the dynamic three.js import. Tech-tree zoom math is fixed in place and a two-pointer pinch handler is added. Responsive CSS lives in the tool pages' scoped `@media` blocks.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4 + shadcn tokens, scoped CSS files (`tb-`/`tt-`/`tg-`), Vitest (node env) for unit tests, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-06-20-mobile-support-pass-design.md`

**Conventions (apply everywhere):** dark-only, `radius:0`, `--font-display` = Oswald, token colors only — the one allowed literal is `#1a0f04` for text-on-primary, which is the repo's established value (see `gallery.css` `.tg-nav`, `.tg-brand-mark`). Reuse breakpoints `sm` (640px), `lg` (1024px), `nav` (1088px) — introduce no new ones.

---

## File Structure

**Create:**
- `apps/wiki/src/lib/taxonomy.test.ts` — Vitest unit test for the new Gallery section.
- `apps/wiki/src/components/MobileNav.tsx` — client drawer (Sheet) with grouped, active-aware links.
- `apps/wiki/tests/e2e/mobile.spec.ts` — Playwright mobile-viewport e2e (builder gate + drawer Gallery link).

**Modify:**
- `apps/wiki/src/lib/taxonomy.ts` — add the `gallery` section.
- `apps/wiki/src/components/SiteHeader.tsx` — render `<MobileNav/>` instead of the inline Sheet.
- `apps/wiki/src/components/gallery/gallery.css` — append mobile `@media`.
- `apps/wiki/src/components/builder/BuilderClient.tsx` — desktop-width gate.
- `apps/wiki/src/components/builder/builder.css` — append `.bld-gate` styles.
- `apps/wiki/src/components/tech-tree/TechTreeView.tsx` — dynamic zoom floor, clamp scroll re-anchor, fit-on-load (mobile), pinch-to-zoom.
- `apps/wiki/src/components/tech-tree/tech-tree.css` — append mobile `@media`.
- `apps/wiki/tests/e2e/wiki.spec.ts` — add `/gallery` to the a11y page list.

**Working directory for all commands:** `apps/wiki` (the wiki app root, where `package.json` lives). Branch `feat/mobile-support-pass` is already checked out.

---

## Task 1: Add Gallery to the nav taxonomy

**Files:**
- Modify: `apps/wiki/src/lib/taxonomy.ts:54-56`
- Test: `apps/wiki/src/lib/taxonomy.test.ts`

A `link`-kind section with empty `categories` renders as a plain nav link in `MainNav`
(the `tech`/`builder` entries already do this) and is picked up by the mobile drawer.
The `/gallery` route already exists.

- [ ] **Step 1: Write the failing test**

Create `apps/wiki/src/lib/taxonomy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SECTIONS, getSection } from "./taxonomy";

describe("gallery nav section", () => {
  it("is registered as a link section pointing at /gallery", () => {
    const gallery = getSection("gallery");
    expect(gallery).toBeDefined();
    expect(gallery?.kind).toBe("link");
    expect(gallery?.href ?? "/gallery").toBe("/gallery");
    expect(gallery?.categories).toEqual([]);
  });

  it("orders gallery alongside the other tool links (after builder)", () => {
    const slugs = SECTIONS.map((s) => s.slug);
    expect(slugs).toContain("gallery");
    expect(slugs.indexOf("gallery")).toBeGreaterThan(slugs.indexOf("builder"));
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/taxonomy.test.ts`
Expected: FAIL — `getSection("gallery")` is `undefined`.

- [ ] **Step 3: Add the section**

In `apps/wiki/src/lib/taxonomy.ts`, change the `SECTIONS` array (currently lines 40-57) so the
`builder` entry is followed by a `gallery` entry, before the `tools` placeholder:

```ts
  { slug: "tech", label: "Tech Tree", kind: "link", categories: [] },
  { slug: "builder", label: "Builder", kind: "link", categories: [] },
  { slug: "gallery", label: "Gallery", kind: "link", categories: [] },
  { slug: "tools", label: "Tools", kind: "placeholder", categories: [] },
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/taxonomy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxonomy.ts src/lib/taxonomy.test.ts
git commit -m "feat(nav): register Gallery as a nav section"
```

---

## Task 2: Mobile nav drawer — extract MobileNav with grouping + active state

**Files:**
- Create: `apps/wiki/src/components/MobileNav.tsx`
- Modify: `apps/wiki/src/components/SiteHeader.tsx`

The drawer needs `usePathname()` for active highlighting, so it must be a client component;
extracting it also keeps `SiteHeader` a server component. Links are derived from `SECTIONS`
so the new Gallery entry (Task 1) appears automatically. Verified by the e2e in Task 6.

- [ ] **Step 1: Create the MobileNav component**

Create `apps/wiki/src/components/MobileNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { SearchBox } from "@/components/SearchBox";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SECTIONS } from "@/lib/taxonomy";

// Browse = real data sections; Tools = the standalone tool pages (Tech Tree,
// Builder, Gallery — all `link` kind). The "Tools" placeholder section is
// intentionally excluded (it has no page yet).
const BROWSE = SECTIONS.filter((s) => s.kind === "data");
const TOOLS = SECTIONS.filter((s) => s.kind === "link");

const groupLabelCls =
  "px-2 pb-1 pt-4 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground";

function itemCls(active: boolean) {
  return [
    "block rounded px-2 py-2 text-sm font-semibold transition-colors",
    active
      ? "bg-card-elevated text-primary"
      : "text-foreground hover:bg-card-elevated hover:text-primary",
  ].join(" ");
}

export function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const renderLink = (slug: string, label: string, href: string) => (
    <Link
      key={slug}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={itemCls(isActive(href))}
    >
      {label}
    </Link>
  );

  return (
    <Sheet>
      <SheetTrigger asChild className="nav:hidden">
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col border-border bg-card">
        <SheetTitle asChild>
          <Link
            href="/"
            className="group px-2 font-display text-xl font-bold tracking-wide text-foreground"
          >
            SAND
            <span aria-hidden="true" className="mx-0.5 text-primary">
              ·
            </span>
            HELP
          </Link>
        </SheetTitle>

        <nav aria-label="Mobile" className="mt-2 flex-1 overflow-y-auto px-2">
          <div className={groupLabelCls}>Browse</div>
          {BROWSE.map((s) => renderLink(s.slug, s.label, s.href ?? `/${s.slug}`))}

          <div className={groupLabelCls}>Tools</div>
          {TOOLS.map((s) => renderLink(s.slug, s.label, s.href ?? `/${s.slug}`))}

          <div className={groupLabelCls}>More</div>
          {renderLink("about", "About", "/about")}
        </nav>

        <div className="px-4 pb-2">
          <SearchBox variant="navbar" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Rewire SiteHeader to use it**

Replace the entire contents of `apps/wiki/src/components/SiteHeader.tsx` with:

```tsx
import Link from "next/link";
import { MainNav } from "@/components/MainNav";
import { SearchBox } from "@/components/SearchBox";
import { AuthMenu } from "@/components/AuthMenu";
import { MobileNav } from "@/components/MobileNav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      {/* The single "Primary" navigation landmark. Search + About live inside
          this nav so the e2e suite can scope queries to nav.getByRole(...). */}
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4"
      >
        <Link
          href="/"
          aria-label="SAND HELP — home"
          className="group font-display text-xl font-bold tracking-wide text-foreground transition-colors hover:text-primary focus-visible:text-primary"
        >
          SAND
          <span
            aria-hidden="true"
            className="mx-0.5 text-primary transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
          >
            ·
          </span>
          HELP
        </Link>

        <div className="hidden flex-1 nav:block">
          <MainNav />
        </div>
        <div className="flex-1 nav:hidden" />

        <div className="hidden items-center gap-2 nav:flex">
          <SearchBox variant="navbar" />
          <Link
            href="/about"
            className="nav-link text-foreground hover:text-primary px-2 py-1 text-sm font-semibold rounded"
          >
            About
          </Link>
          <AuthMenu />
        </div>

        <MobileNav />
      </nav>
    </header>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/MobileNav.tsx src/components/SiteHeader.tsx`
Expected: no errors. (If `tsc --noEmit` is slow/:  `npm run lint` lints the whole app.)

- [ ] **Step 4: Smoke-check in dev**

Run the dev server if not already running: `npm run dev` (likely already on :3000).
In the browser at a narrow width (devtools responsive, ~390px), open `/`, click the hamburger:
the drawer shows the brand, **Browse** (Items/Environment/Tramplers), **Tools** (Tech Tree/Builder/Gallery),
**More** (About), and a search box. Navigating to `/gallery` and reopening highlights Gallery.

- [ ] **Step 5: Commit**

```bash
git add src/components/MobileNav.tsx src/components/SiteHeader.tsx
git commit -m "feat(nav): grouped, active-aware mobile drawer (MobileNav)"
```

---

## Task 3: Gallery responsive layout

**Files:**
- Modify: `apps/wiki/src/components/gallery/gallery.css` (append at end of file)

The grid is `repeat(auto-fill, minmax(304px, 1fr))` and the app/sub bars are single-row flex.
At ≤640px: one column (drop the 304px floor), wrap the bars, shrink padding. The modal already
uses `max-width: calc(100vw - 32px)` — leave it.

- [ ] **Step 1: Append the mobile media block**

Add to the end of `apps/wiki/src/components/gallery/gallery.css`:

```css
/* ============================================================
   MOBILE  (≤ 640px) — single column, wrapping toolbars
   ============================================================ */
@media (max-width: 640px) {
  /* The top app bar and sub toolbar are single-row flex on desktop; let them
     wrap and tighten padding so they fit a phone instead of overflowing. */
  .tg-appbar { height: auto; min-height: 56px; flex-wrap: wrap; gap: 10px; padding: 10px 14px; }
  .tg-appbar .spacer { display: none; }

  .tg-toolbar { flex-wrap: wrap; gap: 12px; padding: 12px 14px; }
  .tg-toolbar .spacer { display: none; }
  .tg-sortwrap { margin-left: auto; }
  .tg-select { width: 150px; }

  /* One readable column; minmax(0,1fr) drops the 304px floor so cards never
     overflow a ~390px viewport. */
  .tg-scroll { padding: 14px; }
  .tg-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; }
}
```

- [ ] **Step 2: Verify in dev at 390px**

With the dev server running, open `/gallery` in devtools responsive mode at 390px:
the grid is a single column, cards are not clipped, the top bar / sub-toolbar wrap onto
multiple rows and remain usable (Community/My designs, Sort, + New rig, account menu all reachable).
At ≥768px the layout is unchanged from before.

- [ ] **Step 3: Commit**

```bash
git add src/components/gallery/gallery.css
git commit -m "feat(gallery): responsive single-column layout on phones"
```

---

## Task 4: Builder desktop-only gate

**Files:**
- Modify: `apps/wiki/src/components/builder/BuilderClient.tsx`
- Modify: `apps/wiki/src/components/builder/builder.css` (append at end)

Gate on `window.innerWidth >= 1024` *before* the dynamic `import("./Builder")` resolves,
so three.js never loads on a phone. State starts `null` (unmeasured) to avoid an SSR/first-paint
flash, then resolves in `useEffect`; re-measures on resize (rAF-debounced).

- [ ] **Step 1: Replace BuilderClient with the gated version**

Replace the entire contents of `apps/wiki/src/components/builder/BuilderClient.tsx` with:

```tsx
"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./builder.css";

// three.js can't server-render, so the builder is loaded client-only.
const Builder = dynamic(() => import("./Builder"), {
  ssr: false,
  loading: () => <div className="bld-loading">Loading builder…</div>,
});

// Smallest width where the builder's fixed 300px + canvas + 324px layout fits
// with viewport room (the `lg` token). Below this we show a gate instead.
const MIN_WIDTH = 1024;

export default function BuilderClient() {
  // `null` until measured on the client, so neither the gate nor the builder
  // renders on the server / first paint based on a guessed width.
  const [wideEnough, setWideEnough] = useState<boolean | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => setWideEnough(window.innerWidth >= MIN_WIDTH);
    measure();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (wideEnough === null) {
    return <div className="bld-loading">Loading builder…</div>;
  }

  if (!wideEnough) {
    return (
      <div className="bld-gate">
        <div className="bld-gate-card">
          <span className="bld-gate-glyph" aria-hidden="true">
            ▦
          </span>
          <h1 className="bld-gate-title">Bigger screen needed</h1>
          <p className="bld-gate-text">
            The Trampler Builder is a 3D, multi-panel tool that needs a desktop
            or laptop. Open it on a screen at least {MIN_WIDTH}px wide.
          </p>
          <div className="bld-gate-links">
            <Link href="/gallery" className="bld-gate-btn primary">
              Browse the Gallery
            </Link>
            <Link href="/tech" className="bld-gate-btn">
              Open the Tech Tree
            </Link>
            <Link href="/" className="bld-gate-btn ghost">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <Builder />;
}
```

- [ ] **Step 2: Append the gate styles**

Add to the end of `apps/wiki/src/components/builder/builder.css`:

```css
/* ---- mobile gate (BuilderClient blocks screens below 1024px) ---- */
.bld-gate {
  height: 100vh; display: grid; place-items: center; padding: 24px;
  background: var(--background); color: var(--foreground);
}
.bld-gate-card {
  max-width: 360px; display: flex; flex-direction: column; align-items: center;
  gap: 14px; text-align: center;
}
.bld-gate-glyph { font-size: 40px; color: var(--dim); }
.bld-gate-title {
  font-family: var(--font-display); text-transform: uppercase; letter-spacing: .06em;
  font-size: 20px; font-weight: 700; color: var(--foreground);
}
.bld-gate-text { font-size: 13.5px; line-height: 1.6; color: var(--muted-foreground); }
.bld-gate-links { display: flex; flex-direction: column; gap: 9px; width: 100%; margin-top: 6px; }
.bld-gate-btn {
  display: block; padding: 11px 16px; border: 1px solid var(--border-strong);
  font-family: var(--font-display); text-transform: uppercase; letter-spacing: .05em;
  font-size: 13px; font-weight: 600; color: var(--foreground);
  transition: border-color .12s, color .12s, background-color .12s;
}
.bld-gate-btn:hover { border-color: var(--primary); color: var(--primary-hover); }
.bld-gate-btn.primary { background: var(--primary); color: #1a0f04; border-color: var(--primary); }
.bld-gate-btn.primary:hover { background: var(--primary-hover); color: #1a0f04; }
.bld-gate-btn.ghost { border-color: transparent; color: var(--muted-foreground); }
.bld-gate-btn.ghost:hover { color: var(--foreground); }
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx eslint src/components/builder/BuilderClient.tsx`
Expected: no errors.

- [ ] **Step 4: Verify in dev**

With dev running, open `/builder` at 390px: the gate shows with the three links and no
3D canvas appears (check the Network/Elements panel — no `<canvas>`). Widen the window past
1024px without reloading: the real builder mounts. Narrow it again: the gate returns.

- [ ] **Step 5: Commit**

```bash
git add src/components/builder/BuilderClient.tsx src/components/builder/builder.css
git commit -m "feat(builder): desktop-only gate below 1024px with tool links"
```

---

## Task 5: Tech-Tree zoom-out fix + pinch-to-zoom

**Files:**
- Modify: `apps/wiki/src/components/tech-tree/TechTreeView.tsx`
- Modify: `apps/wiki/src/components/tech-tree/tech-tree.css` (append at end)

Four changes in `TechTreeView.tsx`: (a) a dynamic zoom floor `min(ZOOM_MIN, fitRatio)` so a
phone can fit the whole tree and pinch stays consistent; (b) clamp the post-zoom scroll
re-anchor to valid scroll bounds (the zoom-out jump); (c) fit-to-screen on load for narrow
viewports; (d) two-pointer pinch in the existing pan handlers. Then a small mobile `@media`
so the app bar / planner panel don't overflow.

- [ ] **Step 1: Replace the module-level `clampZoom` with component-level dynamic clamp**

In `apps/wiki/src/components/tech-tree/TechTreeView.tsx`, delete the module-level `clampZoom`
(currently line 23):

```ts
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
```

Leave `ZOOM_MIN`, `ZOOM_MAX`, `ZOOM_STEP` (lines 20-22) as they are.

- [ ] **Step 2: Add `fitRatio` + `clamp` inside the component**

Immediately after the `posById`/`accentOf` `useMemo`s and before `const [unlocked, ...`
(around line 42), add:

```tsx
  // The zoom that fits the whole canvas in the current viewport. Used both for
  // "Fit" and as the dynamic lower bound on zoom: on a phone the tree may need a
  // zoom below ZOOM_MIN to fit, and pinch/buttons must be allowed down to it too
  // (otherwise the first interaction snaps back up).
  const fitRatio = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return ZOOM_MIN;
    return Math.min(vp.clientWidth / layout.canvasW, vp.clientHeight / layout.canvasH);
  }, [layout.canvasW, layout.canvasH]);

  const clamp = useCallback(
    (z: number) => {
      const floor = Math.min(ZOOM_MIN, fitRatio());
      return Math.min(ZOOM_MAX, Math.max(floor, z));
    },
    [fitRatio],
  );
```

Note: `viewportRef` is declared at the current line 46. Move the `viewportRef` declaration
up so it precedes `fitRatio` — i.e. place this block *after* the `const viewportRef =
useRef<HTMLDivElement>(null);` line. Concretely: keep `viewportRef` where it is (line 46)
and insert the `fitRatio`/`clamp` block right after it (after line 46), not before.

- [ ] **Step 3: Use `clamp` in `zoomTo` and `fitToScreen`**

In `zoomTo` (currently line 151) change:

```tsx
    const z = clampZoom(prev * factor);
```
to:
```tsx
    const z = clamp(prev * factor);
```

and add `clamp` to its dependency array — change `}, []);` at the end of `zoomTo`
(line 159) to `}, [clamp]);`.

In `fitToScreen` (currently lines 189-195) change the body so it uses the raw fit ratio
through `clamp` (which now allows sub-ZOOM_MIN):

```tsx
  const fitToScreen = useCallback(() => {
    const vp = viewportRef.current; if (!vp) return;
    const z = clamp(fitRatio());
    zoomRef.current = z;
    setZoom(z);
    vp.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }, [clamp, fitRatio]);
```

- [ ] **Step 4: Clamp the scroll re-anchor to valid bounds**

Replace the body of the `useIsoLayoutEffect` re-anchor effect (currently lines 164-173) with:

```tsx
  useIsoLayoutEffect(() => {
    const vp = viewportRef.current; if (!vp) return;
    const from = appliedZoom.current;
    appliedZoom.current = zoom;
    const p = pendingAnchor.current; pendingAnchor.current = null;
    if (!p || from === zoom) return;
    const ratio = zoom / from;
    // Clamp to the (post-resize) scroll range. Without this, zooming out drives
    // the computed offset negative / past the end and the view teleports.
    const maxLeft = Math.max(0, vp.scrollWidth - vp.clientWidth);
    const maxTop = Math.max(0, vp.scrollHeight - vp.clientHeight);
    vp.scrollLeft = Math.min(maxLeft, Math.max(0, (vp.scrollLeft + p.ax) * ratio - p.ax));
    vp.scrollTop = Math.min(maxTop, Math.max(0, (vp.scrollTop + p.ay) * ratio - p.ay));
  }, [zoom]);
```

- [ ] **Step 5: Fit-to-screen on load for narrow viewports**

Add this effect right after the deep-link effect (after the effect that ends at line 82,
i.e. before `const persist = ...`):

```tsx
  const didInitZoom = useRef(false);
  useEffect(() => {
    if (didInitZoom.current) return;
    didInitZoom.current = true;
    // Don't override an explicit deep-link target (?select=...).
    if (new URLSearchParams(window.location.search).get("select")) return;
    // On phones/tablets start fit-to-screen so the tree isn't opened mid-zoom
    // with most of it off-screen. Desktop keeps its 100% default.
    if (window.innerWidth < 1024) fitToScreen();
  }, [fitToScreen]);
```

- [ ] **Step 6: Add pinch-to-zoom state + rewrite the pan handlers**

Replace the pan block (currently lines 126-146: `const pan = useRef…` through the end of
`endPan`) with:

```tsx
  const pan = useRef<{ x: number; y: number; left: number; top: number; active: boolean } | null>(null);
  const panned = useRef(false);
  // Active touch/pointer points by id, for two-finger pinch detection.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDist = useRef<number | null>(null);
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const onPanDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".tnode-status")) return; // let the ring handle its own clicks
    const vp = viewportRef.current; if (!vp) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // Two fingers down → start a pinch; abandon any single-finger pan.
      const pts = [...pointers.current.values()];
      pinchDist.current = dist(pts[0], pts[1]);
      for (const id of pointers.current.keys()) {
        try { vp.setPointerCapture(id); } catch { /* pointer already gone */ }
      }
      pan.current = null;
      panned.current = true; // swallow the trailing click so no node toggles
      return;
    }
    pan.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop, active: false };
  }, []);

  const onPanMove = useCallback((e: React.PointerEvent) => {
    const vp = viewportRef.current; if (!vp) return;
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // Two-finger pinch: zoom by the change in finger distance, anchored at the midpoint.
    if (pointers.current.size === 2 && pinchDist.current != null) {
      const pts = [...pointers.current.values()];
      const nd = dist(pts[0], pts[1]);
      if (pinchDist.current > 0 && nd > 0) {
        const r = vp.getBoundingClientRect();
        const cx = (pts[0].x + pts[1].x) / 2 - r.left;
        const cy = (pts[0].y + pts[1].y) / 2 - r.top;
        zoomTo(nd / pinchDist.current, cx, cy);
      }
      pinchDist.current = nd;
      return;
    }
    // Single-finger / mouse pan.
    const p = pan.current; if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.active && Math.hypot(dx, dy) < 4) return; // movement threshold → still a click
    if (!p.active) { p.active = true; vp.setPointerCapture(e.pointerId); vp.classList.add("is-panning"); }
    vp.scrollLeft = p.left - dx;
    vp.scrollTop = p.top - dy;
  }, [zoomTo]);

  const endPan = useCallback((e: React.PointerEvent) => {
    const vp = viewportRef.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    if (pan.current?.active) panned.current = true;
    if (vp) { vp.classList.remove("is-panning"); if (vp.hasPointerCapture?.(e.pointerId)) vp.releasePointerCapture(e.pointerId); }
    pan.current = null;
  }, []);
```

Note `zoomTo` is defined *below* the pan block (line 148). `onPanMove` references `zoomTo`
in its dependency array; because `zoomTo` is a `useCallback` referenced inside another
`useCallback`, the reference resolves fine at call time (hoisted `const` in module scope of
the component body). If ESLint's `react-hooks/exhaustive-deps` flags ordering, move the
`zoomTo` definition (lines 148-159) to sit *above* this pan block. Verify with lint in Step 8.

- [ ] **Step 7: Append the tech-tree mobile media block**

Add to the end of `apps/wiki/src/components/tech-tree/tech-tree.css`:

```css
/* ============================================================
   MOBILE  (≤ 640px) — wrap the chrome; the canvas pans/pinches
   ============================================================ */
@media (max-width: 640px) {
  .tt-appbar { height: auto; min-height: 56px; flex-wrap: wrap; gap: 10px; padding: 10px 14px; }
  .tt-toolbar { margin-left: 0; flex-wrap: wrap; gap: 8px; width: 100%; }
  .tt-legend { flex-wrap: wrap; gap: 10px; padding: 8px 14px; }
  .tt-legend .hint { margin-left: 0; flex-basis: 100%; }
  /* The fixed path planner is 320px bottom-right on desktop; make it a bottom
     sheet on phones so it doesn't sit off-screen / over the controls. */
  .tt-summary { left: 8px; right: 8px; bottom: 8px; width: auto; }
  #tt-summary-body { max-height: 38vh; }
}
```

- [ ] **Step 8: Typecheck + lint**

Run: `npx eslint src/components/tech-tree/TechTreeView.tsx`
Expected: no errors. If `react-hooks/exhaustive-deps` complains about `zoomTo` ordering,
apply the move described in Step 6's note, then re-run.

- [ ] **Step 9: Verify in dev (desktop + touch emulation)**

With dev running, open `/tech`:
- Desktop (mouse): wheel-zoom in/out anchors under the cursor; zooming all the way out no
  longer jumps/teleports the viewport; "Fit" frames the whole tree.
- Devtools touch emulation (or a real phone) at ~390px: the tree opens fit-to-screen; a
  two-finger pinch zooms about the pinch midpoint; one-finger drag pans; tapping a node
  still selects it (no accidental drag); the app bar wraps and the planner sits along the
  bottom.

- [ ] **Step 10: Commit**

```bash
git add src/components/tech-tree/TechTreeView.tsx src/components/tech-tree/tech-tree.css
git commit -m "fix(tech-tree): clamp zoom-out scroll, add pinch-to-zoom + mobile fit"
```

---

## Task 6: E2E coverage for the mobile gate + drawer

**Files:**
- Create: `apps/wiki/tests/e2e/mobile.spec.ts`
- Modify: `apps/wiki/tests/e2e/wiki.spec.ts:4-7`

Playwright's project is desktop Chromium; `test.use({ ...devices[...] })` overrides the
viewport/UA for this file only. The webServer runs `next build && next start` (slow — a
single run, not per-step). Pinch gestures aren't covered here (not reliably emulable);
they're manual-verified in Task 5.

- [ ] **Step 1: Add `/gallery` to the a11y page list**

In `apps/wiki/tests/e2e/wiki.spec.ts`, the `pages` array (lines 4-7) — add `"/gallery"`:

```ts
const pages = [
  "/", "/items", "/items/sniper-rifle-silencer", "/items/c4-dynamite", "/items/pistol-ammo",
  "/tech", "/tools", "/about", "/environment", "/environment/weapon-crate", "/tramplers",
  "/gallery",
];
```

- [ ] **Step 2: Write the mobile e2e spec**

Create `apps/wiki/tests/e2e/mobile.spec.ts`:

```ts
import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["iPhone 13"] }); // ~390px viewport + touch UA

test("builder shows the desktop-only gate on a phone", async ({ page }) => {
  await page.goto("/builder");
  await expect(page.getByRole("heading", { name: /bigger screen needed/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /browse the gallery/i })).toHaveAttribute("href", "/gallery");
  await expect(page.getByRole("link", { name: /open the tech tree/i })).toHaveAttribute("href", "/tech");
  // three.js is gated out → no canvas mounts.
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("mobile drawer lists Gallery and navigates to it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /open menu/i }).click();
  const gallery = page.getByRole("link", { name: "Gallery" });
  await expect(gallery).toBeVisible();
  await gallery.click();
  await expect(page).toHaveURL(/\/gallery$/);
});
```

- [ ] **Step 3: Run the new e2e spec**

Run: `npm run test:e2e -- mobile`
Expected: 2 passed. (First run builds the app via the configured webServer — allow a few minutes.)

- [ ] **Step 4: Run the a11y suite to confirm /gallery is clean**

Run: `npm run test:e2e -- wiki`
Expected: all a11y + nav tests pass, including the new `/gallery` page.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/mobile.spec.ts tests/e2e/wiki.spec.ts
git commit -m "test(e2e): mobile gate + drawer Gallery; a11y check /gallery"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint + unit tests across the app**

Run: `npm run lint`
Expected: clean.

Run: `npm test`
Expected: passes (includes `taxonomy.test.ts`).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds with no type errors (this app builds without a DB — static `@sandlabs/data`).

- [ ] **Step 3: Manual responsive pass (dev server)**

At devtools widths 390px, 768px, 1024px, 1280px confirm:
- `/builder` — gated below 1024px (links work, no canvas), real builder at ≥1024px, flips on resize.
- `/gallery` — single column at 390px, toolbars reachable; multi-column at ≥768px; reachable from the mobile drawer.
- `/tech` — opens fit on phones; pinch zoom + zoom-out behave; node tap selects; app bar/planner usable.
- `/` and any page — hamburger drawer below 1088px shows grouped Browse/Tools (incl. Gallery) with active highlight.

- [ ] **Step 4: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(mobile): verification fixups"
```

(Skip if nothing changed.)

---

## Self-Review notes

- **Spec coverage:** §1 Builder gate → Task 4; §2 Gallery responsive + nav → Tasks 1, 3 (+ drawer Task 2); §3 Tech-tree fix + pinch + dynamic floor → Task 5; §4 nav drawer polish → Task 2; §5 verification → Tasks 6, 7. All sections mapped.
- **Dynamic floor decision (spec §3):** implemented as `clamp` floor = `min(ZOOM_MIN, fitRatio())`, shared by fit/wheel/buttons/pinch — matches the spec's "avoid snap-back" decision.
- **Naming consistency:** `fitRatio`, `clamp`, `pointers`, `pinchDist`, `MIN_WIDTH`, `wideEnough`, `BROWSE`/`TOOLS` used identically across the tasks that reference them.
- **No placeholders:** every code step shows complete code; commands have expected output.
- **Known out-of-scope (per user):** the shared `ToolNavBrand` chrome is unchanged; gallery/tech app-bar responsiveness is handled in their own scoped CSS, not by restyling `ToolNavBrand`.
