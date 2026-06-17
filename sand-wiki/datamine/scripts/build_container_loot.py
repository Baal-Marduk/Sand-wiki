"""Build an inspectable per-container loot catalog from loot_sources.json.

Shape (one row per container TYPE):
  { "<slug>": {
      name, icon, category,
      tiers: [
        { "tier": "<label>", "rollSets": <int>, "loot": [
            { slug, name, chance, voyage, storm, resolved }
        ] }
      ] } }

`tier` label combines the game tier (1-3) and/or effort (low/mid/high, mob kind).
`chance` is the drop % (pct). `voyage`/`storm` are the per-mode amount ranges.
Items resolve to wiki item slugs via the wiki item `id` (same internal id as SEK),
with a small alias layer; unresolved => slug null, resolved:false (still listed).
"""
import json, re, os, collections

DM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # sand-wiki/datamine
DATA = os.path.join(DM, "data")
PRISMA = os.path.normpath(os.path.join(DM, "..", "prisma"))

sources = json.load(open(os.path.join(DATA, "loot_sources.json"), encoding="utf-8"))
sek_items = {i["id"]: i for i in json.load(open(os.path.join(DATA, "items.json"), encoding="utf-8"))}
wiki_items = json.load(open(os.path.join(PRISMA, "data.json"), encoding="utf-8"))["items"]

by_id = {w["id"]: w for w in wiki_items if w.get("id")}
by_id_lc = {w["id"].lower(): w for w in wiki_items if w.get("id")}
by_name = {w["name"].lower(): w for w in wiki_items}
DROP_SUFFIX = re.compile(r"(_mob ?drop|_mine ?drop|mobdrop|minedrop)$", re.I)

# Corrections live in a committed override file so the pipeline is fully replayable.
OVERRIDES = json.load(open(os.path.join(DM, "overrides", "loot-overrides.json"), encoding="utf-8"))
ALIAS = OVERRIDES["itemSlugAliases"]
KNOWN_LIVE_SLUGS = set(OVERRIDES["knownLiveSlugs"])
# Container reconciliation against the existing wiki model: drop non-containers,
# remap datamined slugs onto existing wiki slugs, and override display names.
EXCLUDE = set(OVERRIDES.get("excludeContainers", []))
SLUG_MAP = OVERRIDES.get("containerSlugMap", {})
CONTAINER_OVERRIDES = OVERRIDES.get("containerOverrides", {})
slugset = {w["slug"] for w in wiki_items} | KNOWN_LIVE_SLUGS
by_slug = {w["slug"]: w for w in wiki_items}

def resolve(lid):
    name = sek_items.get(lid, {}).get("name") or lid
    if lid in ALIAS:
        s = ALIAS[lid]
        w = by_slug.get(s)
        # resolved=True only if the target slug exists in the snapshot
        return s, (w["name"] if w else name), s in slugset
    for key in (lid, lid.lower()):
        w = by_id.get(lid) or by_id_lc.get(lid.lower())
        if w: return w["slug"], w["name"], True
    base = DROP_SUFFIX.sub("", lid)
    if base != lid:
        w = by_id.get(base) or by_id_lc.get(base.lower())
        if w: return w["slug"], w["name"], True
    if name.lower() in by_name:
        w = by_name[name.lower()]; return w["slug"], w["name"], True
    return None, name, False

def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def amt(e):
    return str(e["min"]) if e["min"] == e["max"] else f"{e['min']}-{e['max']}"

def fmt_range(lo, hi):
    return str(lo) if lo == hi else f"{lo}-{hi}"

def tier_label(tier, effort):
    bits = []
    if tier is not None: bits.append(f"Tier {tier}")
    if effort: bits.append(effort[:1].upper() + effort[1:])
    return " - ".join(bits) or "Drops"

# The low/mid/high effort dimension is collapsed into a single Tier (union of all
# effort drops). Other "effort" values (mob types on Mob Drops) are kept as-is.
LOW_MID_HIGH = {"low", "mid", "high"}

out = collections.OrderedDict()
resolved_n = tot_n = 0
unresolved = collections.Counter()

for c in sources:
    name = c["name"]
    dm_slug = slugify(name)
    if dm_slug in EXCLUDE:
        continue  # not a real loot container (e.g. mob drops, naval mine)
    eff_order = {e: i for i, e in enumerate(c.get("efforts") or [])}
    def cellkey(item):
        k, cell = item
        return (cell.get("tier") if cell.get("tier") is not None else 0,
                eff_order.get(cell.get("effort"), 0))

    # Group cells, merging the low/mid/high effort dimension away.
    groups = collections.OrderedDict()  # gkey -> {"label", "cells"}
    for k, cell in sorted(c["cells"].items(), key=cellkey):
        tier, eff = cell.get("tier"), cell.get("effort")
        if eff in LOW_MID_HIGH:
            gkey, label = ("tier", tier), (f"Tier {tier}" if tier is not None else "Drops")
        else:
            gkey, label = ("cell", tier, eff), tier_label(tier, eff)
        groups.setdefault(gkey, {"label": label, "cells": []})["cells"].append(cell)

    tiers = []
    for g in groups.values():
        # Union items across every cell in the group; widen amounts to the full
        # observed range per mode; chance = max pct seen for the item.
        order, seen = [], set()
        vagg, sagg = {}, {}  # item -> [min, max, pct]
        roll_sets = 0
        for cell in g["cells"]:
            roll_sets = max(roll_sets, cell.get("sets") or 0)
            for mode, agg in (("voyage", vagg), ("storm", sagg)):
                for e in (cell.get(mode) or []):
                    it = e["item"]
                    if it not in seen: seen.add(it); order.append(it)
                    cur = agg.get(it)
                    if cur is None: agg[it] = [e["min"], e["max"], e["pct"]]
                    else: cur[0] = min(cur[0], e["min"]); cur[1] = max(cur[1], e["max"]); cur[2] = max(cur[2], e["pct"])
        loot = []
        for it in order:
            slug, iname, ok = resolve(it)
            tot_n += 1
            if ok: resolved_n += 1
            else: unresolved[it] += 1
            v, s = vagg.get(it), sagg.get(it)
            chance = max(x[2] for x in (v, s) if x)
            storm_bonus = more_in_storm = None
            if v and s:
                v_avg, s_avg = (v[0] + v[1]) / 2, (s[0] + s[1]) / 2
                more_in_storm = s_avg > v_avg
                storm_bonus = round(s_avg / v_avg, 2) if v_avg else None
            loot.append({
                "slug": slug,
                "name": iname,
                "chance": chance,
                "voyage": fmt_range(v[0], v[1]) if v else None,
                "storm": fmt_range(s[0], s[1]) if s else None,
                "stormBonus": storm_bonus,
                "moreInStorm": more_in_storm,
                "resolved": ok,
            })
        tiers.append({"tier": g["label"], "rollSets": roll_sets or None, "loot": loot})

    # Guaranteed (mandatory) drops live outside the random `cells` (e.g. the
    # Ironclad box's Alloy Steel), so the cell loop above never sees them. Inline
    # them into the first tier at 100% chance — same amount in both modes — so
    # they aren't silently lost.
    mand = c.get("mandatory") or []
    if mand:
        if not tiers:
            tiers.append({"tier": "Drops", "rollSets": None, "loot": []})
        loot0 = tiers[0]["loot"]
        present = {e["slug"] for e in loot0 if e["slug"]}
        guaranteed = []
        for m in mand:
            it = m["item"]
            slug, iname, ok = resolve(it)
            if slug and slug in present:
                continue  # already surfaced by the random pool; don't duplicate
            tot_n += 1
            if ok: resolved_n += 1
            else: unresolved[it] += 1
            rng = fmt_range(m["min"], m["max"])
            guaranteed.append({
                "slug": slug,
                "name": iname,
                "chance": 100.0,
                "voyage": rng,
                "storm": rng,
                "stormBonus": 1.0,
                "moreInStorm": False,
                "resolved": ok,
            })
        tiers[0]["loot"] = guaranteed + loot0

    # Remap the datamined slug onto the existing wiki slug, and apply name/icon
    # overrides (icon defaults to null — SEK container art isn't served by the wiki).
    wiki_slug = SLUG_MAP.get(dm_slug, dm_slug)
    ov = CONTAINER_OVERRIDES.get(wiki_slug, {})
    out[wiki_slug] = {
        "name": ov.get("name", name),
        "icon": ov.get("icon"),
        "category": "loot-containers",
        "tiers": tiers,
    }

artifact = {
    "meta": {"source": "loot_sources.json", "containers": len(out)},
    "containers": out,
}
dest = os.path.join(PRISMA, "loot-containers.json")
json.dump(artifact, open(dest, "w", encoding="utf-8"), indent=1, ensure_ascii=False)

print(f"containers: {len(out)}")
print(f"tiers total: {sum(len(c['tiers']) for c in out.values())}")
print(f"loot refs: {resolved_n}/{tot_n} resolved to wiki slugs ({100*resolved_n/tot_n:.1f}%)")
print(f"unresolved distinct: {len(unresolved)}")
for it, n in unresolved.most_common():
    print(f"  {it} (x{n}) sek-name={sek_items.get(it,{}).get('name')}")
print(f"wrote {dest}")
