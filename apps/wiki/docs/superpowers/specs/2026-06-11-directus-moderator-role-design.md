# Directus Moderator role

**Date:** 2026-06-11
**Status:** Approved (design)

## Goal

Let trusted moderators sign into the Directus Studio and correct/expand the wiki's
content — edit and add records, including icons — without giving them admin access or
the ability to delete data. Provision the role reproducibly via a script, the same way
icons are synced today.

## Why a script (not the schema snapshot)

In Directus 11, roles, policies, and permissions are **data**, not part of the data
model. `directus schema snapshot` captures collections/fields/relations only, so the
moderator role cannot live in `directus/snapshots/snapshot.yaml`. It must be created as
data. Following the existing convention ([prisma/sync-directus-icons.mjs](../../../prisma/sync-directus-icons.mjs)),
provisioning is an **idempotent Node script** that reads `.env`, logs in as the admin,
and reconciles the role via the REST API. This is version-controlled, reviewable,
re-runnable, and survives a `prisma migrate reset` / fresh Directus DB.

## Directus 11 access-control model (relevant facts)

- `directus_roles` — a named container. In v11 the access *flags* are NOT here.
- `directus_policies` — holds `app_access`, `admin_access`, `enforce_tfa`, and is what
  `directus_permissions` rows attach to.
- `directus_permissions` — one row per (policy, collection, action), with `fields`,
  `permissions` (row filter), `validation`, `presets`.
- `directus_access` — junction linking a **role** (or user) to a **policy**.

So a "Moderator role" = a Role + a Policy + permission rows + an access link.

## What gets created

### Policy: `Moderator`
- `app_access: true` (can use the Studio)
- `admin_access: false`
- `enforce_tfa: false`
- `icon: "shield"` (cosmetic), `description`: "Edit and add wiki content; no delete, no admin."

### Permissions on the policy

Content collections (all of): `Item`, `EnvEntity`, `TramplerPart`, `Recipe`,
`RecipeInput`, `RecipeOutput`, `LootTier`, `LootEntry`, `TramplerPartCost`
- actions: **`read`, `create`, `update`** — each with `fields: ["*"]`, no row filter
  (`permissions: {}`), no validation, no presets.
- **No `delete`, no `share`.**

`directus_files`
- actions: **`read`, `create`** (pick existing icons + upload new ones).
- **No `update`, `delete`, `share`.**

That is 9 × 3 + 2 = **29 permission rows**. No other collections are granted — `app_access`
already gives the Studio the minimal implicit system-collection reads it needs to run, so
we do not add `directus_collections`/`directus_fields`/etc. manually.

### Role: `Moderator`
- A `directus_roles` row named `Moderator`, linked to the `Moderator` policy via a
  `directus_access` row (`role` = the role id, `policy` = the policy id).

## Provisioning script

`prisma/setup-directus-moderator.mjs`, run with `npx tsx prisma/setup-directus-moderator.mjs`.

Reuses the helper shape from `sync-directus-icons.mjs`: parse `.env`, `POST /auth/login`
with `DIRECTUS_ADMIN_EMAIL`/`DIRECTUS_ADMIN_PASSWORD`, then a small `api()` fetch wrapper
with the bearer token.

**Idempotent reconciliation (find-or-create, by name):**
1. Policy: `GET /policies?filter[name][_eq]=Moderator&limit=1`. Reuse id if present; else
   `POST /policies` with the flags above. (If present, leave its flags as-is.)
2. Permissions: `GET /permissions?filter[policy][_eq]=<id>&limit=-1`. Build the desired
   set of `(collection, action)` pairs; `POST /permissions` for any pair not already
   present. Existing matching rows are left untouched. (Create-missing only — the script
   does not delete stray permissions, to avoid clobbering manual tweaks; it logs a count
   of pre-existing rows.)
3. Role: `GET /roles?filter[name][_eq]=Moderator&limit=1`. Reuse or `POST /roles`.
4. Access link: `GET /access?filter[role][_eq]=<role>&filter[policy][_eq]=<policy>&limit=1`.
   `POST /access` if missing.

Re-running changes nothing once everything exists. The script prints a summary:
`policy <created|reused>, N permissions added (M already present), role <created|reused>,
access link <created|reused>`.

## Out of scope

- **Inviting/creating moderator users.** After the role exists, the admin invites each
  person in the Studio (User Directory → invite) and assigns them the `Moderator` role.
  Per-user provisioning is intentionally not scripted (YAGNI; it's an occasional manual act).
- **Field-level restrictions / row-level ownership** (e.g. "only edit rows you created").
  Moderators are trusted; all content fields are editable.
- **Approval/draft workflow.** Edits are live. (A future enhancement, not now.)
- **No app code changes.** This is Directus-only; the Next.js app is unaffected.

## Verification

No unit test (the script integrates with a live Directus). Verify by:
1. Run the script against the local Directus (`docker compose up -d directus` must be running).
2. `GET /roles?filter[name][_eq]=Moderator` and `GET /policies?filter[name][_eq]=Moderator`
   each return exactly one row; `GET /permissions?filter[policy][_eq]=<id>` returns 29 rows
   with the expected (collection, action) pairs and no `delete`.
3. Run the script a **second** time and confirm "0 permissions added", one role, one policy,
   one access link (idempotency).
4. Manual smoke test: in the Studio, invite a test user as `Moderator`, confirm they can
   edit and create an `Item` and upload an icon, and that **delete** controls are absent.
