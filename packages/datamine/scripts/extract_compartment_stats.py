"""Diagnostic probe for walker-compartment gameplay stats (health/weight/energy/...).

CompartmentsDatabase.json is geometry-only (cells/sockets) — it has NO gameplay stats. The
wiki's 120 trampler-part entities carry those stats from sandhelp.io. To datamine them we must
read the stat-bearing MonoBehaviour on each walker_*_epb prefab.

This is DIAGNOSTIC-FIRST: it does not assume the component/field names. It loads the walker
prefab bundle, finds prefabs whose name matches walker_*_epb, and for each prints the
MonoBehaviour component names + their numeric fields. Output -> extracted/json/compartment_stats_probe.json
so the owner can report which component holds health/weight/energy/ratedPower/crewSlots/itemSlots.
The final field mapping is frozen in trampler.ts (CompartmentStat) only after this report.

Run from packages/datamine/:  python scripts/extract_compartment_stats.py
"""
import json, os, re, glob
import UnityPy

AA = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64'
OUT = 'extracted/json/compartment_stats_probe.json'
os.makedirs('extracted/json', exist_ok=True)

EPB = re.compile(r'^walker_.+_epb$')
# Bundles likely to hold walker part prefabs. Broaden if empty.
BUNDLE_GLOBS = ['*walker*', '*compartment*', '*part*', '*epb*']

def candidate_bundles():
    seen = set()
    for g in BUNDLE_GLOBS:
        for p in glob.glob(os.path.join(AA, g + '.bundle')) + glob.glob(os.path.join(AA, g)):
            if p not in seen and os.path.isfile(p):
                seen.add(p); yield p

def numeric_fields(tree, prefix=''):
    """Flatten numeric leaves of a typetree dict (one level of nesting kept via dotted keys)."""
    out = {}
    if not isinstance(tree, dict):
        return out
    for k, v in tree.items():
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out[prefix + k] = v
        elif isinstance(v, dict):
            out.update(numeric_fields(v, prefix + k + '.'))
    return out

probe = {}
for bundle in candidate_bundles():
    try:
        env = UnityPy.load(bundle)
    except Exception as e:
        print(f'  skip {os.path.basename(bundle)}: {e}'); continue
    for o in env.objects:
        if o.type.name != 'GameObject':
            continue
        try:
            go = o.read()
        except Exception:
            continue
        name = getattr(go, 'm_Name', '') or ''
        if not EPB.match(name):
            continue
        comps = {}
        for c in getattr(go, 'm_Components', []):
            try:
                comp = c.read()
            except Exception:
                continue
            if comp.type.name != 'MonoBehaviour':
                continue
            try:
                tt = comp.read_typetree()
            except Exception:
                continue
            nums = numeric_fields(tt)
            if nums:
                comps[getattr(comp, 'm_Name', '') or 'MonoBehaviour'] = nums
        if comps:
            probe[name] = comps

json.dump(probe, open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f'wrote {OUT}: {len(probe)} compartment prefabs with numeric MonoBehaviour fields')
if probe:
    sample = next(iter(probe))
    print(f'sample {sample}:')
    print(json.dumps(probe[sample], indent=1)[:1200])
else:
    print('NO walker_*_epb prefabs with numeric fields found — broaden BUNDLE_GLOBS or inspect bundle names.')
