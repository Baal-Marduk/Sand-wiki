"""Build source-level loot data for the site's containers spreadsheet.

The game's model (verified against GameAssembly.dll, LootSetupDataComponent.RollEntry
@ 0x4A1A960): a container holds ONE `LootSetupDataComponent` whose `entries` is a weighted
pool. Opening it rolls exactly one entry -- `total = Sum(e => e.Chance)`, then a cumulative
walk -- and grants EVERY item in the winning table (`LootItemData` has no per-item chance).
So `chance` is a WEIGHT, not a percentage, and a container's real contents are one *set*,
not the union of every set it could roll.

This emits both views:

  variants[] -- the truth. One entry per real entity = one real roll pool, with its sets,
                each set's weight/probability and its own exact per-item quantities.
  cells{}    -- the legacy per-item rollup ("chance any single open yields this item"),
                kept for the summary table. Quantity ranges here are merged across sets and
                are flagged `merged` when they span more than one set's range.

Output: sek-out/loot_sources.json
"""
import json, os, re, sys
from collections import defaultdict

entity_loot = json.load(open('extracted/json/entity_loot.json', encoding='utf-8'))
voy = json.load(open('extracted/json/loottables_voyage.json', encoding='utf-8'))['_lootTables']['$items']
sto = json.load(open('extracted/json/loottables_storm.json', encoding='utf-8'))['_lootTables']['$items']

tables = {}
for mode, lst in (('voyage', voy), ('storm', sto)):
    for t in lst:
        e = tables.setdefault(t['lootTableId'], {})
        e[mode] = [
            {'item': i['itemBlueprint'], 'min': i['countMin'], 'max': i['countMax']}
            for i in t['items']['$items']
        ]

# ---- source definitions: entity pattern -> display name -----------------------------
# Named groups: `tier` (game tier 1-3), `eff` (low/mid/high placement effort).
# Order matters: first match wins.
#
# Only entities that can actually drop something need a rule here. Entities whose loot
# tables no longer exist are skipped by is_live() before matching, so they need neither a
# pattern nor an exclusion entry -- see is_live(). Adding rules for them would be a list of
# hand-written exceptions that has to be maintained forever and silently rots when the game
# renames something.
SOURCES = [
    (r'^game_armyBox_t(?P<tier>\d)_(?P<eff>low|mid|high)Effort$', 'Weapons Crate'),
    (r'^game_armyBox_resupplyAmmo$',                  'Weapons Crate (Ammo Resupply)'),
    (r'^game_armyBox_resupplyWeapons$',               'Weapons Crate (Weapon Resupply)'),

    (r'^game_foodBox_t(?P<tier>\d)_(?P<eff>low|mid|high)Effort$', 'Food Crate'),
    (r'^game_partsBox_t(?P<tier>\d)_(?P<eff>low|mid|high)Effort$', 'Resource Crate'),
    (r'^game_medicalCabinet_t(?P<tier>\d)_(?P<eff>low|mid|high)Effort$', 'Medical Cabinet'),
    (r'^game_safeMiddle_t(?P<tier>\d)_(?P<eff>low|mid|high)Effort$', 'Safe'),

    (r'^game_shellsBox_t(?P<tier>\d)_(?P<eff>low|mid|high)Effort$', 'Shell Box'),
    (r'^game_shellsBox_t(?P<tier>\d)_resupply$',      'Shell Box (Resupply)'),

    (r'^item_ironcladContainer(?P<mm>\d+)mm$', 'Ironclad Loot Box'),
    (r'^item_containerBox_1L$',                'Ironclad Loot Box'),

    (r'^game_buriedTreasure$',           'Buried Treasure'),
    (r'^game_aurogenCrystal(?P<n>\d)$',  'Aurogen Crystal'),
    (r'^game_navalMine$',                'Naval Mine'),
    (r'^game_navalMineOriginalScale$',   'Naval Mine (Original Scale)'),
]

sources = {}
matched_entities = set()


def src(name):
    return sources.setdefault(name, {'name': name, 'cells': {}, 'variants': [], 'mandatory': []})


def cell_of(source, tier, effort):
    # The placement-effort dimension (and the un-suffixed base entity) share one tier cell:
    # players cannot tell a low-effort crate from a high-effort one by looking at it.
    s = src(source)
    key = f'{tier or 0}|{effort or ""}'
    return s['cells'].setdefault(key, {'tier': tier, 'effort': effort, 'sets': []})


def set_rows(entries, entity):
    """Weighted pool -> per-set rows. Normalised WITHIN this entity, because one entity is
    one roll: RollEntry sums Chance over exactly this list."""
    flat = []
    for e in entries:
        if e.get('tableId'):
            flat.append(e)
        elif e.get('set'):
            # LootTableSetEntry: a nested group that competes at this level as a unit.
            # Unused by every entity in the current build; kept so a future patch that
            # introduces one is not silently dropped.
            flat.append(e)
    if not flat:
        return []          # mandatory-only entity; there is no roll pool to normalise
    total = sum((e.get('chance') or 0) for e in flat)
    if total <= 0:
        print(f'  WARN {entity}: entry weights sum to {total}; treating sets as equal',
              file=sys.stderr)
        total = len(flat) or 1
        for e in flat:
            e['chance'] = 1
    out = []
    for e in flat:
        tid = e.get('tableId')
        if not tid:
            print(f'  WARN {entity}: nested LootTableSetEntry not modelled; skipped',
                  file=sys.stderr)
            continue
        w = e.get('chance') or 0
        out.append({
            'tableId': tid,
            'weight': w,
            'pct': round(100.0 * w / total, 2),
            'voyage': tables.get(tid, {}).get('voyage') or [],
            'storm': tables.get(tid, {}).get('storm') or [],
            'known': tid in tables,
        })
    # Short display label: drop the prefix every set in THIS pool shares, so buried
    # treasure reads "T1 set1 / T2 set1" rather than two identical "set1"s.
    parts = [s['tableId'].split('_') for s in out]
    common = 0
    while parts and all(len(p) > common + 1 for p in parts) and \
            len({p[common] for p in parts}) == 1:
        common += 1
    for s, p in zip(out, parts):
        s['label'] = ' '.join(p[common:]) or s['tableId']
    return out


def is_live(data):
    """Can this entity drop anything this build defines?

    Some EPBs still carry a LootSetupDataComponent from before a rename, pointing at loot
    tables that no longer exist in conf_worldLootTables{Voyage,Storm}Config -- e.g.
    game_partsBox_t1 -> "resource_container_T1_set1", superseded by the per-effort
    "resource_container_lowEffort_T1_set1". They still appear in world spawn data, but they
    resolve to nothing, so they cannot contribute a single item.

    Deciding this here, BEFORE requiring a SOURCES pattern, is what keeps the config free of
    hand-written exceptions: a dead entity needs no pattern and no exclusion entry, because
    a thing that does not exist causes no problems. Only entities that can actually drop
    something have to be named."""
    ok = lambda rows: any(e.get('tableId') in tables for e in rows)
    return ok(data['entries']) or ok(data['mandatory'])


dead_entities = sorted(e for e, d in entity_loot.items() if not is_live(d))

for ent, data in sorted(entity_loot.items()):
    if not is_live(data):
        continue
    for pat, source in SOURCES:
        m = re.match(pat, ent)
        if not m:
            continue
        matched_entities.add(ent)
        g = m.groupdict()
        tier = int(g['tier']) if g.get('tier') else None
        effort = g.get('eff')
        entries = [e for e in data['entries'] if e.get('tableId') or e.get('set')]
        mand = [e.get('tableId') for e in data['mandatory'] if e.get('tableId')]

        # Truthful view: this entity is its own roll pool.
        src(source)['variants'].append({
            'entity': ent, 'tier': tier, 'effort': effort,
            'sets': set_rows(entries, ent),
            # Guaranteed alongside the roll, not part of it (e.g. the Ironclad box's Alloy
            # Steel, the Aurogen Crystal's only drop). Some entities have ONLY these.
            'mandatory': [{'tableId': t, 'known': t in tables,
                           'voyage': tables.get(t, {}).get('voyage') or [],
                           'storm': tables.get(t, {}).get('storm') or []} for t in mand],
        })
        # Legacy rollup view: pooled into the (tier, effort) cell.
        cell_of(source, tier, effort)['sets'].extend(entries)
        for x in mand:
            if x not in src(source)['mandatory']:
                src(source)['mandatory'].append(x)
        break

if dead_entities:
    print('skipped %d entities whose loot tables no longer exist in this build:'
          % len(dead_entities), file=sys.stderr)
    for ent in dead_entities:
        print('  %s' % ent, file=sys.stderr)

# Only entities that CAN drop something have to be named. Dead ones are already gone, so
# this never asks anyone to write a rule for a table that no longer exists.
missing = sorted(set(entity_loot) - matched_entities - set(dead_entities))
if missing:
    raise SystemExit(
        'build_loot_sources: %d entities can drop loot but match no SOURCES pattern, so they\n'
        'would vanish from the catalog silently. Add a pattern for each:\n  %s'
        % (len(missing), '\n  '.join(missing)))

# Mob drops: tables exist but no entity weights -> equal weights per sub-group.
mob_groups = defaultdict(list)
for tid in tables:
    m = re.match(r'mobLoot_([a-zA-Z]+)_set(\d+)', tid)
    if m:
        mob_groups[m.group(1)].append(tid)
MOB_LABEL = {'ghoulMelee': 'melee mob', 'ghoulRange': 'ranged mob', 'ghoulMeleeShovel': 'melee mob (tool)'}
for grp, tids in sorted(mob_groups.items()):
    entries = [{'tableId': t, 'chance': 1} for t in sorted(tids)]
    label = MOB_LABEL.get(grp, grp)
    cell_of('Mob Drops', None, label)['sets'].extend(entries)
    src('Mob Drops')['variants'].append(
        {'entity': f'mobLoot_{grp}', 'tier': None, 'effort': label,
         'sets': set_rows(entries, f'mobLoot_{grp}')})


# ---- rollup: per mode, item -> pct + merged count range ----
def compute(cell, mode):
    total = sum((s.get('chance') or 0) for s in cell['sets'])
    if total <= 0:
        total = len(cell['sets']) or 1
    items, known_sets = {}, 0
    for s in cell['sets']:
        tid = s.get('tableId')
        content = tables.get(tid, {}).get(mode) if tid else None
        if content is None:
            continue
        known_sets += 1
        ch = (s.get('chance') or 0) / total
        for it in content:
            e = items.setdefault(it['item'], {'pct': 0, 'min': it['min'], 'max': it['max'],
                                              'ranges': set()})
            e['pct'] += ch
            e['min'] = min(e['min'], it['min'])
            e['max'] = max(e['max'], it['max'])
            e['ranges'].add((it['min'], it['max']))
    out = [
        {'item': k, 'pct': round(v['pct'] * 100, 1), 'min': v['min'], 'max': v['max'],
         # True when the span is stitched from sets with different quantities, i.e. no
         # single open can produce the full min..max range shown.
         'merged': len(v['ranges']) > 1}
        for k, v in items.items()
    ]
    out.sort(key=lambda x: -x['pct'])
    return out, known_sets, len(cell['sets'])


result = []
for s in sources.values():
    cells_out, tiers, efforts, unknown = {}, set(), set(), 0
    for key, cell in s['cells'].items():
        per_mode = {}
        for mode in ('voyage', 'storm'):
            items, known, totaln = compute(cell, mode)
            per_mode[mode] = items
        if not any(per_mode.values()):
            continue  # cell built only from entities whose tables are gone (see above)
        cells_out[key] = dict(per_mode)
        cells_out[key]['tier'] = cell['tier']
        cells_out[key]['effort'] = cell['effort']
        cells_out[key]['sets'] = totaln
        if cell['tier']:
            tiers.add(cell['tier'])
        if cell['effort']:
            efforts.add(cell['effort'])
        unknown += totaln - known
    mand_items = []
    for tid in s['mandatory']:
        for it in (tables.get(tid, {}).get('voyage') or []):
            mand_items.append({'item': it['item'], 'min': it['min'], 'max': it['max']})
    result.append({
        'name': s['name'],
        'tiers': sorted(tiers),
        'efforts': [e for e in ('low', 'mid', 'high') if e in efforts] or sorted(efforts),
        'cells': cells_out,
        'variants': s['variants'],
        'mandatory': mand_items,
        'unknownSets': unknown,
        'approx': s['name'] == 'Mob Drops',
    })

order = ['Weapons Crate', 'Resource Crate', 'Food Crate', 'Medical Cabinet', 'Safe', 'Shell Box',
         'Buried Treasure', 'Ironclad Loot Box', 'Mob Drops', 'Aurogen Crystal', 'Naval Mine',
         'Militia Box']
result.sort(key=lambda s: (order.index(s['name']) if s['name'] in order else 99, s['name']))

os.makedirs('sek-out', exist_ok=True)
# newline="\n": this repo keeps LF in committed files (autocrlf off + a pre-commit CRLF
# guard), and Python's text mode would otherwise emit CRLF on Windows and rewrite every line.
with open('sek-out/loot_sources.json', 'w', encoding='utf-8', newline='\n') as f:
    json.dump(result, f, indent=1)
    f.write('\n')

for s in result:
    print('%-32s | tiers %-9s | variants %2d | cells %d | unknown sets %d'
          % (s['name'], s['tiers'], len(s['variants']), len(s['cells']), s['unknownSets']))
print('\n%d entities -> %d sources' % (len(entity_loot), len(result)))
