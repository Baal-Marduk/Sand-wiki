# Builder Gallery fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix eight rough edges in the Trampler Builder gallery: full cost-with-icons on cards, side-isometric thumbnails, remove the report feature (keep the table), delete the dead `gallery/[slug]` page, admin hide on cards, open-design-in-builder, hide out-of-game parts from the locker, and correct the brand label.

**Architecture:** Surgical edits to the existing Next.js 16 wiki app under `apps/wiki/`. A new pure `costBreakdown(state)` helper and an exported `COST_ROWS` icon table in `builderCore.js` become the single source of truth shared by the builder's cost panel and the gallery cards. The gallery list query starts carrying `buildCode` so cards can both compute the full cost client-side and hand a build off to the builder via the existing `localStorage.sand_load_code` mechanism. Admin hide reuses the existing `DELETE /api/designs/[slug]` route.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6, three.js (builder scene), Vitest (unit), Playwright (e2e). Run commands from `apps/wiki/`.

---

## File structure

- **Modify** `apps/wiki/src/components/builder/builderCore.js` — add `costBreakdown(state)` + export `COST_ROWS`.
- **Create** `apps/wiki/src/lib/costBreakdown.test.ts` — unit test for the new helper.
- **Modify** `apps/wiki/src/components/builder/Builder.jsx` — use the shared helper/rows; hide out-of-game parts from the locker.
- **Modify** `apps/wiki/src/components/builder/BuilderScene.jsx` — side-isometric thumbnail capture angle.
- **Modify** `apps/wiki/src/lib/designs.ts` — add `buildCode` to the list query/type; remove `reportDesign()`.
- **Delete** `apps/wiki/src/app/api/designs/[slug]/report/route.ts` — report API.
- **Delete** `apps/wiki/src/app/gallery/[slug]/` — dead detail page.
- **Delete** `apps/wiki/src/components/gallery/DesignActions.tsx` — only used by the deleted page.
- **Modify** `apps/wiki/src/components/gallery/AdminHideButton.tsx` — optional `onHidden` callback.
- **Modify** `apps/wiki/src/app/gallery/page.tsx` — pass `admin` into the client.
- **Modify** `apps/wiki/src/components/gallery/GalleryClient.tsx` — `admin` prop, `buildCode` on items, cost rows, open-in-builder, admin hide control.

Throughout: all `npm` commands run from `apps/wiki/`. The build needs no database.

---

### Task 1: Shared `costBreakdown` helper + `COST_ROWS` export

**Files:**
- Modify: `apps/wiki/src/components/builder/builderCore.js` (append after `buildSummary`, which ends at line 304)
- Test: `apps/wiki/src/lib/costBreakdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/wiki/src/lib/costBreakdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { costBreakdown, buildSummary } from "@/components/builder/builderCore.js";

const base = {
  v: 2,
  name: "T",
  chassisId: "compChassis_Medium4_Metal_4x4",
  placements: [
    { id: "a", partId: "compChassis_Medium4_Metal_4x4", x: 0, y: 0, z: 0, rot: 0, conns: {} },
  ],
};

describe("costBreakdown", () => {
  it("returns the four resource keys as non-negative numbers", () => {
    const c = costBreakdown(base);
    for (const k of ["crowns", "mechanical", "pneumatic", "computing"]) {
      expect(typeof c[k]).toBe("number");
      expect(c[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it("matches buildSummary's crowns for the same state", () => {
    expect(costBreakdown(base).crowns).toBe(buildSummary(base).crowns);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- costBreakdown`
Expected: FAIL — `costBreakdown` is not exported (TypeError / undefined is not a function).

- [ ] **Step 3: Implement the helper and the exported rows**

In `apps/wiki/src/components/builder/builderCore.js`, append after the `buildSummary` function (after line 304):

```js
// ---- full build cost (shared by the builder cost panel and gallery cards) ----
// Chassis + every placed part's wiki cost, summed per resource. Pure: derived
// only from the build state so it can run on the server or in the gallery client.
export function costBreakdown(state) {
  const man = manifest(state)
  const t = { crowns: 0, mechanical: 0, pneumatic: 0, computing: 0 }
  const add = (partId, n) => {
    const c = partCosts[partId]
    if (c) for (const k in t) if (typeof c[k] === 'number') t[k] += c[k] * n
  }
  add(state.chassisId, 1)
  for (const row of man.rows) add(row.part.id, row.n)
  return t
}

// Build-cost rows in wiki order: [key, label, iconPath]. Icons are served
// same-origin from /icons. Shared so the builder panel and gallery cards
// can never drift in which resources they show or which icon represents each.
export const COST_ROWS = [
  ['crowns', 'Crowns', '/icons/icon_item_coinCrown.png'],
  ['mechanical', 'Mechanical Parts', '/icons/icon_item_resourceMetal_t1.png'],
  ['pneumatic', 'Pneumatic Parts', '/icons/icon_item_resourceMetal_t2.png'],
  ['computing', 'Computing Module', '/icons/icon_item_resourceMetal_t3.png'],
]
```

(`manifest` and `partCosts` are already in scope in this module — `partCosts` is imported at line 6, `manifest` is defined and used by `buildSummary`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- costBreakdown`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/components/builder/builderCore.js apps/wiki/src/lib/costBreakdown.test.ts
git commit -m "feat(builder): add shared costBreakdown helper + COST_ROWS export"
```

---

### Task 2: Builder cost panel uses the shared helper/rows

**Files:**
- Modify: `apps/wiki/src/components/builder/Builder.jsx` (import line for builderCore; local `COST_ROWS` at lines 48-53; `cost` memo at lines 177-189)

- [ ] **Step 1: Import the shared helper and rows**

Find the existing import from `builderCore` near the top of `Builder.jsx` (it already imports things like `PARTS`, `ALL_PARTS`, `manifest`, `decodeShare`, `buildSummary`). Add `costBreakdown` and `COST_ROWS` to that same import list. Example shape (match the file's actual existing import):

```js
import {
  PARTS, ALL_PARTS, manifest, decodeShare, buildSummary,
  costBreakdown, COST_ROWS, /* ...whatever else is already imported... */
} from '@/components/builder/builderCore.js'
```

- [ ] **Step 2: Delete the local `COST_ROWS` constant**

Remove the local definition at `Builder.jsx:48-53` (the `// Build-cost rows, in wiki order...` comment and the `const COST_ROWS = [...]` array). It is now imported.

- [ ] **Step 3: Replace the `cost` memo with the shared helper**

Replace the `cost` memo (currently `Builder.jsx:177-189`, the block starting `// Total build cost:` through `}, [man, state])`) with:

```js
  // Total build cost (crowns + the three resources), via the shared helper so
  // the gallery cards and this panel can never drift.
  const cost = useMemo(() => costBreakdown(state), [state])
```

The render block at `Builder.jsx:633-645` already maps over `COST_ROWS` and reads `cost[key]` — no change needed there.

- [ ] **Step 4: Verify it builds and unit tests still pass**

Run: `npm run build`
Expected: build succeeds (no type/lint errors from this file).
Run: `npm test`
Expected: PASS (existing suite + the new costBreakdown test).

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/components/builder/Builder.jsx
git commit -m "refactor(builder): cost panel uses shared costBreakdown/COST_ROWS"
```

---

### Task 3: Parts locker never shows out-of-game parts

**Files:**
- Modify: `apps/wiki/src/components/builder/Builder.jsx` (`lockerParts` at lines 30-33; part-row render at lines 501-519; the `ALL_PARTS` import if it becomes unused)

- [ ] **Step 1: Source the locker from enabled parts only**

Replace the `lockerParts` definition (`Builder.jsx:30-33`):

```js
// Locker lists every part incl. game-disabled ones (shown marked), enabled first.
const lockerParts = ALL_PARTS
  .filter((p) => p.category !== 'Chassis' && !p.id.endsWith('_mirror'))
  .sort((a, b) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1))
```

with (note: `PARTS` is already enabled-only — see `builderCore.js:10`):

```js
// Locker lists only parts enabled in the game (chassis + mirror variants excluded).
const lockerParts = PARTS
  .filter((p) => p.category !== 'Chassis' && !p.id.endsWith('_mirror'))
```

- [ ] **Step 2: Remove the now-dead "NOT IN GAME" marker rendering**

In the part-row render (`Builder.jsx:501-519`), simplify so there is no disabled state. Change the button to drop the `disabled` class and the disabled tooltip branch, and remove the `NOT IN GAME` tag span. The button becomes:

```jsx
                          <button
                            type="button"
                            className={`tb-part ${activePart === p.id ? 'active' : ''}`}
                            onClick={() => {
                              setActivePart(activePart === p.id ? null : p.id)
                              setActiveRot(0)
                              setSelectedId(null)
                            }}
                            title={p.desc ? `${p.name}\n\n${p.desc}` : p.id}
                          >
                            <span className="tb-part-icon"><Thumb partId={p.id} /></span>
                            <span className="tb-part-name">{p.name}</span>
                            <span className="tb-part-size">
                              {p.bounds[0]}×{p.bounds[2]}{p.bounds[1] > 1 ? `·${p.bounds[1]}h` : ''}
                              {p.mirror ? ' ⇋' : ''}
                            </span>
                          </button>
```

- [ ] **Step 3: Drop the `ALL_PARTS` import if now unused**

Search the file for any remaining use of `ALL_PARTS`:

Run: `grep -n "ALL_PARTS" apps/wiki/src/components/builder/Builder.jsx`
Expected: no matches. If there are none, remove `ALL_PARTS` from the `builderCore` import added/edited in Task 2 (leaving `PARTS`). If there are still uses, leave the import.

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds, no "unused variable" lint error for `ALL_PARTS`.

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/components/builder/Builder.jsx
git commit -m "feat(builder): hide out-of-game parts from the parts locker"
```

---

### Task 4: Brand label beside the switch reads "Trampler Builder"

**Files:**
- Modify: `apps/wiki/src/components/gallery/GalleryClient.tsx:185`

- [ ] **Step 1: Change the title prop**

Change `apps/wiki/src/components/gallery/GalleryClient.tsx:185` from:

```tsx
          <ToolNavBrand title="Gallery" />
```

to:

```tsx
          <ToolNavBrand title="Trampler Builder" />
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/wiki/src/components/gallery/GalleryClient.tsx
git commit -m "fix(gallery): brand label reads 'Trampler Builder' beside the switch"
```

---

### Task 5: Side-isometric thumbnail capture angle

**Files:**
- Modify: `apps/wiki/src/components/builder/BuilderScene.jsx:466`

- [ ] **Step 1: Change the capture direction vector**

In the fixed-angle capture (`BuilderScene.jsx:466`), change:

```js
        const dir = new THREE.Vector3(1, 0.8, 1).normalize() // identical for every rig
```

to:

```js
        // Side-biased isometric: mostly the rig's side face with a slight top/front
        // tilt for depth. Identical for every rig so gallery thumbnails stay consistent.
        const dir = new THREE.Vector3(1.4, 0.5, 0.6).normalize()
```

(Only affects newly captured / republished thumbnails; existing stored thumbnails keep the old angle — this is intended.)

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/wiki/src/components/builder/BuilderScene.jsx
git commit -m "feat(builder): capture gallery thumbnails from a side-isometric angle"
```

---

### Task 6: Gallery list query carries `buildCode`

**Files:**
- Modify: `apps/wiki/src/lib/designs.ts` (`DesignListItem` type at lines 49-61; `listDesigns` `select` at lines 128-141; items map at lines 144-156)

- [ ] **Step 1: Add `buildCode` to the list item type**

In `DesignListItem` (`designs.ts:49-61`), add the field (place it after `slug`):

```ts
export type DesignListItem = {
  slug: string;
  buildCode: string;
  name: string;
  authorName: string | null;
  chassisId: string;
  partCount: number;
  crowns: number;
  hull: number;
  thumbPath: string | null;
  likeCount: number;
  createdAt: Date;
  status: string;
};
```

- [ ] **Step 2: Select `buildCode` in the list query**

In `listDesigns`'s `select` (`designs.ts:128-141`), update the leading comment and add `buildCode: true`. Replace:

```ts
    // Explicit select — never pull the `thumbnail` bytes (or buildCode) into a
    // list query; the grid only needs the thumbPath URL.
    select: {
      id: true,
      slug: true,
      name: true,
```

with:

```ts
    // Explicit select — never pull the (large) `thumbnail` bytes into a list
    // query. `buildCode` IS pulled now: the gallery cards compute the full build
    // cost from it and hand it off to the builder ("open design"). Build codes
    // are a few KB each, so a page of 24 stays small.
    select: {
      id: true,
      slug: true,
      buildCode: true,
      name: true,
```

- [ ] **Step 3: Map `buildCode` into the returned items**

In the items map (`designs.ts:144-156`), add `buildCode`:

```ts
  const items: DesignListItem[] = rows.slice(0, PAGE).map((d) => ({
    slug: d.slug,
    buildCode: d.buildCode,
    name: d.name,
    authorName: d.author?.personaName ?? null,
    chassisId: d.chassisId,
    partCount: d.partCount,
    crowns: d.crowns,
    hull: d.hull,
    thumbPath: d.thumbPath,
    likeCount: d.likeCount,
    createdAt: d.createdAt,
    status: d.status,
  }));
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds (type now includes `buildCode`; `GalleryClient`'s `Item` type is updated in Task 10 — until then the build still passes because the client type is structurally a subset that ignores extra fields at the fetch boundary; if the build flags it, proceed to Task 10).

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/lib/designs.ts
git commit -m "feat(gallery): include buildCode in the designs list payload"
```

---

### Task 7: Remove the report feature (keep the DB table)

**Files:**
- Delete: `apps/wiki/src/app/api/designs/[slug]/report/route.ts`
- Modify: `apps/wiki/src/lib/designs.ts` (remove `reportDesign`, lines 231-244)

Do NOT touch `apps/wiki/prisma/schema.prisma` — the `DesignReport` model and table stay (no migration).

- [ ] **Step 1: Confirm nothing else imports `reportDesign`**

Run: `grep -rn "reportDesign" apps/wiki/src`
Expected: matches only in `apps/wiki/src/lib/designs.ts` (definition) and `apps/wiki/src/app/api/designs/[slug]/report/route.ts` (the route being deleted). If any other file imports it, stop and reassess.

- [ ] **Step 2: Delete the report API route**

```bash
git rm apps/wiki/src/app/api/designs/[slug]/report/route.ts
```

- [ ] **Step 3: Remove the `reportDesign` function**

In `apps/wiki/src/lib/designs.ts`, delete the entire `reportDesign` function (lines 231-244, the block starting `export async function reportDesign(` through its closing `}`).

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds (no dangling import of the deleted route or function).

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/lib/designs.ts
git commit -m "feat(gallery): remove report feature (keep DesignReport table)"
```

---

### Task 8: Delete the dead `gallery/[slug]` detail page

**Files:**
- Delete: `apps/wiki/src/app/gallery/[slug]/page.tsx` (and the `[slug]` directory)
- Delete: `apps/wiki/src/components/gallery/DesignActions.tsx`

- [ ] **Step 1: Confirm `DesignActions` is only used by the detail page**

Run: `grep -rn "DesignActions" apps/wiki/src`
Expected: matches only in `apps/wiki/src/components/gallery/DesignActions.tsx` (definition) and `apps/wiki/src/app/gallery/[slug]/page.tsx` (the page being deleted). If used elsewhere, stop and reassess.

- [ ] **Step 2: Delete the page and the component**

```bash
git rm apps/wiki/src/app/gallery/[slug]/page.tsx
git rm apps/wiki/src/components/gallery/DesignActions.tsx
```

(If the `[slug]` directory has no other files, `git rm` of the page leaves it empty and git drops it.)

- [ ] **Step 3: Confirm no remaining links to `/gallery/[slug]`**

Run: `grep -rn "gallery/\${" apps/wiki/src`
Expected: matches only the three card links in `apps/wiki/src/components/gallery/GalleryClient.tsx` (thumb, name, and ↗), which are rewritten in Task 10. (The `SteamGateModal` uses a literal `returnTo="/gallery"`, so it won't match.) No other file should point at a design detail URL.

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds (the `GalleryClient` still references `/gallery/${slug}` links — that's fine; it compiles. They are rewritten in Task 10).

- [ ] **Step 5: Commit**

```bash
git add -A apps/wiki/src/app/gallery apps/wiki/src/components/gallery
git commit -m "feat(gallery): delete unused design detail page + DesignActions"
```

---

### Task 9: `AdminHideButton` supports an `onHidden` callback

**Files:**
- Modify: `apps/wiki/src/components/gallery/AdminHideButton.tsx`

- [ ] **Step 1: Add the optional callback prop**

Change the component signature and the success branch so that, when an `onHidden` callback is supplied, it is called instead of redirecting. Replace the props line:

```tsx
export function AdminHideButton({ slug }: { slug: string }) {
```

with:

```tsx
export function AdminHideButton({
  slug,
  onHidden,
}: {
  slug: string;
  onHidden?: () => void;
}) {
```

- [ ] **Step 2: Use the callback on success**

In `handleConfirm`, replace the success branch:

```tsx
      if (res.ok) {
        location.assign("/gallery");
      } else {
```

with:

```tsx
      if (res.ok) {
        // On the gallery grid we drop the card in place via the callback; the
        // standalone use (no callback) falls back to a full navigation.
        if (onHidden) onHidden();
        else location.assign("/gallery");
      } else {
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/wiki/src/components/gallery/AdminHideButton.tsx
git commit -m "feat(gallery): AdminHideButton supports an onHidden callback"
```

---

### Task 10: Gallery cards — full cost, open-in-builder, admin hide

**Files:**
- Modify: `apps/wiki/src/app/gallery/page.tsx` (pass `admin`)
- Modify: `apps/wiki/src/components/gallery/GalleryClient.tsx` (props, `Item` type, imports, card body)

- [ ] **Step 1: Pass `admin` from the server page**

In `apps/wiki/src/app/gallery/page.tsx`, import `sessionIsAdmin` and pass the flag. Change the import line:

```tsx
import { getSession } from "@/lib/auth";
```

to:

```tsx
import { getSession, sessionIsAdmin } from "@/lib/auth";
```

Then compute it (after `const signedIn = !!session;`, near line 22):

```tsx
  const signedIn = !!session;
  const admin = await sessionIsAdmin();
```

And pass it to the client (in the `<GalleryClient .../>` JSX, lines 31-37):

```tsx
  return (
    <GalleryClient
      initial={initial}
      signedIn={signedIn}
      admin={admin}
      initialView={initialView}
    />
  );
```

- [ ] **Step 2: Update `GalleryClient` imports, `Item` type, and props**

In `apps/wiki/src/components/gallery/GalleryClient.tsx`:

Add imports near the top (after the existing imports, lines 1-8):

```tsx
import { AdminHideButton } from "@/components/gallery/AdminHideButton";
import { costBreakdown, COST_ROWS, decodeShare } from "@/components/builder/builderCore.js";
```

Add `buildCode` to the `Item` type (lines 10-21):

```tsx
type Item = {
  slug: string;
  buildCode: string;
  name: string;
  authorName: string | null;
  chassisId: string;
  partCount: number;
  crowns: number;
  hull: number;
  thumbPath: string | null;
  likeCount: number;
  status?: string;
};
```

Add `admin` to the component props (lines 39-47):

```tsx
export function GalleryClient({
  initial,
  signedIn,
  admin = false,
  initialView = "community",
}: {
  initial: Page;
  signedIn: boolean;
  admin?: boolean;
  initialView?: View;
}) {
```

- [ ] **Step 3: Add the open-in-builder handoff and the hide helper**

Inside the component body (e.g. just after the `like` function, before `const showDraft = ...` at line 178), add:

```tsx
  // "Open design" hands the build off to the builder via the localStorage key the
  // builder reads on mount (sand_load_code). The <Link href="/builder"> then does
  // the client navigation. Set synchronously in the click handler before nav.
  function loadInBuilder(buildCode: string) {
    try {
      localStorage.setItem("sand_load_code", buildCode);
    } catch {
      /* ignore storage failures — the builder just starts empty */
    }
  }

  // Admin hide: drop the card from the current page immediately (the server has
  // already set status="hidden"); a reload would have dropped it from the list too.
  function hideFromList(slug: string) {
    setPage((p) => ({ ...p, items: p.items.filter((it) => it.slug !== slug) }));
  }

  // Full per-card cost, computed from the build code. Falls back to the stored
  // crowns total if a code somehow fails to decode.
  function cardCost(d: Item): Record<string, number> {
    try {
      return costBreakdown(decodeShare(d.buildCode));
    } catch {
      return { crowns: d.crowns, mechanical: 0, pneumatic: 0, computing: 0 };
    }
  }
```

- [ ] **Step 4: Rewrite the card body (thumb link, meta, footer)**

Replace the published-design card block (`GalleryClient.tsx:278-341`, the `{page.items.map((d) => { ... })}` block) with:

```tsx
          {page.items.map((d) => {
            const isLiked = liked.has(d.slug);
            const cost = cardCost(d);
            return (
              <div className="tg-card" key={d.slug}>
                <Link
                  href="/builder"
                  onClick={() => loadInBuilder(d.buildCode)}
                  className="tg-thumb"
                  title="Open in builder"
                  style={{ "--thumb": THUMB } as React.CSSProperties}
                >
                  {d.thumbPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.thumbPath}
                      alt={d.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <ThumbPlaceholder />
                  )}
                  <span className="tg-hull-badge">Hull {d.hull}</span>
                </Link>
                <div className="tg-body">
                  <Link
                    href="/builder"
                    onClick={() => loadInBuilder(d.buildCode)}
                    className="tg-name"
                  >
                    {d.name}
                  </Link>
                  <div className="tg-sub">{d.authorName ?? "Unknown"}</div>
                  <div className="tg-meta">
                    <span className="m">
                      <b>{d.partCount}</b> parts
                    </span>
                    {COST_ROWS.map(([key, label, icon]: [string, string, string]) => (
                      <span className="m" key={key} title={label}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={icon}
                          alt=""
                          width={14}
                          height={14}
                          style={{ objectFit: "contain" }}
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                          }}
                        />
                        <b>{(cost[key] ?? 0).toLocaleString()}</b>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="tg-foot">
                  <button
                    type="button"
                    className={`tg-vote${isLiked ? " liked" : ""}${signedIn ? "" : " locked"}`}
                    onClick={() => like(d.slug)}
                    title={signedIn ? "Like" : "Sign in with Steam to like"}
                    aria-label={isLiked ? "Unlike" : "Like"}
                    aria-pressed={isLiked}
                  >
                    <span className="up" aria-hidden="true">
                      ▲
                    </span>
                    <span className="score">{d.likeCount.toLocaleString()}</span>
                  </button>
                  <div className="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {admin && (
                      <AdminHideButton slug={d.slug} onHidden={() => hideFromList(d.slug)} />
                    )}
                    <Link
                      href="/builder"
                      onClick={() => loadInBuilder(d.buildCode)}
                      className="tg-icon-btn"
                      title="Open in builder"
                      aria-label={`Open ${d.name} in the builder`}
                    >
                      ↗
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
```

- [ ] **Step 5: Verify it builds and unit tests pass**

Run: `npm run build`
Expected: build succeeds. (`builderCore.js` is imported into a client component; that's fine — it's already client-safe and used by the builder client.)
Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/wiki/src/app/gallery/page.tsx apps/wiki/src/components/gallery/GalleryClient.tsx
git commit -m "feat(gallery): full cost on cards, open-in-builder, admin hide"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run: `npm test`
Expected: PASS (includes the new `costBreakdown` test).

- [ ] **Step 2: Production build (typecheck + lint gate)**

Run: `npm run build`
Expected: build succeeds. Note (per project memory): the wiki lint/e2e baseline is partly RED pre-existing — pre-existing red is not a regression from this change. Compare against `master` if unsure.

- [ ] **Step 3: Manual smoke test (dev server)**

Run: `npm run dev` (a dev server is often already on :3000). Then verify in the browser:
  - **Locker:** Builder → Parts Locker lists no "NOT IN GAME" / disabled parts.
  - **Brand:** Gallery top bar reads "Trampler Builder" beside the Builder/Gallery switch; the switch still toggles between the two.
  - **Cost on cards:** each gallery card shows parts count plus four cost rows (Crowns, Mechanical, Pneumatic, Computing) each with its icon.
  - **Open in builder:** clicking a card's thumbnail, name, or ↗ opens `/builder` with that rig loaded.
  - **No detail page:** navigating to `/gallery/<any-slug>` 404s (route deleted).
  - **Report gone:** there is no Report control anywhere in the gallery.
  - **Admin hide:** signed in as an admin (a steamId in `ADMIN_STEAM_IDS`), each community card shows a Hide control; confirming it removes the card and the design no longer appears in the community list. Non-admins see no Hide control.

- [ ] **Step 4: Final commit (only if Step 3 surfaced fixes)**

If any manual fix was needed, commit it with a descriptive message. Otherwise this task adds no commit.

---

## Notes for the implementer

- Run all `npm`/`grep` commands from `apps/wiki/`.
- The build requires no database (static `@sandlabs/data`); do **not** run any `db:seed` / `db:reset` / migration commands as part of this work.
- `builderCore.js` is plain JS imported by both server (`designs.ts`) and client (`Builder.jsx`, now `GalleryClient.tsx`); keep the new helper pure (no DOM, no `window`).
- Do not modify `prisma/schema.prisma` — the `DesignReport` table is intentionally retained.
