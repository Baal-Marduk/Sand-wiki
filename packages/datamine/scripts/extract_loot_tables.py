"""Extract the world loot tables -> extracted/json/loottables_{voyage,storm}.json.

The per-world-mode loot tables live in configuration_assets_all.bundle as two
Odin-serialized MonoBehaviours:
    conf_worldLootTablesVoyageConfig
    conf_worldLootTablesStormConfig
Each holds an Odin blob in serializationData.SerializedBytes that decodes to
    {"_lootTables": {"$items": [ {lootTableId, items:{$items:[{itemBlueprint,countMin,countMax}]}}, ... ]}}
which is exactly the shape build_loot_sources.py / build_site_data.py consume.

These tables are the authoritative per-build loot source data (drop composition +
count ranges). Re-run this every build, then diff sek-out/loot_tables.json to see
what the devs rebalanced across ALL ~197 tables (not just the 8 player-facing
containers that container_loot.json surfaces).

Run from packages/datamine/:  python scripts/extract_loot_tables.py
"""
import sys, os, json
import UnityPy
sys.path.insert(0, os.path.dirname(__file__))
import odin_parser

AA = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64'
BUNDLE = os.path.join(AA, 'configuration_assets_all.bundle')
TARGETS = {
    'conf_worldLootTablesVoyageConfig': 'extracted/json/loottables_voyage.json',
    'conf_worldLootTablesStormConfig': 'extracted/json/loottables_storm.json',
}

os.makedirs('extracted/json', exist_ok=True)
env = UnityPy.load(BUNDLE)
found = {}
for o in env.objects:
    if o.type.name != 'MonoBehaviour':
        continue
    try:
        tt = o.read_typetree()
    except Exception:
        continue
    name = tt.get('m_Name', '') if isinstance(tt, dict) else ''
    if name not in TARGETS:
        continue
    sd = tt.get('serializationData') if isinstance(tt, dict) else None
    sb = sd.get('SerializedBytes') if isinstance(sd, dict) else None
    if not sb:
        print(f'WARNING: {name} has no serializationData.SerializedBytes — skipped')
        continue
    doc = odin_parser.decode(sb)
    out = TARGETS[name]
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=1, ensure_ascii=False, default=str)
    tables = (doc.get('_lootTables') or {}).get('$items') if isinstance(doc, dict) else None
    n = len(tables) if tables else 0
    found[name] = n
    print(f'{name} -> {out}  ({n} tables)')

missing = [t for t in TARGETS if t not in found]
if missing:
    print(f'NOT FOUND in {os.path.basename(BUNDLE)}: {", ".join(missing)} '
          '— bundle layout may have shifted this build.')
