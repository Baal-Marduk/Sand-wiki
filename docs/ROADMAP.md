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

### 1. Foundation — CORE DONE (on `feat/monorepo-static-foundation`, not yet merged)
Branch `feat/monorepo-static-foundation`.
Spec: `docs/superpowers/specs/2026-06-18-monorepo-static-foundation-design.md`.
Plans: `docs/superpowers/plans/2026-06-18-foundation-1-*.md` (done) and `-foundation-2-*.md`
(executed in reduced scope — see below).

**DONE:**
- ✅ npm-workspaces skeleton: `apps/wiki`, `packages/data` (the `packages/datamine` relocation
  is folded into sub-project #2, not done here).
- ✅ Froze entities → committed JSON (`packages/data/generated/*.json`: 377 entities, 39
  recipes, 1081 links), round-trip integrity-tested.
- ✅ Rewired the ENTIRE wiki read path (`lib/queries.ts` + `api/search-index`) off Prisma onto
  `@sandlabs/data`. Parity verified function-by-function. Build green, 292 tests pass.
- ✅ Removed Directus entirely (runtime, compose, snapshots, directus npm scripts).
- ✅ Removed the obsolete proposal/contribute write flows + `getLastEditor` + the
  suggest-correction / edit-tabs UI.

**DEFERRED (deliberately — see decisions 2026-06-18):**
- ⏸ **Tips feature** (`Tip`/`TipVote` schema, tips tab, `/admin/tips`) — future feature, not
  built. Corrections were removed with no replacement in the interim.
- ⏸ **Entity DB teardown** — the connected DB is PRODUCTION, so NO migration was run and NO
  tables/data were dropped. All Prisma models (incl. `Entity`, `Recipe*`, `Proposal`) and data
  remain intact; the app simply no longer reads them. Drop only once fully confident in the
  static path.
- ⏸ **Admin entity image/disable controls** — kept DORMANT (still write `prisma.entity`, which
  the JSON-backed site ignores). The only remaining `prisma.entity` writes in the app.

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
