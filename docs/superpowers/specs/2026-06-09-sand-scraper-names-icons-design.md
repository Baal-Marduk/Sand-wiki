# SAND scraper: display names + item icons — design

**Date:** 2026-06-09
**Status:** approved (brainstorming), pending spec review
**Branch for implementation:** `feat/sand-scraper-impl` (the existing, unmerged scraper)

## Goal

Add two capabilities to the existing SAND scraper:

1. **Display names + descriptions** for every item — real, human-authored names
   (e.g. `item_shotgun` → "Pepper Mill Shotgun"), not id-derived guesses.
2. **Item icons** — PNG images per item, joined to item ids.

These were previously believed to require IL2CPP reverse-engineering. A 2026-06-09
spike proved otherwise for names (see Findings), and chose a pragmatic
match-and-override path for icons.

## Spike findings (2026-06-09)

Investigated the live install at `F:/SteamLibrary/steamapps/common/Sand Playtest`.

- **`global-metadata.dat` is NOT encrypted** (magic `af1b b1fa`, version 31). BattlEye
  does not block the IL2CPP path — but it turns out we don't need it for names.
- **Display names live in the I2 Localization `LanguageSourceData` asset** (`I2Languages`,
  ~3.8 MB, inside `Sand_Data/data.unity3d`). The asset decompresses via UnityPy and its
  term table is plain UTF-8.
- **Convention:** `Items/{itemId}_name`, `Items/{itemId}_description`,
  `Items/{itemId}_shortDescription`. **119 of 121** item ids match a `_name` term verbatim.
  Localized item categories also exist as `Gameplay/item-type-*`.
- **TermData byte layout** (reversed from the blob): `Term` (Unity string) → `Description`
  (Unity string, usually empty) → `Languages` (int32 count + N Unity strings). Unity strings
  are `int32 length + UTF-8 bytes + align-4`. **English is `Languages[0]`** (confirmed:
  Storage/Lager/Stockage…, "Pepper Mill Shotgun"/ru/de/fr…). 8–12 languages present.
- **Icons:** `ui_assets_all.bundle` holds 1205 `Sprite` objects (incl. `icon_item_*`,
  `icon_*`). There is **no data-level item→sprite mapping**; naive name-normalization joins
  only ~33% of items. The addressables `catalog.bin` addresses prefabs/assets, not the
  individual atlas-packed UI sprites. So icons need a curated join, and even full IL2CPP
  typetrees would not guarantee a clean automated mapping.

## Scope & integration

Extend the existing scraper (currently emits `{meta, items[], recipes[]}` with
id-derived names). Two new pieces:

- **Names** (default-on): each emitted item gains `displayName` and `description`.
- **Icons** (opt-in `--icons`): export sprites to PNG + emit an `itemId → iconFile`
  manifest. Kept as a separate output so the wiki consumes it the same way it already
  consumes `data.json` (copy snapshot into the wiki repo).

No IL2CPP toolchain (no dotnet, no Il2CppDumper). No multi-language output in the dataset
yet (parser keeps the array; only English is written — a `languages` knob is future work).

## Components

### `names.py`

- **Locate** the I2 object: load `data.unity3d`, find the MonoBehaviour whose raw blob
  carries the term table (stable marker — e.g. `I2Languages` source name / presence of
  `Items/` term keys).
- **Parse**: walk Unity-serialized strings over the decompressed blob. For every term
  matching `^Items/(.+)_name$`, capture the item id and read the following `Description`
  + `Languages[0]` (English). Also collect `^Items/(.+)_description$` and
  `Gameplay/item-type-*` category labels.
- **Join**: drive off the item ids the scraper already extracts. 119/121 match verbatim.
  Unmatched ids fall back to the existing id-derived name and emit a `WARN` listing them.
- **Output**: `displayName` (real name), `description` per item.

### `icons.py` (opt-in `--icons`)

- **Export**: read `ui_assets_all.bundle`, save every `Sprite` to
  `out/icons/<spriteName>.png` (`sprite.image.save`).
- **Auto-join**: normalize item id ↔ sprite name (strip `item_` / `icon_` /
  `icon_item_` / `resource` prefixes; case/punctuation fold).
- **Override file**: checked-in `icon_overrides.json` = `{itemId: spriteName}`,
  hand-filled for ids that don't auto-match. Overrides take precedence.
- **Output**: `out/icons.json` = `{itemId: "icons/<file>.png"}`, plus a `WARN` count of
  items still without an icon (no silent truncation).

### CLI / config

- New flag: `--icons` (names default-on; `--no-names` escape hatch for recipe-only runs).
- New config keys: `data_unity3d_path`, `icon_overrides_path`, `icons_out_dir`.

## Error handling

- I2 object not found, or 0 `Items/*_name` terms parsed → **hard error** (asset moved).
- Individual term parse failure → skip + `WARN`, do not abort.
- Sprite decode/save failure → skip + `WARN`.
- Item with no name match → id-derived fallback + `WARN`.
- Item with no icon (after auto + overrides) → omitted from manifest + counted in `WARN`.

## Testing

Follows the existing 36-test fixture pattern:

- **Name parse**: trimmed I2 blob fixture with a few known terms, including one non-ASCII
  translation and one empty-description term; assert exact `id → English name`.
- **Override precedence**: override beats auto-match.
- **Normalization**: unit test for the id↔sprite normalizer.
- **Fallback**: unmatched id yields derived name + warning.

## Out of scope (YAGNI)

- Multi-language dataset output (parser retains the data; not written).
- IL2CPP dumping / typetree generation.
- Tech tree, delivery contracts, equipment stats (unchanged from prior findings).
