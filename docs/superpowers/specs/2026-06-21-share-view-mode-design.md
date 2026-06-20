# Share-link view mode + delete-replaces-hide — design

Date: 2026-06-21
Status: approved (brainstorm) → ready for implementation plan

## Context

The Trampler Builder (`apps/wiki/src/components/builder/`) and community Gallery
(`apps/wiki/src/app/gallery/`, `apps/wiki/src/components/gallery/`) let users
build, publish, like, and open tramplers. Published builds are `Design` rows
(`apps/wiki/prisma/schema.prisma`); a build serializes to a `SANDBP2.<base64>`
`buildCode`. The builder loads a handed-off build via `localStorage.sand_load_code`
on mount and persists its working draft to `localStorage.sand_blueprint_v2`.

This feature adds a **shareable view-mode page** for a published design (so a link
can be pasted in Discord and opened to view the rig in 3D, upvote it, or clone it
into your own editor), and converts the admin-only **hide** action into a **delete**
action available to owners and admins.

Decisions taken during brainstorming:
- Share links are backed by a **published design (slug)** — only published rigs are
  shareable; this is what makes upvote applicable.
- View-page route shape: **`/builder/<slug>`**.
- The view page is **desktop-gated** (`<1024px` shows a gate), same as the editor.
- The `status` ("published" | "hidden") mechanism is **removed entirely** via a
  Prisma migration (delete-only model; no more hidden state).

## Goals

### A. View-mode page `/builder/[slug]`
New server component `apps/wiki/src/app/builder/[slug]/page.tsx`:
- `getDesign(slug)`; `notFound()` if the slug doesn't exist.
- Derives `session = getSession()`, `admin = sessionIsAdmin()`,
  `isOwner = design.authorId === session?.steamId`, and `liked = hasLiked(slug, viewerId)`.
- Exports `generateMetadata({ params })` producing Open Graph tags so the link
  unfurls in Discord: `og:title` = design name, `og:description` = author +
  parts/hull summary, `og:image` = absolute URL of `/api/designs/<slug>/thumb`,
  `twitter:card` = `summary_large_image`. Absolute image URL: build from
  `NEXT_PUBLIC_SITE_URL` if set, else the request origin via `headers()`. If no
  thumbnail exists, omit `og:image` (no broken preview).
- Renders `BuilderViewClient` with the design's `buildCode`, `name`, `authorName`,
  `slug`, `likeCount`, `initialLiked`, `signedIn`, `canDelete = isOwner || admin`.

### B. `BuilderViewClient` (desktop gate + dynamic import)
New `apps/wiki/src/components/builder/BuilderViewClient.tsx`, mirroring
`BuilderClient.tsx`:
- Measures window width; `<1024px` shows a desktop-only gate (view-specific copy,
  e.g. "Open on a desktop to explore this trampler in 3D" with a link back to the
  gallery). The shared gate markup may be factored into a small `DesktopOnlyGate`
  component reused by both `BuilderClient` and `BuilderViewClient` (optional tidy;
  if it complicates, mirror the markup instead).
- `>=1024px` dynamically imports `BuilderView` with `ssr: false` (three.js is
  client-only), passing all props through.

### C. `BuilderView` (read-only view UI) — new component
New `apps/wiki/src/components/builder/BuilderView.jsx`. Does NOT reuse the full
`Builder` editor (which carries the parts locker, placement tools, publish flow).
Instead it composes the shared pieces:
- Decodes `buildCode` via `decodeShare` into state (falls back to a friendly error
  if it fails to decode).
- Renders `BuilderScene` with a new `readOnly` prop (see G), no editing callbacks.
- A read-only detail panel: design name, author, and the same stats the editor
  shows — `manifest(state)` rows + full cost via `costBreakdown(state)` / `COST_ROWS`
  + `buildSummary(state)` (partCount / hull / crew). Reuses the shared helpers so
  numbers match the editor and gallery cards.
- A top bar (reusing `ToolNavBrand` title "Trampler Builder" + the `ToolNav` switch
  + `AuthMenuClient`) and an action cluster: **Upvote**, **Edit**, **Share**, and
  **Delete** (only when `canDelete`).

### D. Actions on the view page
- **Upvote**: a small client island `UpvoteButton` (`apps/wiki/src/components/gallery/UpvoteButton.tsx`)
  reusing the like API (`POST`/`DELETE /api/designs/<slug>/like`), optimistic toggle,
  Steam-gated via `SteamGateModal` when signed out. Mirrors the gallery's existing
  like pattern.
- **Edit (clone)**: if signed out → open `SteamGateModal` (login required). If signed
  in → `localStorage.setItem('sand_load_code', buildCode)` then navigate to `/builder`.
  The build becomes the user's working draft; publishing it creates a NEW design owned
  by them (existing `createDesign` behavior — always a fresh slug + `authorId` = the
  publisher). No new server logic needed for the clone.
- **Share**: copies the page's absolute URL (`designShareUrl(slug, origin)`) to the
  clipboard and shows a brief "Link copied" flash.
- **Delete**: rendered only when `canDelete`; uses `DeleteDesignButton` (see F).

### E. Share-link entry points
A pure helper `apps/wiki/src/lib/share.ts`:
```ts
export function designShareUrl(slug: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/builder/${slug}`;
}
```
(unit-tested). Used at three entry points:
1. **View page** Share button (D).
2. **Gallery cards** — a small "Copy link" control next to the existing ↗ on EVERY
   card, in BOTH the "Community" and "My designs" (user) views. Copies
   `designShareUrl(slug, window.location.origin)` with a "Link copied" flash.
3. **After publishing** in the editor — the publish-success flash also copies the new
   design's share link (`/builder/<slug>` from the POST response's `slug`), tying
   "publish" → "share."

### F. Delete replaces Hide
- Rename `apps/wiki/src/components/gallery/AdminHideButton.tsx` →
  `DeleteDesignButton.tsx`. Keeps `ConfirmDialog`; copy becomes delete-flavored
  ("Delete this design?" / "This permanently removes it." / confirm "Delete",
  `destructive`). Props: `{ slug: string; onDeleted?: () => void }`.
- `DELETE /api/designs/[slug]` (`apps/wiki/src/app/api/designs/[slug]/route.ts`):
  permit when `owner || admin`; both paths call `deleteDesign(slug)` (hard delete).
  Remove the old `setDesignStatus(slug, "hidden")` branch. Others → 403. Remove the
  `status === "hidden"` checks from the GET/PATCH handlers in the same file.
- **Visibility**: shown when `admin || isMine`. `listDesigns` adds an `isMine: boolean`
  per item (computed server-side from the existing `viewerId` param —
  `d.authorId === viewerId`), so no steamId is leaked to the client. The gallery
  `Item`/`DesignListItem` types drop `status` and add `isMine`.
- On a gallery card, `DeleteDesignButton`'s `onDeleted` removes the card in place
  (replacing the current `AdminHideButton`/`onHidden` usage). On the view page, a
  successful delete navigates to `/gallery`.

### G. `BuilderScene` read-only mode
Add a `readOnly` prop (default false) to
`apps/wiki/src/components/builder/BuilderScene.jsx`:
- When `readOnly`, the pointer handler allows only camera orbit/pan/zoom; it skips
  the placement, select, move, and socket-toggle branches, and the editing keyboard
  shortcuts (place / rotate / delete / copy / mirror) are no-ops.
- The thumbnail-capture path is irrelevant here (view mode doesn't capture).
- The editor passes `readOnly={false}` (unchanged behavior); `BuilderView` passes
  `readOnly`.

### H. Status removal (Prisma migration)
- `schema.prisma`: remove `Design.status`; change `@@index([status, likeCount])` →
  `@@index([likeCount])` and `@@index([status, createdAt])` → `@@index([createdAt])`.
- `createDesign`: drop `status: "published"`.
- `listDesigns`: community view = all designs (no status filter); keep ordering/paging.
- `getDesign`: remove status from select/return.
- `api/designs/[slug]/thumb/route.ts`: remove the `status === "hidden"` 404 branch.
- `api/designs/[slug]/route.ts`: remove hidden checks (GET/PATCH).
- Remove `setDesignStatus` from `designs.ts` (now dead).
- Add a Prisma migration that drops the column and rebuilds the two indexes.
- **Live-DB note**: after merge, run `prisma migrate deploy` (NOT a reseed). Any rows
  previously set to `status="hidden"` by the old admin-hide become visible again —
  expected under the delete-only model.

## Non-goals
- No update-in-place editing of a published design (Edit always clones; publish
  creates a new design). Existing behavior, unchanged.
- No code-in-URL sharing of unpublished drafts (share links are slug-based only).
- The builder's existing "Share code" modal (raw SANDBP2 code copy) is unchanged.
- No mobile interactive view (desktop-gated); only the Discord unfurl preview works
  cross-device.

## File structure
- Create: `apps/wiki/src/app/builder/[slug]/page.tsx` (server + generateMetadata)
- Create: `apps/wiki/src/components/builder/BuilderViewClient.tsx` (gate + dynamic import)
- Create: `apps/wiki/src/components/builder/BuilderView.jsx` (read-only view UI)
- Create: `apps/wiki/src/components/gallery/UpvoteButton.tsx` (like island)
- Create: `apps/wiki/src/components/gallery/DeleteDesignButton.tsx` (rename of AdminHideButton)
- Create: `apps/wiki/src/lib/share.ts` + `apps/wiki/src/lib/share.test.ts`
- Modify: `apps/wiki/src/components/builder/BuilderScene.jsx` (readOnly prop)
- Modify: `apps/wiki/src/lib/designs.ts` (remove status; add isMine; drop setDesignStatus)
- Modify: `apps/wiki/prisma/schema.prisma` (+ new migration dir)
- Modify: `apps/wiki/src/app/api/designs/[slug]/route.ts` (delete owner|admin; remove hidden checks)
- Modify: `apps/wiki/src/app/api/designs/[slug]/thumb/route.ts` (remove status check)
- Modify: `apps/wiki/src/components/gallery/GalleryClient.tsx` (Item type isMine; DeleteDesignButton; copy-link control)
- Modify: `apps/wiki/src/components/builder/Builder.jsx` (publish-success copies share link)
- Optional: `apps/wiki/src/components/builder/DesktopOnlyGate.tsx` (shared gate, if clean)
- Delete: `apps/wiki/src/components/gallery/AdminHideButton.tsx`

## Testing & verification
- Unit (Vitest): `designShareUrl` (origin trailing-slash handling); the
  owner-or-admin delete permission predicate; `listDesigns` `isMine` derivation.
- Build (`npm run build`) for typecheck/lint; `npm test` for the suite.
- Dev-server smoke: `/builder/<slug>` renders the rig read-only in 3D (orbit works,
  no placement possible); upvote toggles and is Steam-gated; Edit hands off to the
  editor and requires login; Share + gallery copy-link + publish-success all copy a
  working `/builder/<slug>` URL; Delete removes the design for owner and admin and
  403s otherwise; OG tags present in the page `<head>`; `<1024px` shows the gate.
- Note (project memory): the wiki lint/e2e baseline is partly RED pre-existing — red
  there is not necessarily a regression from this change.
