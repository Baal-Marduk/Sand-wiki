# SAND Game-File Scraper — Design Spec

**Date:** 2026-06-08
**Status:** Approved (design); pending written-spec review
**Related:** `docs/superpowers/specs/2026-06-08-sand-wiki-design.md` (consumer of this scraper's output)

## 1. Goal

Produce a re-runnable tool that extracts crafting, item, and tech-tree data directly from
the installed game files of *SAND: Raiders of Sofia* and emits a single `data.json` that the
wiki's existing `prisma/seed.ts` ingests (via `SEED_FILE`).

This replaces the wiki spec's earlier placeholder decision ("user provides structured data")
with an automated source of truth that can be re-run after each game patch.

## 2. Source-of-truth findings (investigated 2026-06-08)

Game install: `F:\SteamLibrary\steamapps\common\Sand Playtest`.

- **Engine:** Unity, **IL2CPP** backend (`GameAssembly.dll` + `Sand_Data/il2cpp_data/Metadata/global-metadata.dat`).
  Type definitions are recoverable from the metadata if needed.
- **Asset system:** Unity **Addressables**. Data ships as named bundles under
  `Sand_Data/StreamingAssets/aa/StandaloneWindows64/`.
- **Relevant bundles** (the data lives here as serialized ScriptableObjects / `MonoBehaviour`s):
  - `craftingrecipes_assets_all.bundle` (~2.7 KB — recipes reference items by ID, not embedded)
  - `configuration_assets_all.bundle` (~120 MB — likely the item/definition catalog)
  - `clientconfiguration_assets_all.bundle` (~60 KB)
  - `equipment_assets_all.bundle` (~14 MB — equipment stats)
  - `lootsets_assets_all.bundle` (~7 KB — loot tables)
- `sand_monoscripts.bundle` carries the MonoScript definitions (class names for `m_Script` PPtrs).

> The exact ScriptableObject field names are **not yet known** — they are discovered in the
> spike (§7) and the transform mapping is written test-first against the captured fixtures.

## 3. Scope

**In scope (chosen during brainstorming — "wiki data + likely-useful extras"):**

- **Core (feeds the wiki schema today):** items, crafting recipes, workbench levels, craft times,
  unlock conditions, and the tech tree (per-node resource costs + prerequisites).
- **Extras (captured now, used later):** equipment stats, loot tables, item descriptions/categories.

**Out of scope:**

- Extracting protected assets (images, audio, 3D models) — none are stored or exported.
- Decoding unrelated bundles (biomes, VFX, colliders, terrain, scenes, geometry, walkers).
- Any change to the wiki's Prisma schema. Extras are stored under a separate JSON key the
  current `seed.ts` ignores.

## 4. Approach

**Approach A — Python + UnityPy pipeline** (chosen over AssetRipper-CLI and a custom
AssetsTools.NET app). Rationale: single language, lightweight, fully re-runnable
(`python -m sand_scraper`), and it emits the seed file directly with no inter-tool glue.

**Typetree fork:** IL2CPP `MonoBehaviour`s need their field layout to decode.
- If the bundles ship **embedded TypeTrees**, UnityPy's `read_typetree()` works with zero extra
  tooling. **(Determined in the spike, §7.)**
- If TypeTrees are **stripped**, run **Il2CppDumper** once on `GameAssembly.dll` +
  `global-metadata.dat` to recover type info and feed it to UnityPy. This path is implemented
  only if the spike shows it is needed.

## 5. Architecture & project layout

A standalone sibling project at the repo root, independent of `sand-wiki/`:

```
sand-scraper/
  pyproject.toml            # runtime dep: UnityPy; dev: pytest
  README.md                 # run instructions; how to re-run after a game patch
  config.toml               # game install path, target bundle list, output path
  src/sand_scraper/
    __init__.py
    cli.py                  # `python -m sand_scraper [--strict] [--raw] [--validate]`
    extract.py              # UnityPy: bundles -> raw MonoBehaviour dicts + PPtr index
    typeinfo.py             # typetree handling; Il2CppDumper fallback (only if stripped)
    transform.py            # raw dicts -> seed schema + extras (PURE, unit-tested)
    schema.py               # TypedDicts for the output contract
    emit.py                 # assemble + slugify + stable-sort -> data.json
  tests/
    test_transform.py       # pure tests over committed fixtures
    fixtures/               # a few real raw objects captured during the spike
  out/                      # data.json + raw/ dumps (gitignored)
```

## 6. Data flow (three stages)

1. **Extract** (`extract.py`) — UnityPy loads each target bundle. For every `MonoBehaviour`:
   read its typetree into a dict, record its class name (resolve the `m_Script` PPtr → MonoScript),
   and its `m_Name`. Build a **`(fileID, pathID) → object` index** so recipe→item and
   tech-cost→resource references resolve across bundles.
2. **Transform** (`transform.py`) — the pure core (no I/O). Maps the game's item / recipe / tech
   classes onto the wiki schema, resolves PPtr references to slugs, and pulls the extras. All
   business logic that can be unit-tested lives here.
3. **Emit** (`emit.py`) — slugify names, **stable-sort by slug** (so diffs across game versions are
   clean), stamp the `meta` block, write `data.json`.

## 7. Implementation step 1: the spike

Before writing the mapping, a short spike de-risks the unknowns:

1. Load `craftingrecipes_assets_all.bundle` with UnityPy.
2. Confirm whether **TypeTrees are embedded** (decides whether Il2CppDumper is needed at all).
3. Dump one recipe object and one item object to JSON; inspect the real field names.
4. Save those as `tests/fixtures/` inputs. The transform mapping is then written test-first
   against them.

## 8. Output contract (forward-compatible)

The core keeps **exactly** the shape `sand-wiki/prisma/seed.ts` already ingests
(`{ items: [...], techNodes: [...] }`), with two additions: a `meta` block and an `extras` block.

```jsonc
{
  "meta": {
    "gameVersion": "<read from boot.config / data.unity3d>",
    "scrapedAt": "<ISO timestamp>",
    "sourceBundles": ["craftingrecipes_assets_all.bundle", "..."]
  },
  "items": [
    {
      "slug": "scrap-rifle", "name": "Scrap Rifle", "type": "weapon",
      "workbenchLevel": 2, "craftTimeSeconds": 30,
      "unlockConditions": "...", "unlockedBy": "basic-weapons",
      "recipe": [{ "ingredient": "iron-plate", "quantity": 3 }],
      "imageAlt": null, "isResource": false
    }
  ],
  "techNodes": [
    {
      "slug": "basic-weapons", "name": "Basic Weapons", "description": "...",
      "costs": [{ "resource": "iron-ore", "quantity": 10 }],
      "prerequisites": ["metalworking"]
    }
  ],
  "extras": {
    "equipment": [ /* equipment stats */ ],
    "lootSets":  [ /* loot tables */ ]
  }
}
```

`seed.ts` reads `items` and `techNodes` only; `meta` and `extras` are ignored today and consumed
when the wiki schema grows in phase 2. No Prisma schema change is required now.

## 9. Output handoff to the wiki

- The scraper writes to `sand-scraper/out/data.json` (gitignored build artifact).
- A reviewed snapshot is copied into `sand-wiki/prisma/data.json` and committed as the dataset the
  wiki seeds from (`SEED_FILE=prisma/data.json npm run db:seed`). This replaces the plan's
  placeholder `sample-data.json`. The manual review step aligns with the wiki brief's
  "manual relecture before integration" principle.

## 10. Error handling

- **Missing game path / bundle** → clear message listing the expected files and location.
- **Stripped typetrees** → fall back to Il2CppDumper-generated type info; if not yet set up, an
  actionable error describing the one-time setup.
- **Schema drift after a patch** (renamed/removed fields) → `transform` validates required fields
  and **reports which objects failed** rather than silently dropping them. Default warns and
  continues; `--strict` exits non-zero (catches breakage after a game update).
- **Dangling references** (recipe → missing item, cost → missing resource) → warned with the
  offending id; never a silent drop.

## 11. Testing

- **Pure unit tests** (pytest) over the committed fixture objects → assert correct seed output,
  including PPtr reference resolution and a diamond/duplicate-reference case. Runs without the
  game installed (CI-friendly).
- **Integration smoke check** (`python -m sand_scraper --validate`) against the real install:
  asserts non-zero item/tech counts and that the emitted JSON matches the `schema.py` contract.
  Auto-skips when game files are absent.

## 12. Re-runnability

- One command: `python -m sand_scraper` (reads `config.toml`).
- Output is stable-sorted and stamped with `meta.gameVersion`, so re-running after a patch yields
  a clean, reviewable diff against the previous `data.json`.

## 13. Open items to confirm during implementation

- Whether TypeTrees are embedded (resolved by the §7 spike).
- The actual ScriptableObject class names and field names for items / recipes / tech nodes
  (resolved by the spike; mapping written against the real fixtures).
- Where the game version string is reliably readable (`boot.config` vs. `data.unity3d` header).
