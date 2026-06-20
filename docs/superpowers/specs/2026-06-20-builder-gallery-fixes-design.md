# Builder Gallery fixes — design

Date: 2026-06-20
Status: approved (brainstorm) → ready for implementation plan

## Context

The Trampler Builder (`apps/wiki/src/components/builder/`) and its community
Gallery (`apps/wiki/src/components/gallery/`, `apps/wiki/src/app/gallery/`)
have accumulated a set of rough edges. This change set fixes eight of them in
one pass. Designs are saved tramplers (the `Design` Prisma model); a build is
serialized as a `SANDBP2.<base64>` `buildCode`.

Key existing pieces:
- `Design` model: `buildCode`, `chassisId`, `partCount`, `crowns`, `hull`,
  `thumbPath`, `thumbnail` (in-DB webp bytes), `status` ("published" | "hidden"),
  `likeCount`. (`apps/wiki/prisma/schema.prisma`)
- `listDesigns()` / `DesignListItem` deliberately exclude `buildCode` and the
  thumbnail bytes from the grid query. (`apps/wiki/src/lib/designs.ts`)
- The builder consumes `localStorage.sand_load_code` on mount to load a build
  handed off from elsewhere. (`apps/wiki/src/components/builder/Builder.jsx` ~L164)
- `buildSummary(state)` is the shared source of truth for crowns/partCount/hull.
  The builder's `cost` memo computes the full 4-resource breakdown locally
  (`Builder.jsx` ~L177).
- Admin status = allowlist check (`isAdmin` / `sessionIsAdmin`, `apps/wiki/src/lib/auth.ts`).

## Goals (the eight changes)

### 1. Parts locker never shows out-of-game parts
`lockerParts` (`Builder.jsx:31`) is sourced from `ALL_PARTS` (enabled + disabled),
listing disabled parts with a "NOT IN GAME" tag, enabled-first.

- Source from enabled-only: `ALL_PARTS.filter((p) => p.enabled !== false)`
  (or `PARTS` minus chassis/mirror — pick whichever keeps the existing
  chassis/`_mirror` exclusions).
- Remove the now-dead enabled-first `.sort`, the `NOT IN GAME` `<span class="tb-part-tag">`,
  the `disabled` className, and the `p.enabled === false` tooltip branch
  (`Builder.jsx:501-519`).

### 2. Title beside the switch → "Trampler Builder"
`GalleryClient.tsx:185` passes `<ToolNavBrand title="Gallery" />`. Change to
`title="Trampler Builder"`. The Builder/Gallery `ToolNav` segmented switch is
unchanged. (The builder page already uses "Trampler Builder"; the tech tree
keeps "Tech Tree".)

### 3. Remove the report feature (keep the DB table)
- Delete `apps/wiki/src/app/api/designs/[slug]/report/route.ts`.
- Delete `reportDesign()` from `apps/wiki/src/lib/designs.ts`.
- The report UI lives only in `DesignActions.tsx`, which is removed with the
  detail page (change 4).
- Keep the `DesignReport` model + table in `schema.prisma` — no migration. This
  makes re-adding the feature trivial and avoids a destructive DB change.

### 4. Delete the `gallery/[slug]` detail page
- Remove `apps/wiki/src/app/gallery/[slug]/` (the `page.tsx`).
- Remove `apps/wiki/src/components/gallery/DesignActions.tsx` (only used by that page).
- Keep the thumbnail route (`/api/designs/[slug]/thumb`) — cards still load
  `thumbPath` images.
- Keep `GET /api/designs/[slug]` (harmless; low risk). Not required by the gallery
  after this change.
- Verify no remaining links point to `/gallery/[slug]` (grep).

### 5. Gallery cards show the full cost with icons
Cards currently show parts count + crowns only. Show the full 4-resource cost
(Crowns / Mechanical Parts / Pneumatic Parts / Computing Module) each with its
`/icons/...` icon.

Sourcing (decided: compute client-side from `buildCode`):
- Add `buildCode` to `DesignListItem` and the `listDesigns` `select`. Add a
  comment noting this deliberately reverses the prior "never pull buildCode into
  the list" optimization, because the gallery now needs it for both cost display
  and open-in-builder. (Thumbnail bytes stay excluded.)
- Extract a shared, pure `costBreakdown(state)` helper into `builderCore.js`
  returning `{ crowns, mechanical, pneumatic, computing }`, and export the
  `COST_ROWS` icon table (currently local to `Builder.jsx:48`) from `builderCore.js`.
- Refactor the builder's `cost` memo (`Builder.jsx:177`) to use `costBreakdown`.
- In `GalleryClient`, per card: `decodeShare(d.buildCode)` → `costBreakdown` →
  render the four `COST_ROWS` (icon + localized value). Keep the parts count.
  On decode failure, fall back to the stored `d.crowns` (crowns row only).
- Note: importing `builderCore` into the gallery client bundle pulls in the part
  data JSON (`part_costs.json` etc.). Acceptable; flagged.

### 6. "Open design" opens directly in the builder
The card's thumbnail, name, and ↗ button currently link to `/gallery/[slug]`.
Replace with a single open-in-builder action:
`localStorage.setItem('sand_load_code', d.buildCode)` then navigate to `/builder`
(client navigation). The builder's existing `sand_load_code` handoff loads it on
mount. No per-click API fetch needed (buildCode is already in the list payload
from change 5).

### 7. Admin hide button visible on gallery cards
- Pass `admin` (from `sessionIsAdmin()`) from `apps/wiki/src/app/gallery/page.tsx`
  into `GalleryClient`.
- On each card, when `admin`, render a Hide control. Reuse `AdminHideButton`
  (+ its `ConfirmDialog`), adapted to take an optional `onHidden` callback: when
  provided, call it (to optimistically drop the card from the list) instead of
  `location.assign("/gallery")`.
- The control calls `DELETE /api/designs/[slug]`, which already sets
  `status="hidden"` for a non-owner admin. (Owner-admin path hard-deletes per the
  existing route — unchanged; matches prior detail-page behavior.)

### 8. Thumbnail view → side-biased isometric
In `BuilderScene.jsx`'s capture (~L466), change the camera direction from
`new THREE.Vector3(1, 0.8, 1)` to `new THREE.Vector3(1.4, 0.5, 0.6)` (normalized).
Only affects newly captured / republished thumbnails; existing stored thumbnails
keep the old angle (decided — no regen pass).

## Non-goals
- No regeneration of existing thumbnails.
- No removal of the `DesignReport` table or any migration.
- No change to the like feature, publish flow, or thumbnail storage mechanism.

## Testing & verification
- Unit-test the pure `costBreakdown(state)` helper.
- Manual verification via the dev server (already commonly on :3000):
  - Locker no longer lists any disabled / "NOT IN GAME" parts.
  - Brand label beside the switch reads "Trampler Builder" on the gallery.
  - Gallery cards render four cost rows with icons; bad buildCode falls back to crowns.
  - Clicking a card (thumb/name/↗) opens that rig in the builder.
  - As an admin, the Hide control appears on cards and drops the card on confirm;
    the design no longer appears in the community list.
  - No route exists at `/gallery/<slug>`; no dead links to it remain.
- Note (per project memory): the wiki lint/e2e baseline is partly RED
  pre-existing; red there is not necessarily a regression from this change.
