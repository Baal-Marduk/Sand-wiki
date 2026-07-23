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

DATAMINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # packages/datamine
SEK_OUT = os.path.join(DATAMINE, "sek-out")
# Wiki item snapshot (id<->slug<->name) used only to resolve loot item refs to wiki slugs.
WIKI = os.path.normpath(os.path.join(DATAMINE, "..", "..", "apps", "wiki", "prisma"))

sources = json.load(open(os.path.join(SEK_OUT, "loot_sources.json"), encoding="utf-8"))
sek_items = {i["id"]: i for i in json.load(open(os.path.join(SEK_OUT, "items.json"), encoding="utf-8"))}
wiki_items = json.load(open(os.path.join(WIKI, "data.json"), encoding="utf-8"))["items"]

by_id = {w["id"]: w for w in wiki_items if w.get("id")}
by_id_lc = {w["id"].lower(): w for w in wiki_items if w.get("id")}
by_name = {w["name"].lower(): w for w in wiki_items}
DROP_SUFFIX = re.compile(r"(_mob ?drop|_mine ?drop|mobdrop|minedrop)$", re.I)

# Corrections live in a committed override file so the pipeline is fully replayable.
OVERRIDES = json.load(open(os.path.join(DATAMINE, "transform", "overrides", "loot-overrides.json"), encoding="utf-8"))
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
    # variants are the truthful unit: one real entity = one roll pool with its own sets.
    variants_by_cell = collections.defaultdict(list)
    for v in c.get("variants") or []:
        variants_by_cell[(v.get("tier"), v.get("effort"))].append(v)

    def cellkey(item):
        k, cell = item
        return (cell.get("tier") if cell.get("tier") is not None else 0,
                eff_order.get(cell.get("effort"), 0))

    def set_views(cells):
        """The sets a player can actually roll from these cells, with exact per-set
        quantities. Each set's odds are normalised within its own entity, because that
        entity is the roll -- odds are NOT comparable across effort variants."""
        out = []
        for cell in cells:
            for v in variants_by_cell.get((cell.get("tier"), cell.get("effort")), []):
                for s in v["sets"]:
                    if not s.get("known"):
                        continue
                    per = {}
                    for mode in ("voyage", "storm"):
                        for it in s.get(mode) or []:
                            per.setdefault(it["item"], {})[mode] = fmt_range(it["min"], it["max"])
                    items = []
                    for lid, r in per.items():
                        slug, iname, ok = resolve(lid)
                        items.append({"slug": slug, "name": iname, "resolved": ok,
                                      "voyage": r.get("voyage"), "storm": r.get("storm")})
                    out.append({"label": s["label"], "effort": v.get("effort"),
                                "chance": s["pct"], "items": items})
        return out

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
                    if cur is None: agg[it] = [e["min"], e["max"], e["pct"], bool(e.get("merged"))]
                    else:
                        # Widening across cells stitches the span further, so the result is
                        # merged whenever it came from more than one source range.
                        if e["min"] != cur[0] or e["max"] != cur[1]: cur[3] = True
                        cur[0] = min(cur[0], e["min"]); cur[1] = max(cur[1], e["max"])
                        cur[2] = max(cur[2], e["pct"]); cur[3] = cur[3] or bool(e.get("merged"))
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
                # The min-max span is stitched from sets with different quantities, so no
                # single open can yield the whole range. Exact values live in `sets`.
                "mergedRange": bool((v or s)[3]) if (v or s) else False,
                "resolved": ok,
            })
        sets = set_views(g["cells"])
        tiers.append({"tier": g["label"], "rollSets": roll_sets or None,
                      "setSize": (min(len(s["items"]) for s in sets),
                                  max(len(s["items"]) for s in sets)) if sets else None,
                      "sets": sets, "loot": loot})

    # Guaranteed (mandatory) drops live outside the random `cells` (e.g. the
    # Ironclad box's Alloy Steel), so the cell loop above never sees them. Inline
    # them into the first tier at 100% chance — same amount in both modes — so
    # they aren't silently lost.
    mand = c.get("mandatory") or []
    if mand:
        if not tiers:
            tiers.append({"tier": "Drops", "rollSets": None, "setSize": None,
                          "sets": [], "loot": []})
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
                "mergedRange": False,
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
dest = os.path.join(SEK_OUT, "container_loot.json")
# Explicit LF: committed files in this repo are LF (autocrlf off + a pre-commit CRLF
# guard); Python text mode would emit CRLF on Windows and rewrite every line.
with open(dest, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(artifact, fh, indent=1, ensure_ascii=False)
    fh.write("\n")

print(f"containers: {len(out)}")
print(f"tiers total: {sum(len(c['tiers']) for c in out.values())}")
print(f"loot refs: {resolved_n}/{tot_n} resolved to wiki slugs ({100*resolved_n/tot_n:.1f}%)")
print(f"unresolved distinct: {len(unresolved)}")
for it, n in unresolved.most_common():
    print(f"  {it} (x{n}) sek-name={sek_items.get(it,{}).get('name')}")
print(f"wrote {dest}")

