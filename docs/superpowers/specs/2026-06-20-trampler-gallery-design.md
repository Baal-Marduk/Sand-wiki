# Trampler Gallery — Design Spec

**Date:** 2026-06-20
**Status:** Approved (pending spec review)
**App:** `apps/wiki` (Next.js 16, Prisma 6, Neon/Postgres), monorepo with static data in `packages/data`.
**Design reference:** `trampler-gallery.html` mockup (provided by user).

## Summary

Add a community **Trampler Gallery** where signed-in users publish builds from the Trampler
Builder, browse the community's published rigs, and upvote ("like") them. Steam authentication
already exists in the app but is only visible on the shared `SiteHeader`; this work also makes
auth visible on the full-bleed tool pages (`/builder`, `/tech`, `/gallery`) and cross-links the
Builder and Gallery.

User-content (designs, likes, reports) lives in Postgres — consistent with the repo's
"static entity JSON + Postgres-only-for-user-content" model. None of this touches the seed, so the
**never-reseed-live-DB** rule is unaffected.

## Decisions (from brainstorming)

- **Voting:** upvote-only "likes" (single toggle + total), *not* the mockup's up/down net score.
- **Persistence:** only **Published** builds are stored in the DB. **Drafts stay local** (the
  builder's existing `localStorage` working build). A build is therefore either a local **Draft**
  or a DB **Published** entry — the mockup's third "Private" state is dropped.
- **Moderation:** publish-immediately. Add a **report** action; admins can hide designs
  (`status = HIDDEN`). No pre-approval review queue.
- **Thumbnails:** captured from the builder's 3D viewport at publish time, from a **fixed canonical
  camera angle** so every rig is shot from the same isometric view. Stored as `.webp` files on the
  deploy's uploads volume (Approach A), path recorded on the row.

## Existing building blocks (reuse, do not rebuild)

- **Steam auth:** `src/lib/auth.ts` (`getUser`, `requireUser`, `isAdmin`, `getSession`),
  `SteamUser` model, JWT in `sand_session` cookie, routes `/api/auth/steam/{login,callback,logout}`,
  and the `AuthMenu` component (Steam sign-in / user dropdown).
- **Tool app-bar brand:** `src/components/ToolNavBrand.tsx` (back-arrow + SAND·HELP brand + title),
  used by `/builder` and `/tech`. Full-bleed pages are excluded from `SiteHeader`/footer via
  `ConditionalChrome`.
- **Builder:** `src/components/builder/` — `builderCore.js` exposes `manifest(state)`,
  `encodeShare(state)` / `decodeShare(code)` (format `SANDBP2.<base64-json>`). Build state shape:
  `{ v: 2, name, chassisId, placements: [{ id, partId, x, y, z, rot, conns }] }`. Working build
  auto-saves to `localStorage` key `sand_blueprint_v2`. `galleryApi.js` `submitBuild()` is a stub
  that throws — this spec replaces it.
- **Moderation/ownership precedent:** `Proposal` model + admin patterns; `disabled` entities are
  scrubbed from all cross-refs — `HIDDEN` designs follow the same "absent from public lists" rule.

> **Next.js note:** `apps/wiki/AGENTS.md` warns this is a modified Next.js with breaking changes.
> Read the relevant guide under `node_modules/next/dist/docs/` before writing route handlers,
> pages, or server actions.

## Architecture

### 1. Navbar enrichment (tool pages)

Keep `ToolNavBrand` as-is; enrich the app-bars around it. No change to `SiteHeader`/`MainNav` on
content pages.

- Add the existing **`AuthMenu`** to the right side of the `/builder`, `/tech`, and `/gallery`
  app-bars → Steam auth visible on all tool pages, sharing the homepage component + styling.
- Add a segmented **`Builder | Gallery`** nav next to the brand on the **builder** and **gallery**
  bars (mockup style: `--border-strong` segments, active = `--primary`). `/tech` gains only the
  auth menu.
- Extend `AuthMenu`'s dropdown with a **"My designs"** item → `/gallery?view=mine`.
- All styled with existing site tokens (`--primary`, `--card`, `--border-strong`, `font-display`)
  to match the homepage.

### 2. Data model (Prisma / Postgres)

New `enum DesignStatus { PUBLISHED HIDDEN }`. "Draft" is the *absence* of a row (local only).

```prisma
model Design {
  id         String       @id @default(cuid())
  slug       String       @unique          // short public id for /gallery/<slug>
  name       String
  authorId   String                        // FK -> SteamUser.steamId
  author     SteamUser    @relation(fields: [authorId], references: [steamId])
  buildCode  String                        // SANDBP2.<base64> — source of truth
  chassisId  String                        // denormalized for filter/sort
  partCount  Int                           // derived from manifest()
  crowns     Int                           // derived build cost
  hull       Int                           // derived hull level
  thumbPath  String?                       // path to .webp on uploads volume
  status     DesignStatus @default(PUBLISHED)
  likeCount  Int          @default(0)       // denormalized for cheap sort/grid
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt
  likes      DesignLike[]
  reports    DesignReport[]
  @@index([status, likeCount])
  @@index([authorId])
}

model DesignLike {
  designId  String
  userId    String                          // SteamUser.steamId
  design    Design   @relation(fields: [designId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  @@id([designId, userId])                  // one like per user per design
  @@index([userId])
}

model DesignReport {
  id         String   @id @default(cuid())
  designId   String
  design     Design   @relation(fields: [designId], references: [id], onDelete: Cascade)
  reporterId String
  reason     String?
  createdAt  DateTime @default(now())
  @@index([designId])
}
```

- Add the inverse `designs Design[]` / `designLikes` / `designReports` relations to `SteamUser`
  as needed (or keep author relation one-directional + index — implementer's call following
  existing schema style).
- **`buildCode` is canonical**; `chassisId/partCount/crowns/hull` are derived **once at publish**
  via `manifest()` + cost data so cards/filters never decode every build.
- **`likeCount` is denormalized** and kept in sync inside the like/unlike transaction; the
  authoritative count is the `DesignLike` rows.
- Migration via `prisma migrate` against the **Direct URL**. New tables only — **no seed changes.**

### 3. Routes, pages & API

**Pages** (full-bleed; excluded from chrome via `ConditionalChrome`):

- **`/gallery`** — grid per mockup. Server component renders the first page; client component owns
  the Community / My designs toggle, sort, filter chips, like interactions. `?view=mine` deep-links
  the My-designs tab; sort/filter reflect in the URL.
- **`/gallery/[slug]`** — single design: name, author, large thumbnail, stats, manifest, like
  button, "Open in builder", report. Shareable URL; target of social/Steam links.

**API** (Route Handlers under `app/api/`):

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/designs` | `GET` | Paginated list — `?view=community\|mine&sort=&cursor=` | public (`mine` needs session) |
| `/api/designs` | `POST` | Publish: validate buildCode, decode → derive stats, accept thumbnail, create row | signed-in |
| `/api/designs/[slug]` | `GET` | Single design | public |
| `/api/designs/[slug]` | `PATCH` | Rename / republish (owner only) | owner |
| `/api/designs/[slug]` | `DELETE` | Unpublish/delete (owner or admin) | owner/admin |
| `/api/designs/[slug]/like` | `POST`/`DELETE` | Like / unlike (toggle row + `likeCount` in one tx) | signed-in |
| `/api/designs/[slug]/report` | `POST` | File a report | signed-in |
| `/api/uploads/thumbs/[file]` | `GET` | Serve thumbnail from the volume | public |

- **Cursor pagination:** `(likeCount, id)` for Top, `(createdAt, id)` for Newest — index-friendly,
  stable for infinite scroll / "load more".
- **Server-side validation:** `POST` re-decodes `buildCode` and re-derives stats rather than
  trusting client numbers (prevents spoofed stats).
- All writes use `getUser()`/`requireUser()` + ownership checks; admin via `isAdmin()`.

### 4. Publish flow & thumbnail capture

Replaces `submitBuild()` in `galleryApi.js`.

1. **Publish** (builder's existing action) → if signed-out, open the **Steam explainer modal**
   (mockup permissions copy); its "Continue to Steam" is the real
   `/api/auth/steam/login?returnTo=/builder`.
2. Signed-in → publish dialog confirms **name** (prefilled) + shows thumbnail preview.
3. On confirm: client captures thumbnail, then `POST /api/designs { name, buildCode, thumbnail }`.
4. Server decodes, derives stats, writes `<slug>.webp` to the uploads volume, creates the row,
   returns `slug`. Builder shows success → "View in gallery".

**Thumbnail capture (fixed angle):** a `captureThumbnail()` helper saves the user's camera, applies
a **canonical pose** (fixed orbit/elevation/framing, identical for every rig), fits the rig to
frame, renders one frame, reads `canvas.toDataURL('image/webp')` (downscaled ~600×360), then
restores the user's camera. Server decodes the data URL, clamps size, writes the file, stores
`thumbPath`. Republishing refreshes the thumbnail.

- **Risk:** depends on the WebGL renderer supporting pixel readback (`preserveDrawingBuffer` or an
  explicit render-to-capture). Verify during implementation; fallback is an on-demand single capture
  frame. The fixed angle holds regardless.

### 5. Draft vs Published lifecycle

- **Draft** = local `localStorage` working build (no DB row).
- **Published** = `Design` row (public).
- **My designs** (signed-in): your Published rows from the DB (Edit → opens in builder;
  Unpublish/Delete; like/▾ stats) **plus** your local Draft card (Edit/Publish, labelled
  "Draft — not published"). Signed-out → gate panel ("Sign in to see your designs").

**Explicitly out of scope for v1** (conscious cuts):

- Multi-draft local library (naming/saving many local builds) — large builder-side change.
- "Saved collection" / bookmarking others' designs (mockup ☆ button + account-menu item) — same
  pattern as likes; deferrable. The ☆ "save" control is omitted for v1.

### 6. Likes, reporting & signed-out gating

- **Like (upvote-only):** card footer shows one like control + total `likeCount`. Toggle →
  `POST`/`DELETE /api/designs/[slug]/like`; server flips the `DesignLike` row + `likeCount` in one
  transaction. Optimistic client update.
- **Signed-out gating:** like/publish/report render "locked" (dashed, per mockup). Clicking opens
  the **Steam explainer modal**, whose CTA is the real `login?returnTo=<current path>` link — not
  the mockup's fake `localStorage` toggle.
- **Report:** signed-in users get a Report action (detail page + card `⋯`) → `POST .../report`
  with optional reason. Admins (`isAdmin()`) can set `status = HIDDEN`; hidden designs drop out of
  all public lists/detail, mirroring how `disabled` entities are scrubbed.

## Testing & verification

- **Unit:** canonical-pose helper (camera saved/restored, fixed pose applied);
  `buildCode` decode → stat derivation matches `manifest()`; like-toggle keeps rows + `likeCount`
  consistent; cursor pagination ordering is stable.
- **API:** publish rejects malformed/spoofed `buildCode`; server-derived stats override client
  values; ownership enforced on PATCH/DELETE; like is idempotent (double-POST = one row);
  admin-only HIDDEN; hidden designs absent from public list/detail.
- **Auth/gating:** signed-out POSTs → 401; signed-out UI shows locked controls; explainer modal
  points at the real `login?returnTo=` URL.
- **Migration:** `prisma migrate` runs clean against the Direct URL; new tables only;
  **no seed touched** (honours never-reseed rule).
- **Manual (per `verify` skill):** publish end-to-end → row + thumbnail on volume → appears in
  Community grid → like from a second account → shows in My designs → unpublish → gone. Run the dev
  server and walk this flow before claiming done.

## Open implementation risks

1. WebGL pixel readback for thumbnails (above) — verify early.
2. Uploads volume must exist + be writable in dev and in the Docker Compose deploy; the serve route
   must resolve safely (no path traversal). Confirm against `docs/vps-deploy.md`.
3. `slug` generation: short, unique, collision-handled (e.g. base from name + random suffix).
