# Seed Hardening: Preserve Contributor Field Edits

**Date:** 2026-06-14
**Status:** Approved — ready for implementation plan
**App:** `sand-wiki/` (Next.js 16 + Prisma 6, Neon Postgres)

## Summary

Make `prisma/seed.ts` stop overwriting entity **field** values that a contributor has
manually edited through the wiki's contribute flow. The seed will read the applied `edit`
proposals, build a per-entity set of edited field names, and **omit those fields from its
upsert `update`** — on every seed run, including `--force`. Untouched fields still refresh
from source. No schema change; `applyProposal` and the contribute UI are unchanged.

## Motivation

On 2026-06-14 a `db:seed:force` run reverted ~42 contributor edits across 27 entities
(mostly item `rarity` → "Common"). Root cause: the seed's item upsert always writes
source-derived values for source-populated fields. `rarity` is set to `enrichment.rarity`
or `DEFAULT_RARITY` ("Common") on **every** item, so any re-seed silently reverts manual
rarity edits. The `curated` / `lootCurated` flags only protect rows from **pruning** and
links from **recreation** — they do **not** protect field values. Recovery was possible only
because contributor edits are durably recorded in the `Proposal` table. This spec closes the
hole so the same incident cannot recur.

## Decisions (confirmed with user)

1. **Per-field protection.** Lock only the fields that were edited; still refresh untouched
   fields from source.
2. **Source = the contribute flow only.** Protection is driven by the `Proposal` table.
   Raw Directus edits are explicitly NOT auto-protected (out of scope).
3. **Unconditional.** The protection applies on every seed, including `db:seed:force`. There
   is no bypass flag — a seed can never overwrite a contributor-edited field. The existing
   "abort unless `--force`" guard remains as the outer safety net.

## Current-state facts (from code, confirmed this session)

- `prisma/seed.ts` upserts items/env/trampler entities **by slug**. It builds an `identity`
  object (Entity columns) and a `stats` object (per-kind stat extension) and writes both via
  the same payload for `create` and `update`.
- `opt(v) = v ?? undefined` — null/undefined source values are omitted from the payload, so
  **source-empty** fields already survive a re-seed. The gap is **source-populated** fields.
- `rarity` always has a value: `enrichment.rarity` if present (and valid), else
  `DEFAULT_RARITY` ("Common"). So it is always written → always overwrites.
- Contributor edits go through `applyProposal` (kind `edit`), which writes whitelisted fields
  but sets **no** protective flag. The `Proposal.changes` JSON is `{ <field>: { old, new } }`,
  so its **keys are exactly the edited field names**.
- Editable field names == Prisma column names, split by `proposal-apply.ts`:
  `ENTITY_OWN_FIELDS = {name, description, category, rarity, sourceUrl}` live on Entity; the
  rest (e.g. `damage`, `magazine`, `statValue`, `storageStack`, `workbenchTier`, `ammoName`)
  live on the stat extension. (Verified during the 2026-06-14 recovery: `rarity`→Entity,
  `magazine`→ItemStats, `name`→Entity all mapped cleanly.)
- Test convention: pure helpers are unit-tested (vitest); DB-touching code (the seed,
  `applyProposal`) is not unit-tested — verified manually.

## Design

### 1. Lock-set builder (pure, unit-tested)

A pure function `buildLockMap(proposals)` that takes
`{ targetSlug: string, changes: unknown }[]` (the applied `edit` proposals) and returns
`Map<string, Set<string>>` keyed by slug, valued by the set of edited field names (the keys
of each `changes` object). `Entity.slug` is globally unique, so one map covers all kinds.

The seed calls it once at start:
```
const lockMap = buildLockMap(
  await prisma.proposal.findMany({
    where: { status: "applied", kind: "edit" },
    select: { targetSlug: true, changes: true },
  })
);
```

### 2. Field filter (pure, unit-tested)

`omitLocked(payload, locked)` returns a shallow copy of `payload` with every key present in
the `locked` set removed (and is a no-op when `locked` is empty/undefined). Applied to the
**`update`** side of each upsert only; the `create` side keeps the full source payload (a
new entity has no applied proposals, so nothing to protect — and we want full data on first
insert). Composes with `opt()`: on update, a field is written only if source had a value
**and** it is not locked.

### 3. Where it applies

For each seeded contributor-editable kind, look up `locked = lockMap.get(slug)` and filter
both payloads on update:

- **Items** (`seed.ts` item block): filter `identity` (Entity) and `stats` (ItemStats).
- **Environment** (env block): filter `identity` (Entity).
- **Trampler parts** (trampler block): filter `identity` (Entity) and `stats` (TramplerStats).

Filtering both objects against the same `locked` set routes each field correctly (an entity
field name only exists in `identity`; a stat field name only in `stats`). Tech-nodes
(generated, no contributor edits) and recipes (already protected by `Recipe.curated`) are out
of scope.

### 4. Unconditional + visibility

The filter runs regardless of `--force`. After seeding, log a summary line, e.g.
`Preserved <N> contributor-edited field(s) across <M> entit(ies)`, so a run visibly confirms
protection is active.

### 5. Error handling / edge cases

- Only `status:"applied"`, `kind:"edit"` proposals are consulted (pending/rejected ignored).
- `omitLocked` only removes keys that exist in the payload, so a field name that isn't a real
  column (defensive) is harmless.
- A field edited multiple times is still just "locked" (we need the name set, not values).
- Brand-new entities: no entry in `lockMap`, so full source payload is written (correct).

### 6. Testing & safe verification

- **Unit (vitest):** `buildLockMap` (folds change keys per slug; ignores non-applied/non-edit
  inputs the caller filters out) and `omitLocked` (removes locked keys, preserves others,
  no-op on empty). These live in a new pure module `src/lib/seed-curation.ts` that the seed
  imports.
- **Integration — on a DISPOSABLE Neon branch, never live:** create a branch of `production`
  via the Neon API, run the hardened seed against that branch's connection string, and assert
  that a sample of known contributor-edited fields (e.g. `rocket-launcher-ammo-armor-piercing`
  rarity = "Noteworthy", `health-emitter` rarity = "Experimental") are **unchanged**, while a
  non-edited field still matches source. Then delete the branch. The live DB is never seeded
  during verification.

## Non-goals (YAGNI)

- No protection for raw Directus edits (contribute-flow only, by decision).
- No `curatedFields` schema column; no schema migration.
- No re-baseline / `--ignore-curated` bypass flag.
- No change to `applyProposal`, the proposal schema, or the contribute UI.
- No change to row-pruning or link-recreation behavior (already handled by `curated` /
  `lootCurated`).

## Risks / verification

- **Field-name drift:** if a future editable field's proposal key ever diverges from its
  column name, `omitLocked` would silently fail to protect it. Mitigation: source the field
  partition from the same `proposal-schema` definitions the apply path uses, and keep a test
  asserting a representative mapping.
- **Verification must never touch live:** enforced by doing integration verification only on a
  throwaway Neon branch.
- **Existing recovered data:** already restored (2026-06-14) and now `curated`; this change
  protects it going forward.
