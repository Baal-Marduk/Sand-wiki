# Share-link View Mode + Delete-replaces-Hide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shareable, desktop-gated view-mode page at `/builder/<slug>` (read-only 3D, upvote, edit-clone, share link, delete) with Discord OG unfurl, surface copy-link controls on every gallery card and after publish, and convert admin "hide" into owner/admin "delete" while removing the `Design.status` mechanism entirely.

**Architecture:** A new server route `/builder/[slug]` fetches a published `Design` and renders a desktop-gated, dynamically-imported `BuilderView` (read-only) that reuses the existing `BuilderScene` (with a new `readOnly` prop) and the shared `builderCore` stat helpers. Share links are slug-based absolute URLs built by a pure `designShareUrl` helper. The `status`/"hidden" feature is replaced by hard-delete for owners and admins, with a Prisma migration dropping the column.

**Tech Stack:** Next.js 16 (App Router, `generateMetadata`), React 19, Prisma 6, three.js, Vitest. Run all `npm`/`grep`/`prisma` commands from `apps/wiki/`. The build needs no database.

---

## File structure

- **Create** `apps/wiki/src/lib/share.ts` (+ `share.test.ts`) — pure `designShareUrl(slug, origin)`.
- **Create** `apps/wiki/src/app/builder/[slug]/page.tsx` — view route server component + `generateMetadata`.
- **Create** `apps/wiki/src/components/builder/BuilderViewClient.tsx` — desktop gate + dynamic import.
- **Create** `apps/wiki/src/components/builder/BuilderView.jsx` — read-only view UI (scene + stats + actions).
- **Create** `apps/wiki/src/components/gallery/UpvoteButton.tsx` — like island for the view page.
- **Create** `apps/wiki/src/components/gallery/DeleteDesignButton.tsx` — delete button (replaces AdminHideButton).
- **Create** `apps/wiki/prisma/migrations/20260621120000_remove_design_status/migration.sql`.
- **Modify** `apps/wiki/src/components/builder/BuilderScene.jsx` — `readOnly` prop.
- **Modify** `apps/wiki/src/lib/designs.ts` — remove `status`, add `isMine`, drop `setDesignStatus`.
- **Modify** `apps/wiki/src/app/api/designs/route.ts` — pass `viewerId` in both views.
- **Modify** `apps/wiki/src/app/api/designs/[slug]/route.ts` — delete for owner|admin; remove hidden checks.
- **Modify** `apps/wiki/src/app/api/designs/[slug]/thumb/route.ts` — remove status check.
- **Modify** `apps/wiki/prisma/schema.prisma` — drop `status`, rebuild indexes.
- **Modify** `apps/wiki/src/components/gallery/GalleryClient.tsx` — `isMine`, DeleteDesignButton, copy-link control.
- **Modify** `apps/wiki/src/components/builder/Builder.jsx` — publish-success copies share link.
- **Delete** `apps/wiki/src/components/gallery/AdminHideButton.tsx`.

---

### Task 1: `designShareUrl` helper

**Files:**
- Create: `apps/wiki/src/lib/share.ts`
- Test: `apps/wiki/src/lib/share.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/wiki/src/lib/share.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { designShareUrl } from "@/lib/share";

describe("designShareUrl", () => {
  it("joins origin and slug into the /builder/<slug> path", () => {
    expect(designShareUrl("rustgut-ab12cd", "https://x.test")).toBe(
      "https://x.test/builder/rustgut-ab12cd",
    );
  });
  it("strips trailing slashes from the origin", () => {
    expect(designShareUrl("a", "https://x.test/")).toBe("https://x.test/builder/a");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- share`
Expected: FAIL — cannot resolve `@/lib/share` / `designShareUrl` undefined.

- [ ] **Step 3: Implement**

Create `apps/wiki/src/lib/share.ts`:

```ts
// Builds the absolute, shareable URL for a published design's view page.
// `origin` is e.g. "https://sandhelp.example" (server) or window.location.origin
// (client). Trailing slashes on the origin are trimmed so the path joins cleanly.
export function designShareUrl(slug: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/builder/${slug}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- share`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/lib/share.ts apps/wiki/src/lib/share.test.ts
git commit -m "feat(share): add designShareUrl helper"
```

---

### Task 2: `designs.ts` — remove status, add `isMine`, drop `setDesignStatus`

**Files:**
- Modify: `apps/wiki/src/lib/designs.ts`

- [ ] **Step 1: Update `DesignListItem` — drop `status`, add `isMine`**

In `apps/wiki/src/lib/designs.ts`, change the `DesignListItem` type (the block currently containing `status: string;`) to:

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
  isMine: boolean;
};
```

- [ ] **Step 2: Update `listDesigns` — community = all, select authorId, compute `isMine`, drop `status`**

In `listDesigns`, change the `where` so community returns all designs:

```ts
  const where =
    opts.view === "mine"
      ? { authorId: opts.viewerId ?? "__none__" }
      : {};
```

In its `select`, remove `status: true` and add `authorId: true` (keep everything else, including `buildCode: true`):

```ts
    select: {
      id: true,
      slug: true,
      buildCode: true,
      name: true,
      authorId: true,
      chassisId: true,
      partCount: true,
      crowns: true,
      hull: true,
      thumbPath: true,
      likeCount: true,
      createdAt: true,
      author: { select: { personaName: true } },
    },
```

In the items map, remove `status: d.status,` and add the computed `isMine` (authorId never leaves the server — only the boolean does):

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
    isMine: !!opts.viewerId && d.authorId === opts.viewerId,
  }));
```

- [ ] **Step 3: Drop `status` from `createDesign` and `getDesign`**

In `createDesign`'s `prisma.design.create({ data: { ... } })`, remove the line `status: "published",`.

In `getDesign`'s `select`, remove the line `status: true,` (leave `buildCode`, `authorId`, `author`, etc.).

- [ ] **Step 4: Remove the now-dead `setDesignStatus`**

Delete the entire `setDesignStatus` function (the `export async function setDesignStatus(slug, status) { ... }` block). Leave `deleteDesign`, `likeDesign`, `unlikeDesign`, `hasLiked`, `getDesign`, `createDesign`, `listDesigns`, `validateBuildCode`, `slugifyName`, `makeSlug`.

- [ ] **Step 5: Verify references are gone**

Run: `grep -n "status\|setDesignStatus" apps/wiki/src/lib/designs.ts`
Expected: no matches for `status` or `setDesignStatus`.

(Build is deferred to Task 4, after the schema + routes also drop `status`. Type errors in OTHER files at this point are expected and resolved by Tasks 3-4.)

- [ ] **Step 6: Commit**

```bash
git add apps/wiki/src/lib/designs.ts
git commit -m "feat(designs): drop status, add isMine to list items, remove setDesignStatus"
```

---

### Task 3: API routes — pass viewerId both views; delete for owner|admin; remove hidden/status checks

**Files:**
- Modify: `apps/wiki/src/app/api/designs/route.ts`
- Modify: `apps/wiki/src/app/api/designs/[slug]/route.ts`
- Modify: `apps/wiki/src/app/api/designs/[slug]/thumb/route.ts`

- [ ] **Step 1: List route — provide `viewerId` for both views (so `isMine` works in community)**

In `apps/wiki/src/app/api/designs/route.ts`, replace the GET body's view/session handling:

```ts
  let viewerId: string | null = null;
  if (view === "mine") {
    const session = await getSession();
    if (!session) return NextResponse.json({ items: [], nextCursor: null });
    viewerId = session.steamId;
  }
  const data = await listDesigns({ view, sort, cursor, viewerId });
```

with:

```ts
  const session = await getSession();
  // "mine" requires a session; both views pass viewerId so each item's `isMine`
  // (owner-only delete control) can be computed.
  if (view === "mine" && !session) {
    return NextResponse.json({ items: [], nextCursor: null });
  }
  const viewerId = session?.steamId ?? null;
  const data = await listDesigns({ view, sort, cursor, viewerId });
```

- [ ] **Step 2: `[slug]/route.ts` — delete for owner|admin; remove hidden checks**

In `apps/wiki/src/app/api/designs/[slug]/route.ts`:

Update the import to drop `setDesignStatus`:

```ts
import { getDesign, deleteDesign } from "@/lib/designs";
```

In GET, change the not-found check to drop the status branch:

```ts
  const d = await getDesign(slug);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ design: d });
```

In PATCH, change the not-found check the same way (remove `|| d.status === "hidden"`):

```ts
  const d = await getDesign(slug);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (d.author.steamId !== session.steamId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
```

Replace the entire DELETE handler body's permission/action block:

```ts
  const owner = d.author.steamId === session.steamId;
  const admin = isAdmin(session.steamId);
  if (!owner && !admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Admins "hide"; owners hard-delete their own.
  if (owner) await deleteDesign(slug);
  else await setDesignStatus(slug, "hidden");
  return NextResponse.json({ ok: true });
```

with (owner OR admin hard-deletes):

```ts
  const owner = d.author.steamId === session.steamId;
  const admin = isAdmin(session.steamId);
  if (!owner && !admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Owner or admin: hard-delete (the old admin-only "hide" path is gone).
  await deleteDesign(slug);
  return NextResponse.json({ ok: true });
```

- [ ] **Step 3: `thumb/route.ts` — remove status check**

In `apps/wiki/src/app/api/designs/[slug]/thumb/route.ts`, change the query + guard:

```ts
  const d = await prisma.design.findUnique({
    where: { slug },
    select: { thumbnail: true },
  });
  // Missing design or no stored thumbnail → 404.
  if (!d || !d.thumbnail) {
    return new NextResponse("not found", { status: 404 });
  }
```

- [ ] **Step 4: Verify no `status` refs remain in these routes**

Run: `grep -rn "status\|setDesignStatus" apps/wiki/src/app/api/designs`
Expected: no matches (other than possibly HTTP `status:` codes in `NextResponse.json(..., { status: NNN })`, which are fine — those are HTTP status, not the design field). Confirm there is no `d.status` or `setDesignStatus` reference.

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/app/api/designs
git commit -m "feat(designs-api): delete for owner|admin, drop hidden/status checks"
```

---

### Task 4: Schema — drop `Design.status`, rebuild indexes, migration

**Files:**
- Modify: `apps/wiki/prisma/schema.prisma`
- Create: `apps/wiki/prisma/migrations/20260621120000_remove_design_status/migration.sql`

- [ ] **Step 1: Edit the schema**

In `apps/wiki/prisma/schema.prisma`, in `model Design`:

Remove the line:

```prisma
  status    String    @default("published") // "published" | "hidden"
```

Change the two status-prefixed indexes:

```prisma
  @@index([status, likeCount])
  @@index([status, createdAt])
```

to:

```prisma
  @@index([likeCount])
  @@index([createdAt])
```

Leave `@@index([authorId])` and the rest of the model as-is.

- [ ] **Step 2: Hand-write the migration SQL**

Create `apps/wiki/prisma/migrations/20260621120000_remove_design_status/migration.sql`:

```sql
-- DropIndex
DROP INDEX "Design_status_likeCount_idx";

-- DropIndex
DROP INDEX "Design_status_createdAt_idx";

-- AlterTable
ALTER TABLE "Design" DROP COLUMN "status";

-- CreateIndex
CREATE INDEX "Design_likeCount_idx" ON "Design"("likeCount");

-- CreateIndex
CREATE INDEX "Design_createdAt_idx" ON "Design"("createdAt");
```

- [ ] **Step 3: Regenerate the Prisma client (no DB needed)**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" success. (Do NOT run `prisma migrate dev` or `prisma migrate reset` — per project rule, never reset/reseed; the migration is applied at deploy time with `prisma migrate deploy`.)

- [ ] **Step 4: Build + tests — the whole `status` removal must compile now**

Run: `rm -rf .next && npm run build`
Expected: build succeeds. The Prisma client no longer has `status`; Tasks 2-3 removed all references, so there are no type errors.
Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/prisma/schema.prisma apps/wiki/prisma/migrations/20260621120000_remove_design_status
git commit -m "feat(db): drop Design.status column and rebuild indexes"
```

---

### Task 5: `BuilderScene` read-only mode

**Files:**
- Modify: `apps/wiki/src/components/builder/BuilderScene.jsx`

- [ ] **Step 1: Accept and track the `readOnly` prop**

In the component signature (currently destructuring `state, level, activePart, ... captureRef`), add `readOnly`:

```jsx
export default function BuilderScene({
  state, level, activePart, activeRot, selectedId, onPlace, onSelect, onMove, onHoverInfo, onSocketToggle, captureRef, readOnly,
}) {
```

And include it in `propsRef.current` (the line that assigns `propsRef.current = { ... }`):

```jsx
  propsRef.current = { state, level, activePart, activeRot, selectedId, onPlace, onSelect, onMove, onHoverInfo, onSocketToggle, readOnly }
```

- [ ] **Step 2: Guard editing interactions in `onDown`**

In the `onDown(e)` function, immediately after the middle/right-button pan branch (the `if (e.button === 2 || e.button === 1) { ... return }` block), add a read-only short-circuit so left-drag only orbits:

```jsx
      if (P.readOnly) {
        // View mode: left-drag orbits; no placement/select/move/socket editing.
        st.drag = { mode: 'orbit', sx: e.clientX, sy: e.clientY, sx0: e.clientX, sy0: e.clientY }
        return
      }
```

(The subsequent `onMove`/`onUp` branches key off `d.mode`, which can now only be `orbit`/`pan` in read-only, so they stay inert. The `if (P.activePart)` ghost-tracking branch never fires because the view passes no `activePart`. Wheel-zoom is unaffected.)

- [ ] **Step 3: Verify the editor still builds (readOnly is optional/undefined there)**

Run: `npm run build`
Expected: build succeeds. The editor (`Builder.jsx`) passes no `readOnly`, so it's `undefined` (falsy) — behavior unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/wiki/src/components/builder/BuilderScene.jsx
git commit -m "feat(builder): BuilderScene readOnly mode (orbit/pan only)"
```

---

### Task 6: `UpvoteButton` island

**Files:**
- Create: `apps/wiki/src/components/gallery/UpvoteButton.tsx`

- [ ] **Step 1: Create the component**

Create `apps/wiki/src/components/gallery/UpvoteButton.tsx`:

```tsx
"use client";
import { useState } from "react";
import { SteamGateModal } from "@/components/SteamGateModal";

// Standalone like/upvote control (used on the design view page). Optimistic
// toggle reconciled with the server's authoritative count; Steam-gated when
// signed out. Mirrors GalleryClient's like() pattern.
export function UpvoteButton({
  slug,
  initialLikeCount,
  initialLiked,
  signedIn,
}: {
  slug: string;
  initialLikeCount: number;
  initialLiked: boolean;
  signedIn: boolean;
}) {
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [liked, setLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  async function toggle() {
    if (!signedIn) {
      setGateOpen(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    const wasLiked = liked;
    const method = wasLiked ? "DELETE" : "POST";
    setLiked(!wasLiked);
    setLikeCount((n) => Math.max(0, n + (wasLiked ? -1 : 1)));
    try {
      const res = await fetch(`/api/designs/${slug}/like`, { method });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.likeCount === "number") setLikeCount(data.likeCount);
      } else {
        setLiked(wasLiked);
        setLikeCount((n) => Math.max(0, n + (wasLiked ? 1 : -1)));
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount((n) => Math.max(0, n + (wasLiked ? 1 : -1)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`tg-vote${liked ? " liked" : ""}${signedIn ? "" : " locked"}`}
        onClick={toggle}
        aria-pressed={liked}
        aria-label={liked ? "Remove upvote" : "Upvote"}
        title={signedIn ? "Upvote" : "Sign in with Steam to upvote"}
      >
        <span className="up" aria-hidden="true">
          ▲
        </span>
        <span className="score">{likeCount.toLocaleString()}</span>
      </button>
      <SteamGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        returnTo={`/builder/${slug}`}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds (unused-but-exported component is fine; wired up in Task 8).

- [ ] **Step 3: Commit**

```bash
git add apps/wiki/src/components/gallery/UpvoteButton.tsx
git commit -m "feat(gallery): UpvoteButton island for the design view page"
```

---

### Task 7: `DeleteDesignButton` (replaces `AdminHideButton`); rewire GalleryClient + copy-link

**Files:**
- Create: `apps/wiki/src/components/gallery/DeleteDesignButton.tsx`
- Delete: `apps/wiki/src/components/gallery/AdminHideButton.tsx`
- Modify: `apps/wiki/src/components/gallery/GalleryClient.tsx`

- [ ] **Step 1: Create `DeleteDesignButton`**

Create `apps/wiki/src/components/gallery/DeleteDesignButton.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Delete a design (owner or admin). Calls DELETE /api/designs/[slug], which
// hard-deletes for an owner or admin. On the gallery grid we drop the card in
// place via onDeleted; standalone (no callback) navigates to the gallery.
export function DeleteDesignButton({
  slug,
  onDeleted,
}: {
  slug: string;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/designs/${slug}`, { method: "DELETE" });
      if (res.ok) {
        if (onDeleted) onDeleted();
        else location.assign("/gallery");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(`Failed to delete: ${data.error ?? res.status}`);
        setBusy(false);
      }
    } catch {
      setError("Network error — could not delete.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={busy}
        aria-label="Delete this design"
      >
        {busy ? "Deleting…" : "Delete"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this design?"
        description="This permanently removes it from the gallery. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirm}
      />
    </>
  );
}
```

- [ ] **Step 2: Delete `AdminHideButton`**

```bash
git rm apps/wiki/src/components/gallery/AdminHideButton.tsx
```

- [ ] **Step 3: Update `GalleryClient` imports**

In `apps/wiki/src/components/gallery/GalleryClient.tsx`, replace the `AdminHideButton` import with the new button + the share helper:

```tsx
import { DeleteDesignButton } from "@/components/gallery/DeleteDesignButton";
import { designShareUrl } from "@/lib/share";
```

(Find and remove the existing `import { AdminHideButton } ...` line.)

- [ ] **Step 4: Update the `Item` type — drop `status`, add `isMine`**

Change the `Item` type's trailing field. Replace `status?: string;` with `isMine: boolean;`:

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
  isMine: boolean;
};
```

- [ ] **Step 5: Add the copy-link state + handler; rename `hideFromList` → `removeFromList`**

Find the `hideFromList` helper (added in a prior feature) and rename it to `removeFromList` (same body — it filters the slug out of `page.items`). Then add a copy-link handler. Place this near the other helpers (e.g. just after `removeFromList`):

```tsx
  // Copy a design's share link to the clipboard; flash a per-card "copied" tick.
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  function copyShare(slug: string) {
    try {
      navigator.clipboard.writeText(designShareUrl(slug, window.location.origin));
      setCopiedSlug(slug);
      window.setTimeout(
        () => setCopiedSlug((c) => (c === slug ? null : c)),
        1500,
      );
    } catch {
      /* clipboard unavailable — no-op */
    }
  }
```

- [ ] **Step 6: Update the card footer `.right` cluster — copy-link + delete (admin OR owner)**

In the published-card map, replace the footer right cluster (the `<div className="right" ...>` block currently containing `{admin && <AdminHideButton .../>}` and the ↗ link) with:

```tsx
                  <div className="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {(admin || d.isMine) && (
                      <DeleteDesignButton slug={d.slug} onDeleted={() => removeFromList(d.slug)} />
                    )}
                    <button
                      type="button"
                      className="tg-icon-btn"
                      title={copiedSlug === d.slug ? "Link copied!" : "Copy share link"}
                      aria-label={`Copy share link for ${d.name}`}
                      onClick={() => copyShare(d.slug)}
                    >
                      {copiedSlug === d.slug ? "✓" : "🔗"}
                    </button>
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
```

(If `useState` is not already imported in this file, it is — GalleryClient already uses hooks. Leave the rest of the card, the draft card, toolbar, and SteamGateModal unchanged.)

- [ ] **Step 7: Verify**

Run: `grep -rn "AdminHideButton\|hideFromList\|\.status" apps/wiki/src/components/gallery/GalleryClient.tsx`
Expected: no matches (no `AdminHideButton`, no `hideFromList`, no `.status`).
Run: `rm -rf .next && npm run build && npm test`
Expected: build succeeds, 307+ tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/wiki/src/components/gallery/DeleteDesignButton.tsx apps/wiki/src/components/gallery/GalleryClient.tsx
git commit -m "feat(gallery): delete (owner|admin) + copy-link on every card"
```

---

### Task 8: `BuilderView` read-only UI

**Files:**
- Create: `apps/wiki/src/components/builder/BuilderView.jsx`

- [ ] **Step 1: Create the component**

Create `apps/wiki/src/components/builder/BuilderView.jsx`:

```jsx
'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ToolNavBrand } from '@/components/ToolNavBrand'
import { ToolNav } from '@/components/ToolNav'
import { AuthMenuClient } from '@/components/AuthMenuClient'
import { SteamGateModal } from '@/components/SteamGateModal'
import { Button, actionButtonClass } from '@/components/ui/button'
import { UpvoteButton } from '@/components/gallery/UpvoteButton'
import { DeleteDesignButton } from '@/components/gallery/DeleteDesignButton'
import { designShareUrl } from '@/lib/share'
import { decodeShare, manifest, buildSummary, costBreakdown, COST_ROWS } from './builderCore.js'
import BuilderScene from './BuilderScene'
import '@/components/gallery/gallery.css' // for the .tg-vote upvote styling

// Read-only view of a published trampler: orbit-only 3D + stats, with upvote,
// edit-to-clone, share-link, and (owner/admin) delete actions.
export default function BuilderView({
  buildCode, name, authorName, slug, likeCount, initialLiked, signedIn, canDelete,
}) {
  const router = useRouter()
  const [gateOpen, setGateOpen] = useState(false)
  const [flash, setFlash] = useState('')

  // Decode once. A malformed code yields null → friendly fallback.
  const state = useMemo(() => {
    try { return decodeShare(buildCode) } catch { return null }
  }, [buildCode])

  const man = useMemo(() => (state ? manifest(state) : { rows: [], total: 0 }), [state])
  const summary = useMemo(() => (state ? buildSummary(state) : null), [state])
  const cost = useMemo(() => (state ? costBreakdown(state) : { crowns: 0, mechanical: 0, pneumatic: 0, computing: 0 }), [state])

  function note(msg) {
    setFlash(msg)
    window.clearTimeout(note._t)
    note._t = window.setTimeout(() => setFlash(''), 2000)
  }

  // Edit = clone: hand the build to the editor (login required), then open it.
  function edit() {
    if (!signedIn) { setGateOpen(true); return }
    try { localStorage.setItem('sand_load_code', buildCode) } catch { /* ignore */ }
    router.push('/builder')
  }

  function share() {
    try {
      navigator.clipboard.writeText(designShareUrl(slug, window.location.origin))
      note('Link copied')
    } catch { note('Copy failed') }
  }

  return (
    <div className="tb-app" data-screen-label="Trampler Builder">
      <header className="tb-appbar">
        <ToolNavBrand title="Trampler Builder" />
        <ToolNav active="builder" />
        <span className="spacer" />
        <UpvoteButton slug={slug} initialLikeCount={likeCount} initialLiked={initialLiked} signedIn={signedIn} />
        <button type="button" className={actionButtonClass} onClick={edit}>✎ Edit</button>
        <button type="button" className={actionButtonClass} onClick={share}>⤴ {flash || 'Share'}</button>
        {canDelete && <DeleteDesignButton slug={slug} />}
        <AuthMenuClient />
      </header>

      <div className="tb-body">
        <section className="tb-viewport">
          {state ? (
            <BuilderScene
              state={state}
              level={1}
              activePart={null}
              activeRot={0}
              selectedId={null}
              readOnly
            />
          ) : (
            <div className="bld-loading">This build couldn’t be loaded.</div>
          )}
        </section>

        <aside className="tb-panel right">
          <div className="tb-panel-head">{name}</div>
          <div className="tb-section">
            <div className="tb-section-h">By</div>
            <div className="tb-mani-row"><span className="tb-mani-name">{authorName ?? 'Unknown'}</span></div>
          </div>

          {summary && (
            <div className="tb-section">
              <div className="tb-section-h">Summary</div>
              <div className="tb-mani-row"><span className="tb-mani-name">Parts</span><span className="tb-mani-qty">{summary.partCount}</span></div>
              <div className="tb-mani-row"><span className="tb-mani-name">Hull</span><span className="tb-mani-qty">{summary.hull}</span></div>
              <div className="tb-mani-row"><span className="tb-mani-name">Crew</span><span className="tb-mani-qty">{summary.crew}</span></div>
            </div>
          )}

          <div className="tb-section">
            <div className="tb-section-h">Build Cost</div>
            <div className="tb-cost">
              {COST_ROWS.map(([key, label, icon]) => (
                <div key={key} className={`tb-cost-row ${cost[key] ? '' : 'zero'}`}>
                  <img className="tb-cost-ic" src={icon} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                  <span className="tb-cost-val">{(cost[key] ?? 0).toLocaleString()}</span>
                  <span className="tb-cost-label">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {man.rows.length > 0 && (
            <div className="tb-section">
              <div className="tb-section-h">Manifest</div>
              {man.rows.map((r) => (
                <div key={r.part.id} className="tb-mani-row">
                  <span className="tb-mani-name">{r.part.name}</span>
                  <span className="tb-mani-qty">×{r.n}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      <SteamGateModal open={gateOpen} onClose={() => setGateOpen(false)} returnTo={`/builder/${slug}`} />
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds. (`BuilderView` is imported only via the dynamic import added in Task 9; an unused module still type-checks.)

- [ ] **Step 3: Commit**

```bash
git add apps/wiki/src/components/builder/BuilderView.jsx
git commit -m "feat(builder): read-only BuilderView (3D + stats + actions)"
```

---

### Task 9: `BuilderViewClient` — desktop gate + dynamic import

**Files:**
- Create: `apps/wiki/src/components/builder/BuilderViewClient.tsx`

- [ ] **Step 1: Create the component (mirrors `BuilderClient`, view-specific gate copy)**

Create `apps/wiki/src/components/builder/BuilderViewClient.tsx`:

```tsx
"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./builder.css";

// three.js can't server-render, so the viewer is loaded client-only.
const BuilderView = dynamic(() => import("./BuilderView"), {
  ssr: false,
  loading: () => <div className="bld-loading">Loading viewer…</div>,
});

// Same desktop threshold as the editor — the 3D viewer needs the room.
const MIN_WIDTH = 1024;

type Props = {
  buildCode: string;
  name: string;
  authorName: string | null;
  slug: string;
  likeCount: number;
  initialLiked: boolean;
  signedIn: boolean;
  canDelete: boolean;
};

export default function BuilderViewClient(props: Props) {
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
    return <div className="bld-loading">Loading viewer…</div>;
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
            This trampler opens in an interactive 3D viewer that needs a desktop
            or laptop. Open it on a screen at least {MIN_WIDTH}px wide.
          </p>
          <div className="bld-gate-links">
            <Link href="/gallery" className="bld-gate-btn primary">
              Browse the Gallery
            </Link>
            <Link href="/" className="bld-gate-btn ghost">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <BuilderView {...props} />;
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/wiki/src/components/builder/BuilderViewClient.tsx
git commit -m "feat(builder): BuilderViewClient desktop gate + dynamic import"
```

---

### Task 10: View route `/builder/[slug]` + Discord OG metadata

**Files:**
- Create: `apps/wiki/src/app/builder/[slug]/page.tsx`

- [ ] **Step 1: Create the server route**

Create `apps/wiki/src/app/builder/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getDesign, hasLiked } from "@/lib/designs";
import { getSession, sessionIsAdmin } from "@/lib/auth";
import BuilderViewClient from "@/components/builder/BuilderViewClient";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

async function originFromRequest(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const d = await getDesign(slug);
  if (!d) return {};
  const origin = await originFromRequest();
  const title = `${d.name} — Trampler Builder`;
  const description = `${d.partCount} parts · Hull ${d.hull} · by ${d.author?.personaName ?? "Unknown"}`;
  const images = d.thumbPath ? [`${origin}${d.thumbPath}`] : [];
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images,
      type: "website",
      url: `${origin}/builder/${slug}`,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
  };
}

export default async function DesignViewPage({ params }: Props) {
  const { slug } = await params;
  const d = await getDesign(slug);
  if (!d) notFound();

  const session = await getSession();
  const signedIn = !!session;
  const admin = await sessionIsAdmin();
  const isOwner = !!session && d.authorId === session.steamId;
  const initialLiked = session ? await hasLiked(slug, session.steamId) : false;

  return (
    <BuilderViewClient
      buildCode={d.buildCode}
      name={d.name}
      authorName={d.author?.personaName ?? null}
      slug={d.slug}
      likeCount={d.likeCount}
      initialLiked={initialLiked}
      signedIn={signedIn}
      canDelete={isOwner || admin}
    />
  );
}
```

- [ ] **Step 2: Verify build + route presence**

Run: `rm -rf .next && npm run build`
Expected: build succeeds and the route table lists `ƒ /builder/[slug]`.

- [ ] **Step 3: Commit**

```bash
git add "apps/wiki/src/app/builder/[slug]/page.tsx"
git commit -m "feat(builder): /builder/[slug] view page + Discord OG metadata"
```

---

### Task 11: Publish-success copies the share link

**Files:**
- Modify: `apps/wiki/src/components/builder/Builder.jsx`

- [ ] **Step 1: Import the share helper**

In `apps/wiki/src/components/builder/Builder.jsx`, add to the imports (near the other `@/` imports):

```jsx
import { designShareUrl } from '@/lib/share'
```

- [ ] **Step 2: Capture the new slug on publish and copy its link**

In `doPublish`, replace the success portion:

```jsx
      await submitBuild({
        name,
        buildCode: encodeShare(state),
        thumbnail: pubThumb ?? undefined,
      })
      setPubOpen(false)
      setPub({ name: '' })
      setPubThumb(null)
      flash('Published — view it in the gallery')
```

with (capture `{ slug }`, copy the link, surface it in the toast):

```jsx
      const { slug } = await submitBuild({
        name,
        buildCode: encodeShare(state),
        thumbnail: pubThumb ?? undefined,
      })
      setPubOpen(false)
      setPub({ name: '' })
      setPubThumb(null)
      try {
        await navigator.clipboard.writeText(designShareUrl(slug, window.location.origin))
        flash('Published — share link copied to clipboard')
      } catch {
        flash('Published — view it in the gallery')
      }
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/wiki/src/components/builder/Builder.jsx
git commit -m "feat(builder): copy the share link on publish success"
```

---

### Task 12: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Unit tests + clean build**

Run: `cd /d/Documents/SandLabs/apps/wiki && rm -rf .next && npm test && npm run build`
Expected: all unit tests PASS (incl. the new `share` test); build succeeds; route table shows `ƒ /builder/[slug]` and NO leftover references to a `status` field. Note (project memory): the wiki lint/e2e baseline is partly RED pre-existing — pre-existing red is not a regression.

- [ ] **Step 2: Confirm `status` is fully gone from app code**

Run: `grep -rn "setDesignStatus\|\"hidden\"\|status === " apps/wiki/src`
Expected: no matches referencing the design status field. (HTTP `status:` codes in `NextResponse.json(..., { status: NNN })` are unrelated and fine.)

- [ ] **Step 3: Manual smoke test (dev server)**

Run: `npm run dev` (often already on :3000). Grab a real published slug from the gallery, then verify:
  - **View page** `/builder/<slug>` renders the rig in 3D; left-drag orbits, wheel zooms, right/middle-drag pans; clicking does NOT place or select anything (read-only). The right panel shows name, author, summary, cost rows, and manifest.
  - **Upvote** toggles the count; signed-out clicks open the Steam gate.
  - **Edit**: signed out → Steam gate; signed in → navigates to `/builder` with the rig loaded as the working draft.
  - **Share** button copies a working `…/builder/<slug>` URL ("Link copied").
  - **Gallery cards**: every card (Community and My designs) shows the 🔗 copy-link control (✓ flash on click); Delete appears on a card you own and on any card when admin; deleting drops the card and the design 404s afterward; a non-owner non-admin gets no Delete.
  - **Publish**: publishing a build copies its new share link and the toast says so.
  - **OG tags**: `curl -s http://localhost:3000/builder/<slug> | grep -o 'og:[a-z]*'` shows `og:title`, `og:description`, `og:image` (when the design has a thumbnail).
  - **Mobile gate**: a `<1024px` viewport on the view page shows the "Bigger screen needed" gate.

- [ ] **Step 4: Final commit (only if Step 3 surfaced fixes)**

If a manual fix was needed, commit it with a descriptive message. Otherwise this task adds no commit.

---

## Notes for the implementer

- Run all `npm`/`grep`/`prisma` commands from `apps/wiki/`.
- Do NOT run `prisma migrate dev`, `prisma migrate reset`, `db:seed`, or `db:reset` — per a hard project rule the live/dev DB must never be reset or reseeded. The schema change ships as a hand-written migration applied later with `prisma migrate deploy`; `npx prisma generate` (no DB connection) is all that's needed during implementation.
- After this branch merges and deploys, the live DB needs `prisma migrate deploy` to drop the `status` column. Any designs an admin previously *hid* (status="hidden") will reappear — expected under the delete-only model.
- `builderCore.js` is plain JS imported by both server and client; keep new helpers pure.
- Follow existing styling/class conventions (`tb-*` builder classes, `tg-*` gallery classes). `BuilderView` imports `gallery.css` so the `.tg-vote` upvote button is styled.
