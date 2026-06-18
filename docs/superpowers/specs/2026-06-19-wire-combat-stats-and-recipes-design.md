# Wire combat stats + recipes into the transform

**Date:** 2026-06-19
**Status:** Approved (brainstorming) — ready for implementation plan
**Sub-project:** #2 Unified datamining pipeline, pass 4 (wire the unwired datasets)
**Branch:** `feat/monorepo-static-foundation`
**Predecessors:** `2026-06-18-datamine-completeness-design.md` (items + trampler health). Context: `docs/data-provenance.html`.

## Problem

The TS transform consumes only 4 of the 15 datamine datasets. Two high-value, already-extracted
datasets ride the frozen baseline instead of refreshing per patch:
- **Item combat stats** (`itemStats`) — `sek-out/weapon_stats.json` (weapons/ammo/armor) +
  `sek-out/turret_stats.json` (turrets) exist but the transform never reads them. 135/136 items
  carry baseline `itemStats` that don't auto-update.
- **Recipes** — `sek-out/recipes.json` (30 crafting recipes) exists; the transform passes the 39
  baseline recipes through untouched.

Wiring both makes them genuine per-patch datamine. Both inputs are currently **playtest-era**, so
this pass also **regenerates them from the release build** (the files are now in `gamefiles/`).

## Scope (decided)

- **IN:** `itemStats` merge (weapon/turret/ammo/armor), `recipes` merge (Recipe model), and
  release-build regeneration of those inputs.
- **OUT (deferred — see `memory/datamine-deferred.md`):** the 233 `cost` links (trampler-part
  build costs, server-side-likely), locations caps/contents, entity name-refresh, i18n, parts
  geometry, tech tree.

## Architecture

Two new transform modules following the established merge-over-baseline pattern (`items.ts`,
`trampler.ts`): reconcile SEK item ids → wiki slugs by **reusing the existing `rec.bySekId` map**
the item enumeration already builds (no new reconciliation), refresh only datamine-provided
fields, preserve baseline extras, and let the existing slug-safety diff guard protect the run.

```
combat-stats.ts : weapon_stats {weapons,ammo,armor} + turret_stats {turrets}
                  -> ItemStats patch per item -> merge over baseline entity.itemStats
recipes.ts      : recipes.json [{workbench,tier,inputs,outputs,seconds}]
                  -> Recipe[] -> merge over baseline recipes (preserve baseline-only + report)
```

Both wired into `run.ts` after the item merge / before emit. Freshness comes from §4
(regenerate `sek-out/` from the release build before the real run).

### Component 1 — `combat-stats.ts`

Loaders `loadWeaponStats()` / `loadTurretStats()` (read `sek-out/weapon_stats.json` /
`turret_stats.json`; return empty shapes if absent, so the step is a no-op when missing).

`combatPatch(entry)` builds a `Partial<ItemStats>` with only the fields the datamine provides:

| Source | → ItemStats |
|---|---|
| ammo `damagePhysical` | `damage` |
| ammo/weapon `range.full` / `.max` / `.minMult` / `.falloff` | `rangeFull` / `rangeMax` / `rangeMinMult` / `rangeFalloff` |
| ammo/turret `penetrates` | `penetrates` |
| ammo `stack[-1]` (max-tier stack) | `storageStack` |
| weapon `reloadSeconds` | `reloadSeconds` |
| turret `fireRate` | `fireRate` |
| turret `projectileVelocity` | `projectileVelocity` |
| turret `clipSize` | `magazine` |
| armor rating/regen fields | `armorRating` / `armorRegenDelay` / `armorRegenSpeed` / `armorDurability` |

(`null`/absent values are omitted so the baseline value is kept. Baseline-only fields the datamine
never carries — `ammoType` caliber string, `statType`, `workbenchTier`, `ammoName`,
`playerDamage`, `tramplerDamage`, `splashDamage` — are preserved.)

`mergeCombatStats(baseline, weapons, ammo, armor, turrets, bySekId)`:
- For each baseline `item` entity, collect patches from every sub-map whose SEK id reconciles to
  that slug (an item can appear in more than one map, e.g. an ammo that is also turret ammo →
  patches merge, later-listed wins per field).
- Apply the merged patch over `entity.itemStats` (spread over existing; if the baseline had
  `itemStats: null` but a patch exists, create a fresh `ItemStats` with nulls + the patch).
- Items with no datamine entry are untouched.

The armor sub-map's exact field names are confirmed against the regenerated
`weapon_stats.json.armor` during the plan (the playtest sample showed `weapons`/`ammo`/`armor`
keys; armor field names verified before the mapping is frozen).

### Component 2 — `recipes.ts`

`loadRecipes()` reads `sek-out/recipes.json`. `toRecipe(raw, bySekId)` builds a `Recipe`:
- `workbench` = raw.workbench, `tier` = raw.tier, `craftTimeSeconds` = raw.seconds,
  `locationSlug` = null.
- `inputs`/`outputs`: map each `{item, amount}` → `{itemSlug: bySekId.get(canonicalSekId(item)),
  amount}`; drop (with a warning) any line whose item id doesn't reconcile to a known slug.
- `slug`: deterministic `recipe-<workbench>-t<tier>-<primaryOutputSlug>` (lower-kebab); on
  collision append `-2`, `-3`.

`mergeRecipes(baselineRecipes, datamined)`:
- Index baseline by slug. For each datamined recipe, replace the baseline recipe with the same
  slug, else append.
- **Preserve baseline-only recipes** (not produced by the datamine) and record them in
  `reports/missing-recipes.json` (~9 expected).
- Returns the merged `Recipe[]` for `writeArtifact`.

Does **not** touch `EntityLink`s — the 233 `cost` links (trampler-part build costs) are out of
scope and pass through from the baseline unchanged.

### `run.ts` wiring

After the trampler step, before loot/emit:
```
const combat = mergeCombatStats(withTrampler, loadWeaponStats()..., loadTurretStats()..., rec.bySekId)
...later: writeArtifact(combat, mergeRecipes(baseline.recipes, recipeList), links)
```
Both behind the same "empty input → pass through" guard so an absent/empty dataset is a no-op.
Log refreshed counts. Reuse `canonicalSekId` for id alignment with `rec.bySekId` (which is keyed
by canonical id).

## Data flow

```
release game files ──(extract+build, §4)──▶ sek-out/{weapon_stats,turret_stats,recipes}.json
                                                      │
rec.bySekId (item enumeration) ───────────────────────┤
                                                      ▼
   combat-stats.ts mergeCombatStats ──▶ entity.itemStats   recipes.ts mergeRecipes ──▶ recipes.json
                                                      │                                   │
                                                      └──────────▶ writeArtifact ◀─────────┘
```

## §4 — Regeneration from the release build (prerequisite for the real run)

The merge must run against release-build data, not the committed playtest `sek-out/`. Order:
- **itemStats:** `extract_weapon_stats.py` → `build_weapon_stats.py`; `extract_turret_stats.py` →
  `build_turret_stats.py`. Verify each script's source bundle resolves on the release build
  (every extractor prints what it found; "NOT FOUND" = bundle moved → repoint).
- **recipes:** `build_site_data.py` produces `recipes.json` (and refreshes `items.json`/
  `locations.json`). It needs `extracted/json/craftingrecipes.json` (+ loottables/lootsets/
  item_defs). **Dependency:** confirm a vendored extractor produces `craftingrecipes.json` from
  `craftingrecipes_assets_all.bundle`; if none exists, write a small one (UnityPy, same pattern as
  `extract_compartments_db.py`) as part of this work.

The author runs the extractors (game files present), reviews the transform diff, and commits the
regenerated `sek-out/` inputs + artifact **only after** confirming it's a refresh, not a
regression.

## Testing & safety

- **TDD vitest fixtures** for `combat-stats.ts` and `recipes.ts` (small committed sample JSON →
  assert mapping, patch-omits-nulls, multi-map merge, recipe slug/reconcile/merge-preserve).
  Testable now, independent of regeneration.
- Existing round-trip + `apps/wiki` build stay green.
- Slug-safety diff guard unchanged; restore `packages/data/generated/` from HEAD before each
  verification run (baseline-accumulation hazard).
- **Never commit a transform run made against stale playtest inputs** — commit only after §4
  regeneration.
- Test command (Windows): `cd packages/datamine && npm test` (the `--workspace` form is broken
  here).

## Out of scope

`cost` links (part build costs), locations caps/contents, entity name-refresh, i18n, parts
geometry, tech tree, trampler weight/energy. Tracked in `memory/datamine-deferred.md`.

## Risks

- **Stale-overwrite:** merging playtest `sek-out` over a newer baseline would regress data — fully
  mitigated by §4 (regenerate first) + the never-commit-stale rule.
- **`craftingrecipes.json` extraction missing:** may require a new extractor (bounded; same UnityPy
  pattern). Flagged so the plan can confirm-or-write it.
- **Armor field names unverified:** the armor sub-map mapping is frozen against the regenerated
  `weapon_stats.json` before wiring (diagnostic-first, as with compartment stats).
- **Recipe item-id reconciliation gaps:** unknown ids are dropped-with-warning, not invented;
  surfaced in the run log for review.
