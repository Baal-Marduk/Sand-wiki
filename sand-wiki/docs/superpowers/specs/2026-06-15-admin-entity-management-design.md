# Admin Entity Management — Add / Change Image / Disable

**Date:** 2026-06-15
**Status:** Approved design, pending implementation plan

## Goal

Give an admin three direct, in-app capabilities, replacing the current manual Directus step:

1. **Add** a new entity (item / environment / trampler-part).
2. **Change** an entity's image (and alt text).
3. **Disable** an entity so it is hidden from the public but still visible to admins.

All three are **admin-direct** actions (write straight to the DB, no proposal/review round-trip), gated by `requireAdmin()`.

## Non-negotiable constraint: seed-safety

The seed (`prisma/seed.ts`) overwrites scraped fields and prunes rows not in the JSON source. The design must guarantee that none of these three admin actions are lost on a future re-seed (including `db:seed:force`). The seed already provides two protection layers we reuse rather than reinvent:

- **Row-deletion protection — the `curated` flag.** Every prune `deleteMany` is gated `where: { curated: false, ... }` (seed.ts lines 147, 189, 238, 291, 336). A `curated: true` row is never pruned. The seed also only upserts slugs present in the JSON source, so a hand-added entity (slug absent from source) is never touched at all.
- **Field-overwrite protection — the "lock map."** Before upserting, the seed reads all applied `edit` proposals and builds `Map<slug, Set<fieldName>>` from `Object.keys(Proposal.changes)` (`buildLockMap` in `src/lib/seed-curation.ts`). `omitLocked` then strips those fields from the upsert `update` payload — so any field recorded in an applied edit proposal survives a re-seed, **with no `--force` bypass**.

Note `buildLockMap` keys purely off `targetSlug` (globally unique) and the field-name keys of `changes` — it does **not** consult `EDITABLE_FIELDS` or `targetType`. This is what lets us protect `icon`/`imageAlt` without touching the contributor edit whitelist.

### How each feature stays seed-safe

| Feature | Protection |
|---|---|
| **Add entity** | Row created with `curated: true` → never pruned; its slug is absent from the JSON source → never overwritten. |
| **Change image** | `icon`/`imageAlt` updated directly **and** a pre-applied `edit` proposal recorded with `changes: { icon: {old,new}, imageAlt: {old,new} }`. The seed's lock map then omits those fields on every re-seed. |
| **Disable** | New `disabled` column. The seed never includes `disabled` in any create/update payload, so the upsert leaves it untouched. A disabled *scraped* row keeps its source slug (not pruned); a disabled *new* row is `curated` (not pruned). |

## Schema change

One new column on `Entity`:

```prisma
disabled Boolean @default(false) // admin-hidden; only admins see it
```

`icon`, `iconFile`, `imageAlt`, `curated` already exist. Apply with `prisma db push` (or a migration) — adding a defaulted boolean is non-destructive and requires no re-seed.

## Visibility semantics for `disabled`

- **Non-admins:** disabled entities are excluded from every list page, the search-index route, and the sitemap; navigating directly to a disabled entity's detail URL returns 404 (`notFound()`).
- **Admins:** disabled entities remain visible everywhere, rendered with a clear "Disabled" badge, so an admin can preview before re-enabling.

### Implementation

A single helper centralizes the rule so all call sites stay consistent:

```ts
// src/lib/visibility.ts
import type { Prisma } from "@prisma/client";
/** WHERE fragment to merge into Entity queries. Admins see everything;
 *  others never see disabled rows. */
export function visibilityWhere(isAdmin: boolean): Prisma.EntityWhereInput {
  return isAdmin ? {} : { disabled: false };
}
```

Call sites to update (all in `src/lib/queries.ts` unless noted):

- `listItems()`, `listEnvEntities()`, `listTramplerParts()` — merge `visibilityWhere(isAdmin)` into the `where`.
- `getItemBySlug()`, `getEnvEntityBySlug()`, `getTramplerPartBySlug()` — these stay `findUnique`; after fetching, if `entity.disabled && !isAdmin` return null so the page calls `notFound()`.
- `getTechTree()` — merge the visibility filter (tech-nodes can be disabled too, even though they aren't add-able here).
- Search index route `src/app/api/search-index/route.ts` — exclude disabled for non-admins.
- `listEntityPaths()` (sitemap, `src/app/sitemap.ts`) — exclude disabled unconditionally (sitemaps are public).

**Admin awareness in queries:** these functions currently take no session. They gain an optional `isAdmin = false` parameter (default false = safe/public). Page components that should show disabled rows to admins resolve `isAdmin` via `getSession()` + `isAdmin(steamId)` and pass it down. Default-false means any caller that forgets stays safe (public view).

`listEntityPaths()` is used to pre-render/sitemap; it must exclude disabled so disabled pages aren't advertised. Static-param generation (`generateStaticParams`) should likewise skip disabled — acceptable because a re-enabled entity renders on-demand.

## Server actions

New file `src/app/admin/entities/actions.ts` (`"use server"`), each beginning with `await requireAdmin()`:

### `setEntityImage(slug, icon, imageAlt)`
1. Load the entity's current `icon`/`imageAlt`.
2. Compute the diff; if nothing changed, no-op.
3. In a transaction: update the `Entity` row, and create a `Proposal` row `{ kind: "edit", status: "applied", targetType, targetSlug: slug, changes, proposerId: adminSteamId, reviewedById: adminSteamId, reviewedAt: now }` as the lock record. `targetType` is the legacy proposal-type name (`item` / `envEntity` / `tramplerPart`) derived from `Entity.kind`.
4. `revalidatePath` the entity's detail page and list page.

`icon` accepts any non-empty string (URL or path) up to `MAX_STRING_LENGTH`, or empty → null (clears it). Light validation only: trim + length cap; no existence check (paste-URL model, per decision). A small client-side preview renders the pasted value as an `<img>`.

We do **not** add `icon`/`imageAlt` to `EDITABLE_FIELDS`. Reasons: (a) the lock map doesn't need it; (b) `proposal-apply.ts`'s `ENTITY_OWN_FIELDS`/`partitionUpdate` would misroute `icon` to the stats table for item/trampler targets if it ever flowed through `applyProposal`. Since admin image edits are written pre-applied, they never traverse `applyProposal`, and the contributor edit form stays unchanged.

### `setEntityDisabled(slug, disabled)`
1. `await requireAdmin()`.
2. `prisma.entity.update({ where: { slug }, data: { disabled } })`.
3. `revalidatePath` detail + list pages. No lock record needed (the seed never writes `disabled`).

### `createEntity(input)`
Inputs: `kind` (`item` | `environment` | `trampler-part`), `slug`, `name`, `category`, `icon?`, `imageAlt?`, plus the kind's editable scalar fields (reusing `EDITABLE_FIELDS` definitions for items/trampler-parts/env).
1. `await requireAdmin()`.
2. Validate: `kind` is one of the three; `slug` matches a slug pattern and is unique (`Entity.slug` is globally unique — check before insert); `category` is valid for the kind (`isItemCategory` / `isEnvCategory` / `isTramplerCategory`); required fields present.
3. Create `Entity { ..., curated: true }` with the nested stat sub-row for item (`itemStats`) / trampler-part (`tramplerStats`); environment has no stat extension.
4. Redirect to the new entity's detail page.

Tech-nodes are **out of scope** for creation (they're a generated, structured tree with prereq/unlock links).

### SteamUser FK
The lock-record `Proposal.proposerId` references `SteamUser`. The admin always has a `SteamUser` row (upserted at Steam login, `src/app/api/auth/steam/callback/route.ts:41`), so the FK is satisfied.

## UI surfaces (all admin-gated)

### Admin control strip on entity detail pages
On each entity detail page (items, environment, tramplers), when the viewer is an admin, render an admin-only control strip with:
- **Image field:** text input pre-filled with the current `icon`, an alt-text input, a live `<img>` preview of the entered value, and a Save button → `setEntityImage`.
- **Disable/Enable toggle:** a button reflecting current `disabled` state → `setEntityDisabled`.
- A **"Disabled" badge** shown near the title whenever `entity.disabled` is true (visible to the admin viewing it).

Follows the existing pattern of gating admin UI on `isAdmin(session.steamId)` and posting to server actions.

### Add-entity form
New route `src/app/admin/entities/new/page.tsx` (admin-gated). A form with:
- a **kind selector** (item / environment / trampler-part) that reveals that kind's fields,
- slug, name, category (select from the kind's canonical category slugs via `enumOptionsFor`), icon, imageAlt,
- the kind's editable scalar fields from `EDITABLE_FIELDS`.

Submits to `createEntity`.

## Components / units

| Unit | Responsibility | Depends on |
|---|---|---|
| `Entity.disabled` column | persistent admin-hidden flag | Prisma schema |
| `src/lib/visibility.ts` | single source of truth for the visibility WHERE rule | Prisma types |
| `queries.ts` (modified) | accept `isAdmin`, apply visibility | visibility.ts |
| `src/app/admin/entities/actions.ts` | the three server actions + lock-record helper | db, auth, proposal-schema |
| Admin control strip component | image edit + disable toggle UI on detail pages | actions, auth |
| `src/app/admin/entities/new/page.tsx` | add-entity form | actions, proposal-schema, taxonomy |

## Out of scope

- Image upload / Vercel Blob / bundled-icon picker (paste URL/path only).
- Creating tech-node entities.
- Editing non-image scalar fields directly as admin (still done via the existing edit-proposal flow; admin can approve their own).
- Hard-deleting entities (disable is the soft alternative).

## Testing

- **Unit:** `visibilityWhere(true)` → `{}`; `visibilityWhere(false)` → `{ disabled: false }`. Lock-record builder produces a `changes` object whose keys match the changed image fields.
- **Seed-safety (the critical test):** seed a DB; (a) add a curated entity, change an existing entity's image, disable an entity; (b) run `db:seed:force`; (c) assert the curated entity still exists, the image change persisted (lock map honored), and the disabled flag persisted. This mirrors the existing `seed-transform.test.ts` discipline.
- **Visibility integration:** a disabled entity is absent from public list/search/sitemap and 404s on detail for non-admins, but present (with badge) for admins.
