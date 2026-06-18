"""Build sek-out/localization.json from the game's I2 Localization tables — ALL locales.

Discovers every extracted/json/i2_terms_<locale>.json (e.g. i2_terms_en.json,
i2_terms_fr.json, ...) and emits per-locale name/description maps for items and walker
compartments. EN is required and authoritative for item descriptions (via items_registry);
other locales are best-effort from their term tables.

Run from packages/datamine/:  python scripts/build_localization.py
Inputs  (extracted/json/): i2_terms_<locale>.json, items_registry.json (EN)
Output: sek-out/localization.json
  { locales: ["en","fr",...],
    items: {id: {locales: {en:{name,short,desc}, fr:{...}, ...}}},
    compartments: {epbId: {locales: {en:{name,desc}, ...}}},
    factions: [en faction names] }

EXT and OUT are resolved relative to cwd (the packages/datamine/ directory) so that
the script is testable by subprocess with cwd=tmp_path.
"""
import json, re
from pathlib import Path

EXT = Path("extracted/json")
OUT = Path("sek-out/localization.json")

ITEM_NAME = re.compile(r"Items/(item_\w+)_name$")
COMP_NAME = re.compile(r"WalkerCompartments/(walker_\w+_epb)_name$")


def _load_terms(locale):
    p = EXT / f"i2_terms_{locale}.json"
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8")).get("terms", {})


def _discover_locales():
    locales = sorted(p.stem.replace("i2_terms_", "")
                     for p in EXT.glob("i2_terms_*.json"))
    if "en" not in locales:
        raise SystemExit("build_localization: i2_terms_en.json is required but missing")
    return ["en"] + [l for l in locales if l != "en"]


def main():
    locales = _discover_locales()
    terms_by_locale = {loc: _load_terms(loc) for loc in locales}
    registry = json.loads((EXT / "items_registry.json").read_text(encoding="utf-8"))["items"] \
        if (EXT / "items_registry.json").exists() else {}

    item_ids, comp_ids = set(registry.keys()), set()
    for terms in terms_by_locale.values():
        for k in terms:
            m = ITEM_NAME.match(k)
            if m:
                item_ids.add(m.group(1))
            m = COMP_NAME.match(k)
            if m:
                comp_ids.add(m.group(1))

    def item_entry(iid, loc):
        terms = terms_by_locale[loc]
        if loc == "en" and iid in registry:
            e = registry[iid]
            return {"name": e.get("name"), "short": e.get("shortDescription") or None,
                    "desc": e.get("description") or None}
        name = terms.get(f"Items/{iid}_name")
        if name is None:
            return None
        return {"name": name,
                "short": terms.get(f"Items/{iid}_shortDescription") or None,
                "desc": terms.get(f"Items/{iid}_description") or None}

    def comp_entry(cid, loc):
        terms = terms_by_locale[loc]
        name = terms.get(f"WalkerCompartments/{cid}_name")
        if name is None:
            return None
        return {"name": name,
                "desc": terms.get(f"WalkerCompartments/{cid}_description") or None}

    items = {}
    for iid in sorted(item_ids):
        per = {loc: e for loc in locales if (e := item_entry(iid, loc)) is not None}
        if per:
            items[iid] = {"locales": per}

    compartments = {}
    for cid in sorted(comp_ids):
        per = {loc: e for loc in locales if (e := comp_entry(cid, loc)) is not None}
        if per:
            compartments[cid] = {"locales": per}

    en = terms_by_locale["en"]
    factions = [en[k] for k in (
        "ResearchTree/faction-godlewskiExpedition-name",
        "ResearchTree/faction-landwehr-name",
        "ResearchTree/faction-kaiserFriends-name") if k in en]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "_source": "I2 Localization (data.unity3d), all locales",
        "locales": locales,
        "items": items,
        "compartments": compartments,
        "factions": factions,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT} — locales={locales}, {len(items)} items, {len(compartments)} compartments")


if __name__ == "__main__":
    main()
