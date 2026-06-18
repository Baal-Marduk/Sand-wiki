# Datamine completeness — items registry + trampler stats

**Date:** 2026-06-18
**Status:** Approved (brainstorming) — ready for implementation plan
**Sub-project:** #2 Unified datamining pipeline, pass 2 (completeness)
**Branch:** `feat/monorepo-static-foundation`
**Predecessors:** `2026-06-18-unified-datamining-pipeline-design.md` (vendor SEK + TS transform, DONE)

## Problem

The transform keeps 48 baseline items that the datamine never reproduces
(`reports/missing-from-datamine.json`): turret kits, island keys, alarm lock boxes,
elemental ammo (fire/toxic/armor), tools/gadgets, special weapons. They are not lost
(merge-preserve keeps the baseline), but they do not auto-refresh per game patch — the
opposite of the "regenerate everything per release, no manual updates" goal.

**Root cause (confirmed, not a missing bundle):** `scripts/build_site_data.py` enumerates
items from the union of *loot tables ∪ crafting recipes* (99 ids). Any item that is neither
looted nor crafted (vendor-bought, quest, world-placed) is invisible. `item_defs.json` (the
authoritative item config) is only used to *enrich* matched items, not to *enumerate*, and
no vendored script even produces it (loaded under `try/except FileNotFoundError: pass`).

**Key enabler:** the complete-enough registry is already extracted. `sek-out/localization.json`
holds **249 item ids** (vs 99 emitted), including the missing keys, turret kits, elemental
ammo, lock boxes, multitool, flare gun, smoke grenade. A handful (binoculars, flashlight) are
absent even from localization and need the true ItemDatabase.

Separately, **trampler stats** (health/weight/energy/ratedPower/crewSlots on the 120 walker
`part` entities) are NOT in `CompartmentsDatabase` (geometry-only) nor any bundle we extract.
The baseline values carry `researchNode`/`researchName`/`researchTier` — a tell that they were
originally scraped from sandhelp.io, kept today via merge-preserve. Datamining them requires a
new extractor against the `walker_*_epb` prefab MonoBehaviours.

## Scope (decided)

- **Items completeness** — IN.
- **Parts geometry** — already done (`parts_v2.json`), unchanged.
- **Trampler stats** — IN, diagnostic-first.
- **Tech tree (edges/costs), multi-locale i18n, art pipeline, recipes, locations** — OUT (deferred).

## Architecture

Two halves, split by what is testable now (committed data) vs. gated on the owner's game files.

| Volet | Now (testable) | Gated on game files |
|---|---|---|
| Items | enumerate from `localization.json` + variant dedup + reconcile (~46/48) | `extract_item_defs.py` (full ItemDatabase → rarity/pawnValue + binoculars/flashlight) |
| Parts geometry | done | — |
| Trampler stats | transform mapping + fixture tests | `extract_compartment_stats.py` (prefab MonoBehaviours) |

**Directing principle:** every source is enumerated from a complete registry, never
back-derived from usage.

### Component 1 — Item enumeration (`scripts/build_site_data.py`)

1. **Enumeration source** = `localization.items` (249) ∪ `item_defs.json` (when present) ∪
   loot ∪ recipes. No game-known item omitted.
2. **Localization structure adapter** — `localization.json` is now nested
   `{id:{locales:{en:{name,short,desc}}}}`; `build_site_data` still reads `loc.get('name')`
   (flat) → latent bug. Fix the read to `loc['locales']['en']`.
3. Output `items.json` grows from 99 toward ~249 (minus collapsed variants).

### Component 2 — Variant dedup (transform)

Encoded + tested rules over SEK item ids:
- `_Melee` (27) / `_Ranged` (26) → **same item** (usage modes) → collapse to one canonical id.
- `_Fire` / `_Toxic` / `_Armor` / `_highVelocity` / `_EMP` / `_slug` / `_explosive` /
  `_highPenetration` / `_longRange` / `_lowRecoil` / `_delayedDetonation` / `_interiorExplosion`
  → **distinct wiki items** (missing report wants them separate, e.g. `pistol-ammo-fire`) → keep.

### Component 3 — Reconcile/merge (existing pipeline, unchanged logic)

New ids flow through the existing `reconcile` → match by name (case-insensitive) → baseline
slug, else `overrides/slug-map.json`, else new entity. The ~46 expected ids match baseline
slugs by name (e.g. `game_keyIslandDoorRed` → "Red Key" → `game-key-island-door-red`), so they
**enrich** baseline entities, not duplicate them. `missing-from-datamine.json` drops 48 → ~2.
The slug-safety diff guard still refuses slug removals.

### Component 4 — Diagnostic extractors (gated on game files)

Same pattern as `extract_compartments_db.py`: first print all candidate assets + fields, the
owner runs once and reports output, then we freeze the mapping against real data.

**`extract_item_defs.py`** — reads the item-config bundle via UnityPy (TextAssets/
ScriptableObjects), prints candidates, writes `extracted/json/item_defs.json` =
`{id:{name,icon,rarity,type,pawnValue,...}}`. This is the file `build_site_data.py` already
loads but nothing produces. Yields authoritative rarity/pawnValue/icon + the items absent from
localization.

**`extract_compartment_stats.py`** — iterates `walker_*_epb` prefabs, dumps MonoBehaviour
component names + numeric candidate fields → `extracted/json/compartment_stats_probe.json`
(diagnostic). Work loop: owner runs → pastes output → mapping frozen → final run writes
`extracted/json/compartment_stats.json`.

`UPDATE_PIPELINE.md` updated with both steps + "INSPECT" notes. All script comments in English
for the next scrape.

### Component 5 — Trampler transform (`transform/trampler.ts`, new, symmetric to `items.ts`)

- `loadCompartmentStats()` loads `compartment_stats.json` when present.
- `tramplerPatch(stat)` emits only datamine-provided fields (health, weight, weightCapacity,
  weightCompensation, energyConsumption, energyCapacity, ratedPower, crewSlots, itemSlots);
  `researchNode/researchName/researchTier` stay baseline (tech tree, out of scope).
- `mergeTrampler(baseline, stats, byEpbId)` refreshes the 120 matched part entities by
  `walker_*_epb` id, preserves baseline where datamine lacks a field (merge-over-baseline).
- Reconcile parts by epb id (deterministic, not by name).
- `run.ts` adds the trampler step after items, behind a **file-absent guard**: if
  `compartment_stats.json` is missing, log "trampler stats: source absent, baseline preserved"
  and continue. Nothing breaks before the extractor has been run.

## Data flow

```
extract (gated)        build (Python)              transform (TS, now)
─────────────          ───────────────             ───────────────────
item_defs.json ──┐
localization ────┼──▶ build_site_data.py ──▶ items.json ──▶ reconcile/dedup/merge ──▶ entities.json
loot ∪ recipes ──┘                                                                       (+ missing report 48→~2)

compartment_stats.json ──▶ (passthrough) ──▶ trampler.ts mergeTrampler ──▶ entities.json
                                              (guard: skip if source absent)
```

## Testing strategy (owner runs extraction; author cannot)

- **Vitest unit tests on committed fixtures**: sample localization/item_defs/compartment_stats
  JSON → assert enumeration, variant dedup, patches, merge-preserve, reconcile. Fixtures are
  ground truth (as with the localization regex bug fixed by test).
- Existing **round-trip** test (16) and **wiki build** stay green.
- **Clean re-run**: restore `packages/data/generated/` from the pre-run commit before each
  verification transform (baseline-accumulation hazard).
- **Not author-verifiable**: real Python extractor output against the bundles — owner's loop
  (diagnostic → report → frozen mapping).

## Out of scope (documented for later)

- Tech tree edges/costs — later pass.
- Multi-locale i18n — stays EN until other `i2_terms_<locale>` extracted.
- Art pipeline / 3 remaining null icons.
- Recipes & locations — unchanged (already complete).

## Risks

- **localization ≠ true ItemDatabase**: localization may include non-inventory terms or miss a
  few items. Mitigated by union with `item_defs.json` + the missing report surfacing residue.
- **Variant dedup misclassification**: a suffix wrongly collapsed/kept. Mitigated by explicit
  tested rules + the diff guard catching unexpected slug churn.
- **Trampler field names unknown until probe**: diagnostic-first removes the guesswork; mapping
  frozen only against real output.
