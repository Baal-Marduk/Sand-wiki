# SAND bundle schema findings (spike, 2026-06-08/09)

Investigated the real install at `F:/SteamLibrary/steamapps/common/Sand Playtest` (a **Playtest** build).
Probe scripts: `sand-scraper/scripts/spike.py`, `scripts/probe_tech.py`, `scripts/probe_loc.py`.

## TypeTrees

**Embedded — no Il2CppDumper needed.** UnityPy `read_typetree()` returns full fields for the data
objects below. One adaptation was required: MonoBehaviour `m_Script` PPtrs use `m_FileID=1` into
`sand_monoscripts.bundle`, so class names are resolved by pre-building a
`MonoScript path_id -> m_ClassName` map from that bundle (see `spike.py:load_script_names`).

## What IS cleanly extractable (v1 scope)

### Items — `CheatItemDefinitionsData` (bundle: configuration)
One object, field `Items[]`, 121 entries of `{Name, Type, StorageStack}`:
- `Name` — internal id, e.g. `item_shotgun`, `Old_Jacket`. **The join key used by recipes.**
- `Type` — enum **string**: `WEAPON, AMMO, ARMOR, RESOURCE_T1, RESOURCE_T2, RESOURCE_T3, KEY, FOOD, MONEY, ...`
- `StorageStack` — int stack size.
- **Derived:** `isResource = Type.startswith("RESOURCE_")`.
- No display name, no workbench level, no craft time, no unlock fields on items.
- The "Cheat" name is a concern, but no other item-definition object exists in the scanned bundles;
  treat it as the authoritative catalog and **union it with all recipe-referenced ids** (stubs for
  ids it lacks, e.g. `Old_Jacket`, `ArtefactCrystal`).

### Recipes — `CraftingRecipeBundle` (bundle: craftingrecipes, 4 objects)
- `m_Name` encodes workbench + tier: `Recipes_<Workbench>_Workbench_T<n>` (e.g. `Recipes_Utility_Workbench_T1`).
- `recipes[]`, each: `{ inputIngredients[], outputIngredients[], craftingTimeSeconds }`.
- Ingredient = `{ itemId: <string>, amount: <int> }`. **Items referenced by string id, not PPtr.**
- `craftingTimeSeconds` is a float.
- Workbench tier is attached to an item when that item appears as a recipe **output**.

## What is NOT extractable (dropped or deferred)

- **Tech tree — dropped.** Scanned `ui`, `configuration`, `clientconfiguration`, `defaultlocalgroup`.
  The `ProgressionTree*` / `ResearchNode*` family is UI scaffolding only: `ResearchNodeInfo.nodeConnections`
  is an empty `[]`, "price" fields are PPtrs to UI widgets, no node ids/costs/edges anywhere. Topology
  and costs are populated at runtime (server/IL2CPP), not shipped as assets. (`scenes` 614MB unscanned;
  holds the same data-empty view classes, very unlikely to differ.)
- **Display names — derive from ids.** Game uses the **I2 Localization** plugin; the string table
  (`LanguageSourceData`) lives in `data.unity3d` behind IL2CPP-stripped types UnityPy cannot deserialize,
  and the item-id -> term mapping is compiled C# (`*EntityNameLocalizationKeyDataExtension`). Not feasible
  in an addressables+UnityPy pipeline. v1 derives names from ids (strip `item_`/`RESOURCE_` prefix, split
  camelCase/underscores, title-case). Real names would need AssetRipper/Il2CppDumper + RE — future work.
- **Equipment stats — none.** Only `EquipmentPhysicsInfo` (recoil/sway physics), no game stats.
- **Loot sets — deferred.** 97 `LootSet` objects, but `maxSpawnedItems` keys are category **bitmasks**
  needing the IL2CPP enum to be meaningful.
- **Delivery contracts — deferred to v1.1.** `WorldContractsConfig` holds real economy data (required
  item + count -> reward tiers) but is **Odin-serialized** (`serializationData.SerializedBytes` binary
  blob), so it needs an Odin deserializer — out of scope for v1.

## v1 output shape (see spec §8-revised)

`{ meta, items[], recipes[] }` — items keyed/joined by id; recipes carry inputs/outputs/time + workbench/tier.
No `techNodes`. This differs from the original wiki seed contract and the wiki spec will need revising.

## Kept fixtures (`sand-scraper/tests/fixtures/`)
- `itemdefs_cheatItemDefinitions.json` — `CheatItemDefinitionsData` (121 items, incl. RESOURCE_* cases).
- `recipe_utility_workbench_t1.json` — `CraftingRecipeBundle` (`Recipes_Utility_Workbench_T1`; includes
  outputs not in the catalog: `Old_Jacket`, `ArtefactCrystal` — exercises the stub path).
- `recipe_armament_workbench_t1.json` — `CraftingRecipeBundle` (`Recipes_Armament_Workbench_T1`).
