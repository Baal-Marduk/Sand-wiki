import json, subprocess, sys, os
from pathlib import Path

HERE = Path(__file__).resolve().parent

def _write(base, rel, obj):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")

def test_build_enemies(tmp_path):
    _write(tmp_path, "extracted/json/enemy_stats.json", {
        "mob_ghoul": {"hp": 100, "niceName": "Upior", "type": "creature", "components": []},
        "mob_ghoul_melee": {"hp": 100, "niceName": "Upior", "type": "creature", "components": []},
        "mob_ghoul_turret": {"hp": 100, "niceName": "Upior", "type": "creature", "components": []},
        "mob_ironclad_Buckler": {"hp": 5000, "niceName": None, "type": "enemy-trampler", "components": []},
        "mob_ironclad_Falchion": {"hp": 4000, "niceName": None, "type": "enemy-trampler", "components": []},
        "mob_ironclad_Tophelm": {"hp": 4000, "niceName": None, "type": "enemy-trampler", "components": []},
    })
    _write(tmp_path, "sek-out/loot_sources.json", [
        {"name": "Mob Drops", "tiers": [], "efforts": [], "mandatory": [], "cells": {
            "0|ranged mob": {"tier": None, "effort": "ranged mob", "sets": 1,
                "voyage": [{"item": "item_pistolAmmo", "pct": 100.0, "min": 1, "max": 1}],
                "storm":  [{"item": "item_pistolAmmo", "pct": 100.0, "min": 1, "max": 2}]},
            "0|melee mob": {"tier": None, "effort": "melee mob", "sets": 1,
                "voyage": [{"item": "game_coinCrownPile_10", "pct": 50.0, "min": 1, "max": 1}],
                "storm":  [{"item": "game_coinCrownPile_10", "pct": 50.0, "min": 1, "max": 1}]},
            "0|melee mob (tool)": {"tier": None, "effort": "melee mob (tool)", "sets": 1,
                "voyage": [], "storm": []},
        }},
        {"name": "Ironclad Loot Box", "tiers": [], "efforts": [], "cells": {
            "0|": {"tier": None, "effort": None, "sets": 4,
                "voyage": [{"item": "item_weaponParts", "pct": 80.0, "min": 5, "max": 10}],
                "storm":  [{"item": "item_weaponParts", "pct": 80.0, "min": 5, "max": 10}]}},
         "mandatory": [{"item": "item_alloySteel", "min": 1, "max": 1}]},
    ])
    _write(tmp_path, "transform/overrides/enemy-overrides.json",
           json.loads((HERE.parent / "transform" / "overrides" / "enemy-overrides.json").read_text(encoding="utf-8")))
    wiki = tmp_path / "wiki-entities.json"
    wiki.write_text(json.dumps([
        {"id": "item_pistolAmmo", "slug": "pistol-ammo", "name": "Pistol Ammo", "kind": "item"},
        {"id": "item_weaponParts", "slug": "weapon-parts", "name": "Weapon Parts", "kind": "item"},
        {"id": "item_alloySteel", "slug": "resource-alloy-steel", "name": "Alloy Steel", "kind": "item"},
        {"id": "game_coinCrownPile_10", "slug": "coin-crown", "name": "Coin (Crown)", "kind": "item"},
    ]), encoding="utf-8")

    env = {**os.environ, "WIKI_ENTITIES": str(wiki)}
    subprocess.run([sys.executable, str(HERE / "build_enemies.py")], cwd=tmp_path, check=True, env=env)

    data = json.loads((tmp_path / "sek-out" / "enemies.json").read_text(encoding="utf-8"))
    enemies = {e["id"]: e for e in data["enemies"]}

    upior = enemies["upior"]
    assert upior["type"] == "creature" and upior["icon"] is None
    assert [v["hp"] for v in upior["variants"]] == [100, 100, 100]
    ranged = [r for r in upior["loot"] if r["group"] == "Ranged"]
    assert ranged and ranged[0]["slug"] == "pistol-ammo" and ranged[0]["storm"] == "1-2"

    ic = enemies["ironclad"]
    assert [v["name"] for v in ic["variants"]] == ["Buckler", "Falchion", "Tophelm"]
    assert [v["hp"] for v in ic["variants"]] == [5000, 4000, 4000]
    cargo = [r for r in ic["loot"] if r["group"] == "Cargo"]
    guaranteed = [r for r in ic["loot"] if r["group"] == "Guaranteed"]
    assert cargo and cargo[0]["slug"] == "weapon-parts"
    assert guaranteed and guaranteed[0]["slug"] == "resource-alloy-steel" and guaranteed[0]["chance"] == 100.0
