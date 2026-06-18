# Unified Datamining Pipeline — Design

**Date:** 2026-06-18
**Sub-project:** #2 of the SandLabs restructure (see `docs/ROADMAP.md`)
**Status:** Approved (design), pending spec review

## Context

Sub-project #1 (Foundation) made the wiki read entities from committed static JSON
(`packages/data/generated/{entities,recipes,links}.json`). That JSON was produced by a
**one-time export of the production database**, which in turn had been populated by a
tangle of wiki-scrape scripts, manual curation, and partial SEK datamine imports. There is
no repeatable way to regenerate the artifact for a new game build — which is the whole
point of going static.

This sub-project builds that repeatable pipeline: `packages/datamine`, which regenerates
the wiki artifact from the game's files, covering **all four entity kinds** (items,
environment, trampler parts, tech nodes) plus recipes, cross-reference links, icons/art,
and multi-language names.

### Reference implementations

- **SEK** (`Sitting-in-a-towel/sand-expedition-kit`, cloned locally at `sek/`) — a working,
  per-release Unity datamining pipeline (Python + UnityPy + Il2CppDumper). Its
  `datamine/UPDATE_PIPELINE.md` already regenerates every dataset on a new build, emitting
  `site/src/data/*.json` (items, parts_v2, research_nodes, recipes, loot_sources, locations,
  weapon_stats, turret_stats, localization, plus art). The wiki already consumes SEK's loot
  and weapon outputs today.
- **downloadpizza/SandTools** — the upstream Python IL2CPP/Ghidra extractor that produces
  the authoritative I2 localization (`i2_terms_en.json`) and item defs SEK vendors from.

### Key decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| Data sourcing | **Vendor SEK's extraction scripts** into `packages/datamine` (full ownership, no runtime dependency on the SEK repo). |
| Extraction entry point | **Full extraction** — the user has the game files and runs UnityPy/Il2CppDumper each release (incl. the 22 June 2026 release build). |
| Transform language | **TypeScript** — imports `@sandlabs/data` types so the output is compile-time-guaranteed to match `Entity`/`Recipe`/`EntityLink`. Extraction/build/art stay Python. |
| Icon/art scope | **Full** — item sprites + part/location/container thumbnails + part meshes (the meshes seed sub-project #3). |
| Translations | **Extract all locales into the artifact (data only).** EN stays primary `name`/`description`; an optional per-entity `i18n` map carries the rest. Wiki UI stays English; a language switcher is a later spec. |

## Goals

- One command path regenerates `packages/data/generated/{entities,recipes,links}.json`
  from the game files, for all four entity kinds.
- All upstream extraction is **vendored** (in-repo, owned), runnable end-to-end by the user.
- **Existing wiki slugs are preserved** (URLs and links must not break).
- Each regeneration produces a **diff report** against the prior committed artifact for
  human review — never a blind overwrite.
- Item/part/location/container **art** regenerates per release.
- **All game locales** are extracted and carried in the artifact (EN primary).

## Non-Goals

- The wiki **language-switcher UI** (translations are data-only this spec).
- Sub-project #3 (trampler builder) — though this spec produces the part meshes it will need.
- CI/automation of the pipeline — it is a documented manual per-release run.
- Re-deriving the entire prior DB curation history; curation that the datamine can't
  reproduce is captured as committed **overrides**, not migrated row-by-row.

## Architecture

Three stages, each independently runnable. The committed SEK-shape datasets are the
re-run boundary, so the wiki artifact regenerates without game files.

```
GAME FILES (copy under packages/datamine/gamefiles/, gitignored)   ← user provides per release
  │  [vendored SEK extract_*.py + art]  (Python, UnityPy/Il2CppDumper; needs game files)
  ▼
packages/datamine/extracted/  (intermediate, gitignored)
  │  [vendored SEK build_*.py]  (Python; from extracted/)
  ▼
packages/datamine/sek-out/*.json  (SEK-shape datasets — COMMITTED: items, parts_v2,
  │                                research_nodes, recipes, loot_sources, locations,
  │                                weapon_stats, turret_stats, localization-all-locales)
  │  [OUR transform]  (TypeScript; from sek-out/ + overrides/)
  ▼
packages/data/generated/{entities,recipes,links}.json   (the wiki artifact — COMMITTED)
  + apps/wiki/public/{icons,parts,locart,containers}/    (art — COMMITTED)
  + packages/data/generated/mesh_index.json              (for sub-project #3)
```

- **Stage 1 — extract** (Python, needs game files): game bundles → `extracted/` intermediates
  (item defs, loot spawners, compartments DB, progression descriptions, I2 localization
  all-locales) + the **art** outputs (icons, thumbnails, meshes).
- **Stage 2 — build** (Python, from `extracted/`): the vendored SEK `build_*.py` reshape
  intermediates into the SEK-shape datasets in `sek-out/` (committed).
- **Stage 3 — transform** (TypeScript, from `sek-out/` + `overrides/`): normalize into the
  wiki's `entities/recipes/links` model, reconcile slugs, attach i18n, emit + diff.

A `--skip-art` flag on the orchestrator skips the slow Stage-1 art steps when game files
haven't changed.

## Components

### `packages/datamine/` layout

```
packages/datamine/
  gamefiles/                # gitignored — COPY of Sand_Data + GameAssembly.dll (never the live install)
  tools/il2cppdumper/       # vendored Il2CppDumper (or documented external)
  scripts/                  # vendored SEK Python: extract_*.py, build_*.py, odin_parser.py,
                            #   render_*_thumbs.py, export_part_meshes_v3.py, build_localization.py
  extracted/                # gitignored intermediates
  sek-out/                  # COMMITTED SEK-shape datasets (the transform's input)
  overrides/                # COMMITTED wiki-specific overrides (JSON)
  transform/                # OUR TypeScript transform (see below)
  requirements.txt          # UnityPy, numpy, Pillow
  package.json              # tsx + vitest for the transform; datamine:* scripts
  UPDATE_PIPELINE.md        # full per-release runbook (SEK-style)
  README.md
```

### Vendored Python (Stages 1–2) — copied from SEK, adapted

Data: `dump_bundle_json.py`, `odin_parser.py`, `extract_loot_spawners.py`,
`build_loot_sources.py`, `scan_location_prefabs.py`, `build_location_contents.py`,
`extract_compartments_db.py`, `build_parts_v2.py`, `extract_progression_descriptions.py`,
`build_research_nodes.py`, `build_site_data.py`, `extract_weapon_stats.py` /
`build_weapon_stats.py`, `extract_turret_stats.py` / `build_turret_stats.py`.

Localization: `build_localization.py` **modified to extract all locales** from the I2
`LanguageSourceAsset` (today it vendors EN only). Output: `sek-out/localization.json`
keyed by term → `{ en, fr, de, … }`.

Art: `extract_icons.py`, `render_part_thumbs.py` (+ `render_thumbs_v2.py`),
`render_location_thumbs.py`, `render_container_thumbs.py`, `export_part_meshes_v3.py`.
Image/mesh binaries land under `apps/wiki/public/` (`icons/`, `parts/`, `locart/`,
`containers/`, `meshes/`); the mesh manifest is written to
`packages/data/generated/mesh_index.json` (a data artifact, consumed by sub-project #3).

> Adaptation needed: SEK scripts hardcode `../site/src/data` and `H:\…` paths. The vendored
> copies are repointed to `packages/datamine/sek-out/` and `apps/wiki/public/`, made
> path-robust (resolve relative to script location), and the gamefiles path is read from a
> `$GAMEFILES` env var (default `packages/datamine/gamefiles`).

### TypeScript transform (Stage 3) — the new wiki-specific code

Under `packages/datamine/transform/`, small single-purpose modules:

- **`reconcile.ts`** — id→slug resolution. SEK uses multiple id namespaces (items are
  PascalCase like `ArtefactCrystal`; recipes/loot use `item_resourceFabricScraps`). This
  resolves every datamined id to a wiki slug by matching against the **current committed
  `entities.json` baseline** (normalized name/id), so existing slugs/URLs are preserved.
  Unmatched ids get a generated slug; ambiguities/known mismatches are resolved by
  `overrides/slug-map.json`. Emits a reconciliation report (matched / new / conflicting).
- **`items.ts` / `parts.ts` / `research.ts` / `locations.ts`** — one per kind: SEK dataset →
  `Entity` (+ `itemStats` / `tramplerStats` / `techNodeStats`). `items.ts` folds in
  `weapon_stats` + `turret_stats`; `parts.ts` reads compartments/parts_v2; `research.ts`
  reads research_nodes; `locations.ts` reads locations + location_contents.
- **`recipes.ts`** — SEK recipes → `Recipe` rows (inputs/outputs resolved to slugs).
- **`links.ts`** — derive `EntityLink` rows for every role:
  - `loot` ← loot_sources (tier/effort cells → tier + chance);
  - `cost` ← part build costs;
  - `tech-prereq` / `tech-unlock-cost` / `tech-unlocks` ← research nodes;
  - `requires-key` / `rewards-key` ← location key data;
  - `buy-cost` / `buy-yield` / `buy-unlock` ← **the gap**: SEK has no buy data, so these are
    derived from research unlocks plus a committed `overrides/buy-options.json` (carrying the
    coin-trade data the old wiki had).
- **`i18n.ts`** — joins `sek-out/localization.json` (all locales) onto each entity as the
  optional `i18n` map; sets EN as the primary `name`/`description`.
- **`overrides/`** — committed JSON: `slug-map.json` (id→slug fixes, merges, display names),
  `exclusions.json` (datamined ids that aren't real entities), `field-overrides.json`
  (rarity/name/description corrections the datamine gets wrong), `buy-options.json`.
- **`emit.ts`** — assembles the three artifact files, validates against the `@sandlabs/data`
  types (compile-time + a runtime shape check), writes them.
- **`diff.ts`** — compares freshly-built artifact vs the prior committed one; prints a report
  (entities added/removed/changed, link counts per role, slug changes) and exits non-zero if
  anything would **remove or rename an existing slug** unless `--allow-slug-changes` is passed.
- **`run.ts`** — orchestrator: `tsx transform/run.ts [--skip-art] [--allow-slug-changes]`.

### Schema change in `@sandlabs/data`

`Entity` gains one optional, backward-compatible field:

```ts
export interface LocalizedText { name: string; description: string | null }

export interface Entity {
  // …all existing fields unchanged…
  name: string;            // EN, primary (unchanged)
  description: string | null;
  i18n?: Record<string, LocalizedText>;  // NEW — locale code → translated name/description
}
```

The wiki keeps rendering EN; nothing in `queries.ts` changes. The `i18n` data is present for
a future language-switcher spec. The store's round-trip test is extended to tolerate the new
optional field.

## Data flow & mapping (SEK shape → wiki model)

| Wiki target | SEK source | Notes |
|---|---|---|
| `Entity` kind `item` | `items.json` (`id,name,icon,rarity,type,pawnValue,desc`) + `weapon_stats` + `turret_stats` | rarity enum (e.g. `NOTEWORTHY`) mapped to wiki rarity names; `type` flags → category. |
| `ItemStats` | weapon/turret stats + item def | reload/range/armor/ammo/etc. as today. |
| `Entity` kind `trampler-part` + `TramplerStats` | `parts_v2.json` + compartments DB | dimensions/health/energy/slots/research fields. |
| `Entity` kind `tech-node` + `TechNodeStats` | `research_nodes.json` / `research_tree.json` | faction/tier/sortOrder. |
| `Entity` kind `environment` | `locations.json` + `location_contents.json` + loot containers | category loot-containers/landmarks/etc. |
| `Recipe` (+ inputs/outputs) | `recipes.json` | item ids resolved to slugs via `reconcile`. |
| `EntityLink` | loot_sources, part costs, research, location keys, overrides (buy) | see `links.ts` roles above. |
| `Entity.i18n` | `localization.json` (all locales) | EN promoted to primary. |
| `Entity.icon` / images | art outputs in `public/` | path set by transform to the rendered file. |

## Error handling & validation

- **Fail loud:** every Python extractor already prints what it found; a "NOT FOUND" (bundle
  moved between builds) aborts that stage with a clear message rather than emitting empty data.
- **Slug safety:** `diff.ts` refuses to emit if an existing slug would disappear or change,
  unless explicitly allowed — the single most important guard (protects URLs + links).
- **Baseline diff:** the run always prints an added/removed/changed report vs the prior
  committed artifact; large/unexpected deltas are reviewed before committing.
- **Shape validation:** `emit.ts` validates output against `@sandlabs/data` types; the
  Plan-1 round-trip integrity test (every recipe/link slug resolves; slugs unique) runs as
  the final gate.

## Testing

- **Transform unit tests (vitest, in `packages/datamine/transform/*.test.ts`):** each of
  `reconcile`, `items`, `parts`, `research`, `locations`, `recipes`, `links`, `i18n` tested
  against small SEK-shape fixtures, asserting the produced `Entity`/`Recipe`/`EntityLink`
  shapes, slug reconciliation (including a deliberate alias + a new-entity case), and i18n
  attachment.
- **Buy-options derivation** tested against a fixture + a sample `buy-options.json` override.
- **Diff guard** tested: a removed/renamed slug fixture makes `diff.ts` exit non-zero.
- **Python build scripts** keep their vendored SEK tests where present (e.g.
  `test_build_container_loot.py`).
- **Regression gate:** running the transform on the committed `sek-out/` reproduces an
  artifact whose entity/recipe/link counts and slugs match the current committed baseline
  within a reviewed diff (the first run establishes the reconciled baseline).

## Rollout

1. Scaffold `packages/datamine` (Python env + TS transform package + docs).
2. Vendor + repoint SEK Python scripts (data, localization-all-locales, art).
3. Build the TS transform module-by-module (reconcile first — it underpins everything),
   each TDD against fixtures.
4. First full run from committed `sek-out/` → diff against the current baseline; reconcile
   slug mismatches via overrides until the diff is clean/explained; commit the regenerated
   artifact + `i18n` + art.
5. Add the `i18n` field to `@sandlabs/data`; extend the round-trip test.
6. Write `UPDATE_PIPELINE.md` (the per-release runbook, incl. the 22 June release build).
7. (User, on release day) run the full Stage-1 extraction against the release install,
   then Stages 2–3, review the diff, commit.

### Risks

- **Slug churn between game builds** — mitigated by reconcile-against-baseline + the diff
  guard; new/renamed game ids surface as a review item, resolved via `overrides/slug-map.json`.
- **SEK script path/bundle assumptions** — the vendored scripts need repointing and may
  break when bundle names shift between builds (SEK's own after-update checklist documents
  this); the runbook carries those notes.
- **Buy-options fidelity** — SEK lacks buy data; the override file must carry what the old
  wiki had. The current committed `links.json` (buy-* roles) is the source to seed it from.
- **Art pipeline weight** — slow + RAM-heavy; `--skip-art` keeps the routine data re-run fast.
- **Locale completeness** — some terms may lack non-EN translations; `i18n` entries are
  per-locale optional and omitted when absent (EN always present).
