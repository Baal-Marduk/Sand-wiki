# Monorepo + Static-Data Foundation — Design

**Date:** 2026-06-18
**Branch:** `feat/monorepo-static-foundation`
**Status:** Approved (design), pending spec review

## Context

SandLabs is currently a loose collection in one git repo: `sand-wiki` (the Next.js 16 /
Prisma 6 app, the only real app), `sand-scraper` (standalone v1 scraper), `tech-tree`
(an HTML/mjs prototype), `design/`, `docs/`, and a separately-versioned nested repo
`sek/sand-expedition-kit` (gitignored, untouched here).

Today every game entity (items, environments, trampler parts, tech nodes) lives in
Postgres (Neon), edited live through Directus and an in-app proposal/correction flow.
That live-DB model has been a persistent source of pain: re-seeding reverts contributor
edits, Directus only partially adopts the Prisma-owned tables, and entity data is
regenerated every game patch anyway — so storing it in a mutable database buys nothing
and costs a recurring hazard.

This is the **first of several** sub-projects in a larger plan (unified datamining,
trampler builder, monorepo of multiple apps). It is deliberately scoped to the
**foundation** the others depend on.

### Larger roadmap (for context — NOT in this spec)

1. **Foundation (THIS SPEC)** — npm-workspaces skeleton, freeze entity data to committed
   JSON, rewire the wiki to read JSON, remove Directus + entity DB models, add the
   user-content tables.
2. **Unified datamining pipeline** — one pipeline emitting items + environment +
   trampler + tech-tree, replacing the scattered scripts (absorbs `sand-scraper`,
   `tech-tree`).
3. **Trampler builder tool** — new app; consumes the static data; introduces
   `SharedBuild`.
4. **Tips/builds UI polish** — voting, moderation surface, build sharing UX.

## Goals

- Entity/part data becomes **static JSON**, generated per patch, imported at build time.
- **No database on the entity read path.** Postgres keeps *only* user-generated content
  that is not regenerated each patch.
- Remove Directus entirely.
- Stand up an npm-workspaces monorepo skeleton the later sub-projects plug into.
- Lose nothing: today's curated entity data is frozen to JSON before any teardown.

## Non-Goals

- Unifying / improving the datamining pipeline (spec #2). Here `packages/datamine` just
  *houses* the existing generation scripts relocated as-is.
- The trampler builder and `SharedBuild` (spec #3).
- Absorbing `sand-scraper` / `tech-tree` generation logic (spec #2). They are noted as
  sources; dead-obvious cruft may be deleted but their logic is not rewritten here.

## Decisions (resolved during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Static data format | **Committed JSON, build-time** | Git-diffable, zero DB on read path, clean break from live-DB hazards. |
| Entity corrections | **Dropped** | Replaced by a community **tips** feature. Fixes happen in the pipeline/overrides. Kills the re-seed-reverts-edits hazard at the root. |
| Repo layout | **npm workspaces monorepo** (`apps/*`, `packages/*`) | Shared types/data-access across wiki and (future) builder; one install; clear boundaries. |
| Package manager | **npm** (not pnpm) | Repo + Vercel already on npm; Windows PATH friction noted; lowest migration risk. |
| First spec scope | **Foundation** | De-risking base everything else needs. |
| Tips tab UI | **In scope** | It replaces the corrections feature being removed; keeps community engagement intact. |
| `SharedBuild` | **Deferred to builder spec** | A "shared build" is meaningless before the builder exists. |

## Target Structure

```
SandLabs/
  apps/
    wiki/                 # today's sand-wiki, moved via `git mv` (history preserved)
  packages/
    datamine/             # existing sand-wiki/datamine + prisma/*.mjs gen scripts, relocated as-is
    data/                 # the new static data layer
      generated/          # committed JSON artifacts: entities.json, recipes.json, links.json
      src/                # typed load + in-memory index + query functions
      package.json
  package.json            # npm workspaces root (workspaces: ["apps/*", "packages/*"])
  docs/  design/          # unchanged
  sek/                    # untouched nested repo
```

- `sand-scraper/`, `tech-tree/` remain in place for now (sources for spec #2); obvious
  dead files may be pruned but they are not migrated here.
- Vercel root directory repoints to `apps/wiki`.

## Components

### `packages/data` — the static data layer

The single module that replaces `prisma.entity.*` reads. Responsibilities:

- **Load** the committed JSON from `generated/` (one read, module-level memoized — the
  Node server process caches the parsed structure across requests).
- **Index** into in-memory `Map`s: `slug → entity`, `kind → entity[]`,
  `category → entity[]`, `role → links[]`, `entityId → recipes`, etc. — mirroring the
  indexes the current Prisma queries rely on.
- **Expose typed query functions** that match what `apps/wiki/src/lib/queries.ts` needs:
  e.g. `getEntityBySlug`, `listByKind`, `listByCategory`, `recipesProducing(slug)`,
  `recipesUsing(slug)`, `linksFor(slug, role)`, `craftedAt(locationSlug)`. These are the
  contract; the wiki imports only these, never the JSON directly.
- **TypeScript types** for `Entity`, `ItemStats`, `TramplerStats`, `TechNodeStats`,
  `EntityLink`, `Recipe`, derived once and shared. (Current Prisma-generated types for
  these models go away; these hand-authored types replace them.)

Boundary test: the wiki must be able to swap the JSON source (frozen export today →
unified pipeline output later) with zero wiki code change. Only `packages/data` knows the
on-disk shape.

### `packages/datamine` — relocated generators

Existing `sand-wiki/datamine/` (python + JSON) and the `sand-wiki/prisma/*.mjs` / `*.ts`
generation scripts move here verbatim. Plus **one new export script** (below). No
unification, no rewrite.

### One-time freeze/export

A script (lives in `packages/datamine`) that reads the **current dev Neon DB** and dumps
`Entity` + `ItemStats`/`TramplerStats`/`TechNodeStats` + `EntityLink` + `Recipe`/`RecipeInput`/`RecipeOutput`
into `packages/data/generated/{entities,recipes,links}.json`. This freezes all of today's
curated data (hand edits, curated flags resolved into plain fields, disabled flags) so the
transition loses nothing. Run once; output committed. Later, spec #2's pipeline emits the
same files.

`iconFile` (Directus file UUIDs) must be resolved to **plain static image paths** during
export, since Directus is being removed. Sprites are already mirrored under
`apps/wiki/public/` (to verify in planning); the export maps each entity's image to its
public path so card images keep working with no Directus.

### `apps/wiki` — read-path rewrite

- `src/lib/queries.ts` (27 entity calls — the choke point) rewritten to call
  `packages/data` instead of `prisma.entity.*`.
- `src/lib/item-filter.ts`, `src/lib/visibility.ts`, `src/app/api/search-index/route.ts`
  updated to source entities from `packages/data`.
- The Prisma client in the wiki is retained **only** for user content (`SteamUser`,
  `Tip`, `TipVote`).
- "Hide an entity" (today's `disabled` admin toggle) becomes a `disabled` field in the
  generated JSON, honored by `packages/data` / `visibility.ts`. Setting it is a
  pipeline/override concern (spec #2), not a runtime edit.

## Data Model (Postgres after the shift)

**Dropped models:** `Entity`, `ItemStats`, `TramplerStats`, `TechNodeStats`,
`EntityLink`, `Recipe`, `RecipeInput`, `RecipeOutput`, `Proposal`.

**Kept:** `SteamUser` (auth + authorship). Its `proposals Proposal[]` relation is removed
(Proposal is dropped) and replaced with `tips Tip[]` and `tipVotes TipVote[]`
back-relations.

**Added:**

```prisma
model Tip {
  id         String    @id @default(dbgenerated("(gen_random_uuid())::text"))
  targetSlug String    // the entity (item/env/trampler/tech) the tip is about
  body       String
  status     String    @default("pending") // "pending" | "approved" | "rejected"
  authorId   String
  author     SteamUser @relation(fields: [authorId], references: [steamId])
  createdAt  DateTime  @default(now())
  reviewedById String?
  reviewedAt   DateTime?
  votes      TipVote[]

  @@index([targetSlug, status])
  @@index([authorId])
}

model TipVote {
  id        String    @id @default(dbgenerated("(gen_random_uuid())::text"))
  tipId     String
  tip       Tip       @relation(fields: [tipId], references: [id], onDelete: Cascade)
  voterId   String
  voter     SteamUser @relation(fields: [voterId], references: [steamId])
  createdAt DateTime  @default(now())

  @@unique([tipId, voterId]) // one vote per user per tip
  @@index([tipId])
}
```

`targetSlug` is a plain string (no FK) because entities no longer live in the DB — it
references a slug in the static data. The tips UI validates the slug against
`packages/data` at render time.

## Deletions

- All of `directus/`, `docker-compose.yml`, `docker-compose.override.yml`, Directus npm
  scripts in `package.json`, `prisma/sync-directus-icons.mjs`,
  `prisma/setup-directus-moderator.mjs`, and the `directus` reference in
  `src/app/admin/proposals/actions.ts`.
- Corrections/proposals machinery: `/admin/proposals`, `/contribute/*` edit flows,
  `src/lib/proposal-apply.ts`, `src/lib/proposal-entity.ts`.
- Admin entity management: `/admin/entities` (add / change-image / disable).
- The seed (`prisma/seed.ts`) and entity-loading scripts that wrote to the dropped tables
  (`load-*.ts`, `import-*.mjs`, `curated-extras`, etc.) — relocated to `packages/datamine`
  only if still useful as generators; otherwise deleted. The DB seed concept for entities
  is gone.

## New / Replaced UI: Tips tab

A **tips tab** on entity detail pages:
- Logged-in (Steam) users post a tip on the current entity.
- Anyone sees approved tips, sorted by vote count; logged-in users can upvote.
- Admins (existing Steam-id allowlist) see pending tips and approve/reject — reusing the
  existing admin-gating pattern, replacing the old `/admin/proposals` screen with a
  lighter `/admin/tips` moderation list.

This is the community-contribution feature that replaces per-field corrections.

## Migration / Rollout Order (de-risking)

1. Stand up workspace skeleton; `git mv sand-wiki apps/wiki`; verify wiki builds/runs
   unchanged (still on Prisma entities at this point).
2. Build `packages/data` (types + load + index + query functions) and the freeze/export
   script. Export dev DB → committed JSON.
3. Rewrite the wiki read path (`queries.ts` et al.) to use `packages/data`. Verify the
   site renders identically from JSON, **with the entity tables still present** (parallel
   safety — can compare).
4. Add `Tip`/`TipVote` models + tips tab + `/admin/tips`. Remove the proposals/contribute/
   admin-entities code.
5. Remove Directus (dirs, compose, scripts, references).
6. **Dev first:** drop the entity Prisma models + run the teardown migration on the dev
   DB. Full regression pass.
7. **Prod last:** only after dev is fully verified, run `prisma migrate deploy` (which now
   includes the table drops) on prod. The JSON export already captured everything; this is
   destructive-by-design and intentional.

### Risks

- **Live DB hard rule** (never reseed prod): respected. The only prod DB action is a
  forward `migrate deploy` that drops now-unused tables, run last, after the data is
  safely in JSON. No seeding.
- **Icons without Directus**: export must resolve `iconFile` UUIDs to static public paths;
  verify sprites are present under `apps/wiki/public/` before dropping Directus. If any
  are only in `directus/uploads`, copy them into `public/` as part of the export.
- **Vercel config**: root directory and any build/install commands repoint to `apps/wiki`;
  verify a preview deploy before prod.
- **Type churn**: removing Prisma-generated entity types breaks imports across the wiki;
  the `packages/data` hand-authored types must cover every field the UI reads. The export
  script doubles as the type-coverage check (every JSON field maps to a typed property).

## Testing

- `packages/data`: unit tests for index building and each query function against a small
  JSON fixture (mirrors the existing vitest setup).
- Freeze/export: a test asserting round-trip — exported JSON re-loaded through
  `packages/data` reproduces the same entity set the DB held (run against dev).
- Wiki: existing Playwright/vitest suites must pass against the JSON read path. Step 3's
  parallel period lets us diff JSON-rendered pages against DB-rendered ones.
- Tips: unit tests for vote uniqueness, status transitions, admin gating.
```
