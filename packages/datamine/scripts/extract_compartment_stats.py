"""Extract walker-compartment gameplay stats -> sek-out/compartment_stats.json.

CompartmentsDatabase.json is geometry-only. The real per-compartment stats live on the
walker_*_epb prefabs (epb_assets_all.bundle) as an Odin-serialized Entitas component list in
each prefab MonoBehaviour's serializationData.SerializedBytes blob.

Investigation (2026-06-18, release build) found the ONLY gameplay-stat component carrying a
usable number is HealthDataComponent.value (matches/【corrects】 the wiki baseline health).
PhysicsDataComponent.mass is a physics constant (1.0 / 400.0), NOT the gameplay weight, so it
is intentionally NOT emitted. weight / energy / ratedPower / crewSlots / itemSlots are NOT on
the prefabs — they live in a balance/research config not yet located (TODO: hunt it down; until
then the transform keeps those baseline/sandhelp values).

Each record is matched to the wiki entity BY NAME via the localized compartment name
(localization.json `compartments`, keyed by blueprintName). Output feeds transform/trampler.ts
(mergeTrampler), which refreshes only the provided fields and preserves the rest.

Run from packages/datamine/:  python scripts/extract_compartment_stats.py
"""
import sys, os, json, re
import UnityPy
sys.path.insert(0, os.path.dirname(__file__))
import odin_parser

AA = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64'
BUNDLE = os.path.join(AA, 'epb_assets_all.bundle')
LOC = 'sek-out/localization.json'
OUT = 'sek-out/compartment_stats.json'

# localized compartment names, keyed by blueprintName (e.g. walker_compCargo_SmallM_Metal_1x1)
loc = {}
try:
    loc = json.load(open(LOC, encoding='utf-8')).get('compartments', {})
except FileNotFoundError:
    print(f'WARNING: {LOC} missing — run build_localization.py first (names will be blank)')

def en_name(blueprint):
    v = loc.get(blueprint)
    if v:
        return v.get('locales', {}).get('en', {}).get('name')
    return None

env = UnityPy.load(BUNDLE)
objs = {o.path_id: o for o in env.objects}

by_name = {}            # compartment name -> record (dedup by name)
conflicts = []          # (name, healths) when one name has divergent health
scanned = 0
for o in env.objects:
    if o.type.name != 'GameObject':
        continue
    try:
        go = o.read(); goname = getattr(go, 'm_Name', '') or ''
    except Exception:
        continue
    # buildable compartments only (comp*) — these are the wiki trampler-part entities
    if not goname.startswith('walker_comp'):
        continue
    for cp in getattr(go, 'm_Components', []):
        pid = getattr(cp, 'm_PathID', None) or getattr(cp, 'path_id', None)
        co = objs.get(pid)
        if not co or co.type.name != 'MonoBehaviour':
            continue
        try:
            tt = co.read_typetree()
        except Exception:
            continue
        sd = tt.get('serializationData') if isinstance(tt, dict) else None
        sb = sd.get('SerializedBytes') if isinstance(sd, dict) else None
        if not sb:
            continue
        blueprint = tt.get('blueprintName') or goname.removesuffix('_epb')
        try:
            doc = odin_parser.decode(sb)
        except Exception:
            continue
        comps = doc.get('components', {})
        items = comps.get('$items', []) if isinstance(comps, dict) else []
        health = None
        for c in items:
            if isinstance(c, dict) and 'HealthDataComponent' in (c.get('$type') or ''):
                health = c.get('value')
                break
        if health is None:
            continue
        scanned += 1
        name = en_name(blueprint)
        if not name:
            continue
        hval = int(health) if float(health).is_integer() else health
        prev = by_name.get(name)
        if prev is None:
            by_name[name] = {'epbId': blueprint, 'name': name, 'health': hval}
        elif prev['health'] != hval:
            # Same localized name covers multiple distinct parts with different health — the
            # wiki entity is matched BY NAME, so we can't tell which variant it is. Drop the
            # name entirely (keep the baseline/sandhelp health) rather than write a wrong value.
            conflicts.append((name, prev['health'], hval, blueprint))

# Exclude every name that had a health collision — only unambiguous health is trustworthy.
collided = {c[0] for c in conflicts}
records = sorted((r for r in by_name.values() if r['name'] not in collided), key=lambda r: r['name'])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(records, open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f'wrote {OUT}: {len(records)} compartments with health (scanned {scanned} comp prefabs)')
if conflicts:
    print(f'NOTE: {len(conflicts)} name-collisions (same localized name, different health) — first kept:')
    for n, a, b, bp in conflicts[:15]:
        print(f'  {n!r}: kept {a}, also saw {b} ({bp})')
if not records:
    print('NO compartment health found — check bundle/odin decode or localization compartment names.')
