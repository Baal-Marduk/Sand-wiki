import json, subprocess, sys, os
from pathlib import Path

HERE = Path(__file__).resolve().parent
DM = HERE.parent  # sand-wiki/datamine
ARTIFACT = (DM / ".." / "prisma" / "loot-containers.json").resolve()

def build():
    subprocess.run([sys.executable, str(HERE / "build_container_loot.py")], check=True, cwd=str(DM))
    return json.loads(ARTIFACT.read_text(encoding="utf-8"))

def test_artifact_has_meta_and_containers():
    d = build()
    # 7 existing wiki containers (datamined data remapped onto their slugs) + ironclad.
    assert d["meta"]["containers"] == len(d["containers"]) == 8
    assert d["meta"]["source"] == "loot_sources.json"

def test_non_container_sources_excluded():
    d = build()
    for slug in ("aurogen-crystal", "militia-box", "naval-mine", "mob-drops"):
        assert slug not in d["containers"]

def test_slug_remap_onto_existing_wiki_slugs():
    d = build()
    # datamined "Weapons Crate"/"Buried Treasure" land on the existing wiki slugs.
    assert "weapon-crate" in d["containers"] and "weapons-crate" not in d["containers"]
    assert "suspicious-pile-of-sand" in d["containers"] and "buried-treasure" not in d["containers"]
    assert d["containers"]["weapon-crate"]["name"] == "Weapon Crate"
    assert d["containers"]["ironclad-loot-box"]["name"] == "Ironclad Loot Box"  # the one addition

def test_overrides_alias_applied():
    d = build()
    slugs = {e["slug"] for c in d["containers"].values() for t in c["tiers"] for e in t["loot"]}
    assert "med-kit" in slugs
    assert "repeater-rifle-quick-reload" in slugs

def test_effort_collapsed_to_tiers():
    d = build()
    labels = [t["tier"] for t in d["containers"]["weapon-crate"]["tiers"]]
    assert labels == ["Tier 1", "Tier 2", "Tier 3"]

def test_storm_bonus_present():
    d = build()
    e = d["containers"]["weapon-crate"]["tiers"][0]["loot"][0]
    assert set(e) >= {"slug","name","chance","voyage","storm","stormBonus","moreInStorm","resolved"}
