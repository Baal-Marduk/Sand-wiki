# UPDATE PIPELINE — regenerate all data for a new SAND build

Run on a machine with a **copy** of the game files (never the live install). Needs
Python 3 + `pip install -r requirements.txt`, and Il2CppDumper in `tools/il2cppdumper/`.
All commands run from `packages/datamine/`.

## 0. Refresh the file copy
Copy `<install>/Sand_Data` and `<install>/GameAssembly.dll` into `gamefiles/`.

## 1. Class reference (only for new investigations)
Il2CppDumper on `gamefiles/GameAssembly.dll` + `gamefiles/Sand_Data/il2cpp_data/Metadata/global-metadata.dat`
-> `extracted/il2cpp_dump/dump.cs`.

## 2. Extract -> build (order matters)
```bash
python scripts/extract_icons.py
python scripts/extract_loot_spawners.py
python scripts/build_loot_sources.py
python scripts/scan_location_prefabs.py
python scripts/build_location_contents.py
python scripts/extract_compartments_db.py        # -> extracted/json/compartments_database.json (INSPECT for stats — see note)
python scripts/extract_compartment_stats.py      # -> extracted/json/compartment_stats_probe.json (DIAGNOSTIC — see note)
python scripts/build_parts_v2.py
python scripts/extract_progression_descriptions.py
python scripts/build_research_nodes.py
python scripts/build_research_tree_from_sandhelp.py
python scripts/extract_weapon_stats.py && python scripts/build_weapon_stats.py
python scripts/extract_turret_stats.py && python scripts/build_turret_stats.py
# localization: obtain per-locale i2_terms_<locale>.json (re-extract I2Languages, all langs) into extracted/json/
python scripts/build_localization.py             # -> sek-out/localization.json (all locales)
python scripts/extract_item_defs.py              # -> extracted/json/item_defs.json (full ItemDatabase — see note)
python scripts/build_site_data.py                # items, recipes -> sek-out/
python scripts/build_container_loot.py
```

> **Trampler stats note:** after `extract_compartments_db.py`, inspect
> `extracted/json/compartments_database.json` for health/weight/energy/slot fields. If
> present, the Plan-2 transform maps them; if absent, the transform falls back to the
> committed baseline. Report findings so the mapping can be wired.

> **Item completeness:** `extract_item_defs.py` writes `extracted/json/item_defs.json` (the full
> ItemDatabase). `build_site_data.py` now enumerates items from item_defs ∪ localization ∪ loot ∪
> recipes — so vendor/quest/world items (turret kits, keys, elemental ammo) appear. If
> `item_defs.json` is absent, enumeration still unions localization (≈249 items). The TS transform
> additionally drops loc-only ids that don't match a baseline entity (localization enriches, never
> mints new wiki pages); genuinely-new items come from the curated item_defs/items.json.

> **Trampler stats (datamine):** `extract_compartment_stats.py` is a DIAGNOSTIC probe →
> `compartment_stats_probe.json`. Inspect it, report which MonoBehaviour field maps to each
> TramplerStats key (health/weight/energy/ratedPower/crewSlots/itemSlots), then the mapping is
> frozen and `sek-out/compartment_stats.json` is produced (keyed list with a `name` per the
> localized compartment name). Until then the transform preserves baseline (sandhelp) stats. Match
> is by compartment name → baseline slug (overrides/part-slug-map.json for drift).

## 3. Art (slow, ~GBs RAM)
```bash
python scripts/render_part_thumbs.py
python scripts/render_thumbs_v2.py
python scripts/render_location_thumbs.py
python scripts/render_container_thumbs.py
python scripts/export_part_meshes_v3.py      # -> apps/wiki/public/meshes + packages/data/generated/mesh_index.json
```

## 4. Transform -> wiki artifact (Plan 2)
```bash
# from repo root
npx tsx packages/datamine/transform/run.ts        # -> packages/data/generated/*.json + diff report
```
Review the diff (especially slug changes), then commit the regenerated artifact + art.

## 5. After-update checklist
- Bundle names can shift between builds — every extractor prints what it found; "NOT FOUND" = asset moved.
- Re-verify slug reconciliation overrides (`transform/overrides/slug-map.json`) against the diff.
- dump.cs TypeDefIndexes shift — re-dump before trusting old line numbers.
