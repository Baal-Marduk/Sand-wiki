"""Build sek-out/enemies.json from enemy_stats.json + loot_sources.json + enemy-overrides.json.
Upior loot groups per variant (variant.lootEffort -> a 'Mob Drops' cell); Ironclad loot is one
merged 'Cargo' pool + a 'Guaranteed' group (mandatory drops). Item ids resolve to wiki slugs via
loot_resolve against the shipped generated entities snapshot (WIKI_ENTITIES env, default
../data/generated/entities.json). Run from packages/datamine/ : python scripts/build_enemies.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from loot_resolve import make_resolver

WIKI_ENTITIES = os.environ.get("WIKI_ENTITIES", "../data/generated/entities.json")

enemy_stats = json.load(open("extracted/json/enemy_stats.json", encoding="utf-8"))
sources = {s["name"]: s for s in json.load(open("sek-out/loot_sources.json", encoding="utf-8"))}
ov = json.load(open("transform/overrides/enemy-overrides.json", encoding="utf-8"))
wiki_items = [e for e in json.load(open(WIKI_ENTITIES, encoding="utf-8")) if e.get("id")]

resolve = make_resolver(wiki_items, ov.get("itemSlugAliases", {}))

def fmt_range(lo, hi):
    return str(lo) if lo == hi else f"{lo}-{hi}"

def rows_from_cell(cell, group):
    """One loot cell (voyage/storm item lists) -> loot rows; chance = max pct across modes."""
    order, seen, vagg, sagg = [], set(), {}, {}
    for mode, agg in (("voyage", vagg), ("storm", sagg)):
        for e in (cell.get(mode) or []):
            it = e["item"]
            if it not in seen:
                seen.add(it); order.append(it)
            agg[it] = [e["min"], e["max"], e["pct"]]
    rows = []
    for it in order:
        slug, name, ok = resolve(it)
        v, s = vagg.get(it), sagg.get(it)
        chance = max(x[2] for x in (v, s) if x)
        rows.append({
            "group": group, "slug": slug, "name": name, "chance": chance,
            "voyage": fmt_range(v[0], v[1]) if v else None,
            "storm": fmt_range(s[0], s[1]) if s else None,
            "resolved": ok,
        })
    return rows

def cells_by_effort(source):
    return {c.get("effort"): c for c in source.get("cells", {}).values()}

out, unresolved = [], []
for edef in ov["enemies"]:
    src = sources.get(edef["lootSource"], {})
    variants = [{"name": v["name"], "hp": enemy_stats.get(v["epb"], {}).get("hp")} for v in edef["variants"]]

    loot = []
    if any("lootEffort" in v for v in edef["variants"]):
        # Per-variant grouping (Upior): each variant -> the matching effort cell.
        eff = cells_by_effort(src)
        for v in edef["variants"]:
            cell = eff.get(v.get("lootEffort"))
            if cell:
                loot.extend(rows_from_cell(cell, v["name"]))
    else:
        # Single merged pool (Ironclad): all cells under one group label.
        group = edef.get("lootGroup", "Drops")
        for cell in src.get("cells", {}).values():
            loot.extend(rows_from_cell(cell, group))

    # Guaranteed (mandatory) drops -> a 100% "Guaranteed" group.
    for m in src.get("mandatory", []):
        slug, name, ok = resolve(m["item"])
        rng = fmt_range(m["min"], m["max"])
        loot.append({"group": "Guaranteed", "slug": slug, "name": name, "chance": 100.0,
                     "voyage": rng, "storm": rng, "resolved": ok})

    unresolved += [r["name"] for r in loot if not r["resolved"]]
    out.append({
        "id": edef["id"], "slug": edef["slug"], "name": edef["name"],
        "type": edef["type"], "icon": edef.get("icon"),
        "variants": variants, "loot": loot,
    })

artifact = {"meta": {"source": "enemy_stats.json + loot_sources.json", "enemies": len(out)}, "enemies": out}
os.makedirs("sek-out", exist_ok=True)
json.dump(artifact, open("sek-out/enemies.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)

print(f"enemies: {len(out)}")
for e in out:
    print(f"  {e['slug']}: {len(e['variants'])} variants, {len(e['loot'])} loot rows")
if unresolved:
    print(f"unresolved loot items ({len(unresolved)}): {sorted(set(unresolved))}")
    print("  -> add an itemSlugAliases entry in transform/overrides/enemy-overrides.json")
