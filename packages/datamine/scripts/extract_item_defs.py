"""Diagnostic extractor for the FULL item database -> extracted/json/item_defs.json.

build_site_data.py loads extracted/json/item_defs.json to enrich items (icon, rarity, type,
pawnValue) but nothing produced it — so item enumeration fell back to loot∪recipes (99 items)
and ~48 vendor/quest/world items were invisible.

This script finds the item-config asset(s) (ScriptableObjects / TextAssets carrying the item
list) in the StreamingAssets bundles, prints EVERY candidate (name + field keys) so the owner
can confirm the right source, and writes {id: {name, icon, rarity, type, pawnValue}}.

Run from packages/datamine/:  python scripts/extract_item_defs.py
Bundle names shift between builds — if nothing is found, inspect the printed candidate list and
update BUNDLE_GLOBS / the field picks below, then report findings.
"""
import json, os, glob
import UnityPy
import odin_parser  # sibling module (scripts/ is on sys.path when run as `python scripts/...`)

AA = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64'
OUT = 'extracted/json/item_defs.json'
os.makedirs('extracted/json', exist_ok=True)

# Bundles most likely to hold the item config. `configuration_assets_all` is where SandTools
# (downloadpizza/SandTools, bundle/extract_data.py) reads SAND's config MonoBehaviours; we try
# it first, then broaden. Broaden further if the asset moved between builds.
BUNDLE_GLOBS = ['*configuration*', '*config*', '*item*', '*inventory*', '*shared*', '*database*', 'data.unity3d']

def candidate_bundles():
    seen = set()
    for g in BUNDLE_GLOBS:
        for p in glob.glob(os.path.join(AA, g + '.bundle')) + glob.glob(os.path.join(AA, g)):
            if p not in seen and os.path.isfile(p):
                seen.add(p); yield p

# Field-name aliases — game configs vary; we probe several and report which hit.
ID_KEYS    = ['id', 'itemId', 'm_Name', 'name', 'identifier']
ICON_KEYS  = ['icon', 'iconName', 'sprite', 'iconId']
RARITY_KEYS = ['rarity', 'itemRarity', 'rarityType']
TYPE_KEYS  = ['type', 'itemType', 'category']
VALUE_KEYS = ['pawnValue', 'sellValue', 'value', 'price']

def pick(d, keys):
    if not isinstance(d, dict):
        return None
    # case-insensitive: SAND's CheatItemDefinitionsData uses PascalCase (Name/Type/StorageStack).
    lower = {k.lower(): k for k in d}
    for want in keys:
        actual = lower.get(want.lower())
        if actual is not None and d[actual] not in (None, ''):
            return d[actual]
    return None

def walk_items(obj):
    """Yield dict-like item records from a parsed MonoBehaviour/TextAsset tree."""
    if isinstance(obj, dict):
        # a list of items under some key?
        for k, v in obj.items():
            if isinstance(v, list) and v and isinstance(v[0], dict) and pick(v[0], ID_KEYS):
                yield from v
            else:
                yield from walk_items(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk_items(v)

defs = {}
found_sources = []
for bundle in candidate_bundles():
    try:
        env = UnityPy.load(bundle)
    except Exception as e:
        print(f'  skip {os.path.basename(bundle)}: {e}'); continue
    for o in env.objects:
        if o.type.name not in ('MonoBehaviour', 'TextAsset'):
            continue
        try:
            d = o.read()
        except Exception:
            continue
        name = getattr(d, 'm_Name', '') or ''
        tree = None
        if o.type.name == 'TextAsset':
            raw = d.m_Script if isinstance(d.m_Script, bytes) else str(d.m_Script).encode('utf-8', 'surrogateescape')
            try: tree = json.loads(raw.decode('utf-8-sig', 'replace'))
            except Exception: continue
        else:
            try: tt = o.read_typetree()
            except Exception: continue
            # SAND ScriptableObjects are Odin-serialized: the real item fields live in the
            # serializationData.SerializedBytes blob, NOT the Unity typetree (which only shows
            # the Odin envelope). Decode the blob with odin_parser; fall back to the typetree
            # for plain (non-Odin) MonoBehaviours. (Lesson from SEK's odin_parser + SandTools.)
            sd = tt.get('serializationData') if isinstance(tt, dict) else None
            sbytes = None
            if isinstance(sd, dict):
                sbytes = sd.get('SerializedBytes') or sd.get('serializedBytes')
            if sbytes:
                try: tree = odin_parser.decode(sbytes)
                except Exception: tree = tt
            else:
                tree = tt
        recs = list(walk_items(tree))
        if not recs:
            continue
        print(f'CANDIDATE {os.path.basename(bundle)} :: {name or o.type.name} -> {len(recs)} records; sample keys: {sorted(recs[0].keys())[:12]}')
        for r in recs:
            iid = pick(r, ID_KEYS)
            if not iid:
                continue
            defs[str(iid)] = {
                'name': pick(r, ID_KEYS[1:]) or None,
                'icon': pick(r, ICON_KEYS),
                'rarity': pick(r, RARITY_KEYS),
                'type': pick(r, TYPE_KEYS),
                'pawnValue': pick(r, VALUE_KEYS),
            }
        found_sources.append(f'{os.path.basename(bundle)}::{name}')

json.dump(defs, open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f'\nwrote {OUT}: {len(defs)} item defs from {len(found_sources)} source(s)')
print('sources:', found_sources)
if not defs:
    print('NO ITEM DEFS FOUND — broaden BUNDLE_GLOBS or inspect the CANDIDATE lines above.')
