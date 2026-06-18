# SandLabs Roadmap

Living plan for the repo-wide restructure. Each sub-project gets its own
`docs/superpowers/specs/<date>-<topic>-design.md` → implementation plan → branch.

## Vision

- **Entity/part data is static**, regenerated per game patch from a unified datamining
  pipeline, committed as JSON, imported at build time. No database on the entity read
  path.
- **Postgres holds only user-generated content** (Steam users, shared builds, tips) —
  the stuff that is *not* regenerated each patch.
- **One npm-workspaces monorepo** (`apps/*`, `packages/*`) housing the wiki, the future
  trampler builder, the datamining pipeline, and the shared static-data layer.

## Sub-projects

### 1. Foundation — IN PROGRESS
Branch `feat/monorepo-static-foundation`.
Spec: `docs/superpowers/specs/2026-06-18-monorepo-static-foundation-design.md`.

- npm-workspaces skeleton: `apps/wiki`, `packages/datamine`, `packages/data`.
- Freeze current dev-DB entities → committed JSON (one-time export).
- Rewire wiki read path (`lib/queries.ts` et al.) off Prisma onto `packages/data`.
- Remove Directus entirely.
- Drop entity Prisma models (`Entity`, `ItemStats`, `TramplerStats`, `TechNodeStats`,
  `EntityLink`, `Recipe*`, `Proposal`).
- Add user-content tables: `Tip`, `TipVote` (+ `SteamUser` relation updates).
- Replace the corrections/proposals flow with a **tips tab** + `/admin/tips` moderation.
- Drop entity-correction workflow entirely.

### 2. Unified datamining pipeline — NOT STARTED
- One pipeline emitting **items + environment + trampler + tech-tree** as the JSON that
  `packages/data` consumes.
- Absorbs/replaces: `sand-wiki/datamine` scripts (relocated in #1), `sand-scraper`,
  `tech-tree` generators, and the scattered `prisma/*.mjs` / `*.ts` import scripts.
- Owns the `disabled`/hide flag and any overrides as pipeline inputs (no live edits).
- Re-runnable each game release; output is the committed JSON artifact set.

### 3. Trampler builder tool — NOT STARTED
- New app (`apps/builder`) that consumes the static data to assemble trampler loadouts
  and compute combined stats.
- Introduces `SharedBuild` (Postgres) — persisted, shareable user builds.

### 4. Tips/builds UI polish — NOT STARTED
- Voting UX, moderation surface refinements, shared-build browsing/embedding.

## Out of scope / deferred (capture so we don't lose them)

- **Datamining unification** — deferred to #2. In #1, `packages/datamine` only *houses*
  existing scripts relocated as-is; no rewrite.
- **`sand-scraper` / `tech-tree` absorption** — deferred to #2. Left in place as sources;
  obvious dead files may be pruned but logic is not migrated in #1.
- **`SharedBuild` table + build sharing** — deferred to #3 (meaningless before the builder
  exists).
- **Tips voting/moderation polish** — basic version in #1; richer UX in #4.
- **WebP / all-routes-dynamic** wiki perf follow-ups — see `memory/deployment-plan.md`.
- **Directus in production** notes (TODO.md §19–31) — moot once Directus is removed in #1.

## Cross-cutting constraints

- **Never reseed the live DB.** The only prod DB action in #1 is a forward
  `migrate deploy` that drops now-unused tables, run *last*, after data is safely in JSON.
- Repo root is `D:/Documents/SandLabs`; `sek/` is a separate nested repo (untouched).
- npm (not pnpm); Windows/PowerShell PATH constraints apply.
