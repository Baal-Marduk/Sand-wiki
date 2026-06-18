# Datamined weapon / ammo / armor stats → wiki

**Date:** 2026-06-18
**Status:** Approved design, pending implementation plan
**Author:** Leo Wattier (with Claude)

## Goal

Replace error-prone, hand-scraped combat stats with authoritative datamined values
from SEK, and surface stats the wiki has never had. This is the next datamine
import after loot containers, and deliberately follows the same four-stage pipeline.

This pass covers the **data import only** (snapshot → build → schema/migration →
loader). UI surfacing of the new fields is a deliberate fast-follow, out of scope here.

## Scope

### In scope
- Import combat stats from SEK `weapon_stats.json` (weapons, ammo, armor) into `ItemStats`.
- New `ItemStats` columns for the fields the wiki lacks today.
- A committed datamine snapshot, a Node build script, a committed reconciled artifact,
  and a seed-safe, prod-safe loader (mirrors the loot-containers pipeline).

### Explicitly out of scope
- **Turrets** (`turret_stats.json`, 6 entities, different stat shape) — clean follow-up.
- **UI** — surfacing these fields on item pages is a separate fast-follow pass.
- **Magazine** and **ammoType** from datamine — not present in `weapon_stats.json`
  (only turrets carry clip size; ammo `stack` is inventory stack size, not magazine).
  These remain wiki-sourced. Not a regression; just not improved by this work.

## What the source actually contains

From `sek/sand-expedition-kit/site/src/data/weapon_stats.json` (already built and on disk;
no game-files extraction needed). Three buckets, keyed by datamine item **id**
(e.g. `item_antiReactorGun`, `DevSiegeRevolverAmmo`):

- **weapons (72):** `reloadSeconds`, `range {full,max,minMult,falloff}`, `recoil`, `spread`
  — **no magazine/clip field.** (recoil/spread intentionally not imported.)
- **ammo (37):** `damagePhysical`, `range {full,max,minMult,falloff}`, `penetrates`,
  `stack` (inventory stack, ignored).
- **armor (3):** `armorRating`, `regen {delay,speed}`, `durability`.

Dev/test ids (e.g. `DevSiegeRevolver*`) have no matching wiki item; the build drops them.

## Pipeline (mirrors loot containers)

```
SEK site/src/data/weapon_stats.json            (built datamine output, on disk)
  └─copy→ sand-wiki/datamine/data/weapon_stats.json     (committed provenance snapshot)
            └─build→ sand-wiki/prisma/build-weapon-stats.mjs   (npm run weapons:build)
                       reads weapon_stats.json + prisma/data.json (id→slug, category)
                       emits→ sand-wiki/prisma/weapon-stats.json  (committed, slug-keyed)
                                └─load→ sand-wiki/prisma/load-weapon-stats.ts
                                          (npm run db:load-weapon-stats)
```

A shared sibling module `sand-wiki/prisma/weapon-stats.ts` defines the artifact's
TypeScript type and the field-mapping helper, imported by both the loader and (later)
`seed.ts` — mirroring how `prisma/loot-containers.ts` (`lootLinkRows`,
`LootContainersFile`) is shared by `load-loot-containers.ts`.

The build is **Node/tsx**, not Python (unlike `build_container_loot.py`): there is no
Unity extraction here, only JSON reshaping plus the `id→slug` join, and it must read
`prisma/data.json` anyway. The build **reports and drops** any datamine id with no
matching wiki item rather than failing.

### Why a committed artifact (`prisma/weapon-stats.json`)
So the prod loader never depends on the SEK working copy — exactly as
`prisma/loot-containers.json` is committed. Build is reviewable; load is reproducible.

## Schema changes

Add to `model ItemStats` (all nullable, additive — no data loss):

```prisma
reloadSeconds    Float?
rangeFull        Float?
rangeMax         Float?
rangeMinMult     Float?
rangeFalloff     Boolean?
penetrates       Boolean?
armorRating      Int?
armorRegenDelay  Float?
armorRegenSpeed  Float?
armorDurability  Int?
```

The existing `damage` column is reused for ammo (`damagePhysical`). One Prisma migration.
Rollout matches the `ammoType` column precedent: dev `migrate dev`, prod `migrate deploy`,
then run the loader.

## Field mapping

| Source bucket | Source field            | ItemStats column                         |
|---------------|-------------------------|------------------------------------------|
| ammo          | `damagePhysical`        | `damage`                                 |
| ammo          | `penetrates`            | `penetrates`                             |
| weapons+ammo  | `range.full`            | `rangeFull`                              |
| weapons+ammo  | `range.max`             | `rangeMax`                               |
| weapons+ammo  | `range.minMult`         | `rangeMinMult`                           |
| weapons+ammo  | `range.falloff`         | `rangeFalloff`                           |
| weapons       | `reloadSeconds`         | `reloadSeconds`                          |
| armor         | `armorRating`           | `armorRating`                            |
| armor         | `regen.delay`           | `armorRegenDelay`                        |
| armor         | `regen.speed`           | `armorRegenSpeed`                        |
| armor         | `durability`            | `armorDurability`                        |
| weapons       | `recoil`, `spread`      | *(not imported)*                         |
| ammo          | `stack`                 | *(not imported — inventory stack)*       |

## Precedence & contributor edits

- **Datamine is authoritative over the wiki-scrape** for fields it provides: the loader
  overwrites the existing wiki-derived value.
- **Contributor edits still win.** The loader uses the *same* applied-edit lock-map as
  the seed — `buildLockMap` / `omitLocked` / `lockedHits` from `src/lib/seed-curation.ts`
  (already factored out; no refactor required). A field a contributor has edited is
  skipped by the loader, exactly as in `seed.ts`.

### The damage nuance
Damage lives on **ammo**, not weapons (the 72 weapon entries carry no damage). So ammo
items receive real `damage` from `damagePhysical`; weapon pages display damage via their
already-stored ammo pairing (`ammoType`). Weapon `damage` rows are untouched — datamine
has nothing to overwrite them with.

## Loader behaviour (`load-weapon-stats.ts`)

- Reads committed `prisma/weapon-stats.json` (slug-keyed).
- For each slug, resolves the `Entity` (kind `item`) and upserts its `ItemStats`,
  writing only the surfaced columns, minus any locked fields.
- Touches **only** `ItemStats` of matched items. No entity creation, no pruning, no reseed.
- Idempotent. Targets whatever `DATABASE_URL` points at — **run against the dev branch
  first**, then prod (consistent with the loot loader and the "never reseed live DB" rule).
- Reports counts (items updated, fields written, fields skipped due to locks, slugs absent).

### Operational ordering
These are columns `seed.ts` also writes, so the loader must run **after** any seed
(same as the loot loader). Documented in `datamine/README.md`. A later, optional step
can have `seed.ts` import `weapon-stats.json` for fresh-seed consistency — not in this pass.

## NPM scripts

```
weapons:build          => node prisma/build-weapon-stats.mjs
db:load-weapon-stats   => tsx  prisma/load-weapon-stats.ts
```

## Testing

- **Build:** unit-test the reshape/join on a small fixture — id→slug resolution,
  unmatched-id drop, range/regen flattening, bucket→column mapping.
- **Loader:** assert idempotency (run twice, same result) and lock-respecting behaviour
  (a locked field is not overwritten) against the dev branch.
- **Migration:** `prisma migrate dev` applies cleanly; existing rows get NULLs.

## Rollout

1. Land schema migration + pipeline + loader (this pass).
2. `migrate dev` + `weapons:build` + `db:load-weapon-stats` on dev; verify a few items.
3. Prod: `migrate deploy` then `db:load-weapon-stats` against the live DB.
4. Follow-ups (separate passes): UI surfacing; turrets.

## Follow-ups (not this pass)
- **UI:** ammo (damage, range, penetration), weapons (reload, range, paired-ammo damage),
  armor block (rating, durability, regen) on the `EntityDetail` shell.
- **Turrets:** `turret_stats.json` import (fireRate, barrels, clipSize, ammoTypes, velocity).
