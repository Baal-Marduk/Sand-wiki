# Turret ("artillery") stats import + stat UI surfacing

**Date:** 2026-06-18
**Status:** Approved design, pending implementation plan
**Branch:** `feat/weapon-stats-import` (continues the weapon/ammo/armor stats work)
**Author:** Leo Wattier (with Claude)

## Goal

Two deferred follow-ups to the datamined weapon/ammo/armor stats import, landed on the
same branch:

1. **Turrets** — import the 6 turret records from `turret_stats.json` into `ItemStats`,
   reusing the existing build/loader pipeline.
2. **UI** — surface all the new datamined stats (the weapon/ammo/armor fields already
   loaded + the new turret fields) on item detail pages.

## Context (verified)

- The 6 turret records (`turret_stats.json`, keyed `game_packedAutoTurretT2Container` …)
  map **1:1 to existing wiki items by `Entity.id`** — the same id present in
  `prisma/data.json`, the same join key the weapon-stats build already uses. Turrets are
  live items today (type WEAPON, shown under the "artillery" category via the mm-caliber
  rule in `src/lib/taxonomy.ts`); they are simply un-enriched.
- Turret↔ammo pairing **already works** via the caliber-family logic in `src/lib/ammo.ts`
  (40/70/80 mm), surfaced as the "Ammo"/"Used by" tabs. No new links needed.
- Item stats render through `itemStatCells()` in `src/components/StatBox.tsx`, which builds
  a `StatCell[]` consumed by the uniform label/value `StatGrid` (`src/components/StatGrid.tsx`),
  rendered by `EntityDetail`. `src/app/items/[slug]/page.tsx` passes `item.itemStats` into
  `itemStatCells()`.

## Scope

### In scope
- Import `fireRate` + `projectileVelocity` (new columns) and `clipSize`→`magazine`,
  `penetrates`→`penetrates`, `reloadSeconds`→`reloadSeconds` (existing columns) for the 6 turrets.
- 2 new `ItemStats` columns + one additive migration.
- Surface the new stats on item pages by extending `itemStatCells()`.

### Out of scope (explicitly dropped)
- Turret fields **not** imported: `fireInterval` (inverse of fireRate), `variant` (always
  null), `barrels`, `autoRefill`, `spreadIdleMax`, `family`, `tier` (the last two are
  derivable from the item name).
- **No damage cell** on weapon/turret pages — weapons/turrets have no intrinsic damage;
  it lives on ammo (`damage`, already imported) and is surfaced via the existing "Ammo" tab.
- recoil/spread (already dropped in the weapon-stats pass).

## Part 1 — Turret import (extend the existing pipeline)

Turrets fold into the pipeline built for weapons/ammo/armor rather than getting a
parallel one:

```
SEK site/src/data/turret_stats.json
  └─copy→ sand-wiki/datamine/data/turret_stats.json   (committed snapshot)
            └─build (build-weapon-stats.ts also reads it; runs turretPatch)
                       merges into the SAME prisma/weapon-stats.json artifact (slug-keyed)
                                └─load (load-weapon-stats.ts UNCHANGED — writes any StatPatch keys)
```

### `prisma/weapon-stats.ts` additions
- `TurretRaw` interface (fields we read: `fireRate: number | null`, `projectileVelocity:
  number | null`, `clipSize: number | null`, `penetrates: boolean | null`, `reloadSeconds:
  number | null`; other source fields exist but are typed loosely / ignored).
- `TurretStatsFile` interface: `{ turrets: Record<string, TurretRaw> }`.
- `StatPatch` gains optional `fireRate?: number` and `projectileVelocity?: number`.
- `turretPatch(t: TurretRaw): StatPatch` →
  `{ fireRate, projectileVelocity, magazine: clipSize, penetrates, reloadSeconds }`,
  pruned of undefined (same `prune` helper).

### `prisma/build-weapon-stats.ts` additions
- Read `datamine/data/turret_stats.json`, iterate `turrets`, call `turretPatch`, feed
  through the existing `add(id, patch)` (id→slug join + unmatched-drop). All 6 turret ids
  resolve (verified). Artifact item count rises by 6.

### Loader
- Unchanged. The new `fireRate`/`projectileVelocity`/`magazine` keys flow through the
  existing lock-respecting upsert.

## Part 2 — Schema

Add to `model ItemStats` (nullable, additive):
```prisma
fireRate            Float?
projectileVelocity  Float?
```
One migration `turret_stats`. Rollout: dev `migrate dev`; prod (deferred) `migrate deploy`
+ `db:load-weapon-stats`.

## Part 3 — UI (`src/components/StatBox.tsx`)

Extend the `ItemStatFields` interface and `itemStatCells()` with conditional cells,
rendered by the existing `StatGrid`. `page.tsx` passes the extra fields (null defaults).

| Stat | Cell label | Format | Shows when present on |
|---|---|---|---|
| reloadSeconds | Reload | `3.05s` | weapons, turrets |
| range (full/max/minMult/falloff) | Range | `35→150 m`, append ` ·×0.3` only when `rangeFalloff` | weapons, ammo |
| penetrates | Penetrates | `Yes` — cell rendered only when `true` | ammo, turrets |
| armorRating | Armor | `150` | armor |
| armorDurability | Durability | `1400` | armor |
| armorRegenDelay + armorRegenSpeed | Regen | `7/s · 6s delay` (one combined cell) | armor |
| fireRate | Fire rate | `5/s` | turrets |
| projectileVelocity | Velocity | `150 m/s` | turrets |

`magazine` and `damage` already render via existing code (damage on ammo). Range collapses
4 raw fields into one cell; regen collapses 2 into one. Formatting helpers (e.g. a
`formatRange`, `formatRegen`) live alongside `itemStatCells` in `StatBox.tsx`.

### Decided defaults
- **Range** = one combined cell (`35→150 m ·×0.3`), not four cells.
- **penetrates** rendered only when `true` (a `Yes` cell; no "No" clutter).

## Testing

- **`turretPatch`** unit tests in `prisma/weapon-stats.test.ts`: fireRate/velocity mapped;
  `clipSize`→`magazine`; nulls pruned.
- **Build:** re-run `npm run weapons:build`; assert the 6 turret slugs (e.g.
  `game-packed-auto-turret-t2-container`) appear in `prisma/weapon-stats.json` with
  `fireRate`/`projectileVelocity`/`magazine`; confirm re-run is idempotent (no git diff).
- **UI:** unit-test the new `itemStatCells` formatting — range string (with/without
  falloff), regen string, penetrates-only-when-true, fire rate/velocity cells.
- **Loader:** re-run `npm run db:load-weapon-stats` on dev; spot-check a turret
  (`game-packed-auto-turret-t2-container` → fireRate + velocity + magazine populated) and a
  weapon's range rendering.

## Rollout

1. Land turret pipeline + schema + UI on `feat/weapon-stats-import`.
2. Dev: `migrate dev` + `weapons:build` + `db:load-weapon-stats`; verify turret + UI.
3. Prod (deferred, with the weapon-stats prod load): `migrate deploy` + `db:load-weapon-stats`.

## Follow-ups (not this pass)
- Optionally show per-ammo `damage` inline in the "Ammo" tab list (currently name+icon only).
