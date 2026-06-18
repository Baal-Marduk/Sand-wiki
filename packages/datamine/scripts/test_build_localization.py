import json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

def _write(tmp, rel, obj):
    p = tmp / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")

def test_all_locale_build(tmp_path):
    ext = tmp_path / "extracted" / "json"
    _write(tmp_path, "extracted/json/i2_terms_en.json", {"terms": {
        "Items/item_resourceFabric_name": "Fabric",
        "Items/item_resourceFabric_description": "Woven cloth.",
        "WalkerCompartments/walker_sqrDoor_epb_name": "Square Door",
        "WalkerCompartments/walker_sqrDoor_epb_description": "A door.",
    }})
    _write(tmp_path, "extracted/json/i2_terms_fr.json", {"terms": {
        "Items/item_resourceFabric_name": "Tissu",
        "Items/item_resourceFabric_description": "Toile tissée.",
        "WalkerCompartments/walker_sqrDoor_epb_name": "Porte carrée",
    }})
    _write(tmp_path, "extracted/json/items_registry.json", {"items": {
        "item_resourceFabric": {"name": "Fabric", "shortDescription": None, "description": "Woven cloth."}
    }})
    out = tmp_path / "sek-out" / "localization.json"
    out.parent.mkdir(parents=True, exist_ok=True)

    subprocess.run([sys.executable, str(HERE / "build_localization.py")],
                   cwd=tmp_path, check=True)

    data = json.loads(out.read_text(encoding="utf-8"))
    fab = data["items"]["item_resourceFabric"]
    assert fab["locales"]["en"]["name"] == "Fabric"
    assert fab["locales"]["fr"]["name"] == "Tissu"
    assert fab["locales"]["fr"]["desc"] == "Toile tissée."
    door = data["compartments"]["walker_sqrDoor_epb"]
    assert door["locales"]["en"]["name"] == "Square Door"
    assert door["locales"]["fr"]["name"] == "Porte carrée"
    assert door["locales"]["fr"]["desc"] is None
    assert "en" in data["locales"] and "fr" in data["locales"]
