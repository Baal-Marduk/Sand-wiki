# SAND scraper: display names + item icons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real display names + descriptions (from the I2 localization asset) and per-item icon PNGs to the SAND scraper output.

**Architecture:** A new `localization.py` parses the I2 `LanguageSourceData` blob inside `data.unity3d` (byte-level Unity-string walk, anchored on `Items/{id}_name` terms) to map item ids → English name/description. A new `icons.py` exports every `Sprite` from `ui_assets_all.bundle` to PNG and joins them to item ids via normalized name-matching plus a curated `icon_overrides.json`. `transform.py` gains the `displayName`/`description` fields; the CLI gains `--icons` and `--no-names`.

**Tech Stack:** Python 3.12, UnityPy 1.20.26 (+ transitive Pillow for sprite export), pytest, `struct` for binary parsing.

---

## Preamble — branch & environment

This work extends the existing scraper, whose code lives **only on branch `feat/sand-scraper-impl`** (its worktree was removed; current branch is `build/wiki-design-pass-2`). Before Task 1, create an isolated worktree for that branch via the `superpowers:using-git-worktrees` skill, e.g. checkout `feat/sand-scraper-impl`. All paths below are relative to repo root; the scraper package is under `sand-scraper/`.

The scraper's venv lost UnityPy when the old worktree was removed (it was reinstalled during the spike). In the fresh worktree, ensure deps: `cd sand-scraper && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"`.

Run tests from `sand-scraper/`: `.venv/Scripts/python -m pytest -q`.

**Commit convention:** the repo uses `feat:`/`test:`/`docs:` prefixes. All commits must end with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer (omitted from the commands below for brevity — add it to each).

**Reference facts (from the 2026-06-09 spike):**
- I2 object: the MonoBehaviour in `Sand_Data/data.unity3d` whose raw blob starts with `m_Name` `I2Languages` and contains `Items/` term keys.
- Term layout in the blob: `Term`(Unity string) → `Description`(Unity string, usually empty) → `Languages`(int32 count + N Unity strings). **English is `Languages[0]`.**
- Unity string = `int32 length + UTF-8 bytes + padding to 4-byte alignment`.
- Convention: `Items/{itemId}_name`, `Items/{itemId}_description`. 119/121 ids match `_name` verbatim.

---

## Task 1: Unity-string + term extractor (pure, byte-level)

**Files:**
- Create: `sand-scraper/src/sand_scraper/localization.py`
- Test: `sand-scraper/tests/test_localization.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_localization.py
import struct

from sand_scraper.localization import extract_terms


def _ustr(s: str) -> bytes:
    """Encode a Unity-serialized string: int32 length + utf-8 + align-4 padding."""
    b = s.encode("utf-8")
    pad = (-(4 + len(b))) % 4
    return struct.pack("<i", len(b)) + b + b"\x00" * pad


def _term(key: str, langs: list[str], desc: str = "") -> bytes:
    out = _ustr(key) + _ustr(desc) + struct.pack("<i", len(langs))
    for lang in langs:
        out += _ustr(lang)
    return out


def _fake_blob() -> bytes:
    # leading junk + marker, then three terms
    return (
        b"\x07\x00\x00\x00garbage\x00"
        + _ustr("I2Languages")
        + _term("Items/item_test_name", ["Test Widget", "Testwidget"])
        + _term("Items/item_test_description", ["A thing for testing."])
        + _term("Items/item_unicode_name", ["Café Ω"])  # non-ASCII english
        + _term("Lobby/ignored", ["nope"])
    )


def test_extracts_item_name_terms():
    terms = extract_terms(_fake_blob(), ["Items/"])
    assert terms["Items/item_test_name"] == "Test Widget"
    assert terms["Items/item_test_description"] == "A thing for testing."


def test_handles_non_ascii_english():
    terms = extract_terms(_fake_blob(), ["Items/"])
    assert terms["Items/item_unicode_name"] == "Café Ω"


def test_respects_prefix_filter():
    terms = extract_terms(_fake_blob(), ["Items/"])
    assert "Lobby/ignored" not in terms
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_localization.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sand_scraper.localization'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_scraper/localization.py
from __future__ import annotations

import struct
from typing import Iterable


def _read_string(buf: bytes, off: int) -> tuple[str | None, int]:
    """Read a Unity-serialized string at off. Returns (text, next_offset) or (None, off)."""
    if off < 0 or off + 4 > len(buf):
        return None, off
    n = struct.unpack_from("<i", buf, off)[0]
    if n < 0 or off + 4 + n > len(buf):
        return None, off
    raw = buf[off + 4 : off + 4 + n]
    end = (off + 4 + n + 3) & ~3  # align to 4 bytes
    try:
        return raw.decode("utf-8"), end
    except UnicodeDecodeError:
        return None, off


def extract_terms(buf: bytes, prefixes: Iterable[str]) -> dict[str, str]:
    """Scan an I2 LanguageSourceData blob for terms whose key starts with any prefix.

    For each term, returns the English translation (Languages[0]). Term layout:
    Term(string) -> Description(string) -> Languages(int32 count + N strings).
    """
    out: dict[str, str] = {}
    for prefix in prefixes:
        pat = prefix.encode("utf-8")
        i = buf.find(pat)
        while i != -1:
            lp = i - 4  # length prefix sits 4 bytes before the text
            key, off = _read_string(buf, lp)
            if key is not None and key.startswith(prefix):
                desc, off = _read_string(buf, off)  # skip description
                if desc is not None and off + 4 <= len(buf):
                    count = struct.unpack_from("<i", buf, off)[0]
                    off += 4
                    if 0 < count <= 32:
                        english, _ = _read_string(buf, off)
                        if english is not None:
                            out.setdefault(key, english)
            i = buf.find(pat, i + 1)
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_localization.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add sand-scraper/src/sand_scraper/localization.py sand-scraper/tests/test_localization.py
git commit -m "feat: byte-level I2 term extractor"
```

---

## Task 2: I2 blob locator + item-localization map

**Files:**
- Modify: `sand-scraper/src/sand_scraper/localization.py`
- Test: `sand-scraper/tests/test_localization.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_localization.py`)

```python
from sand_scraper.localization import item_localization


def test_item_localization_maps_ids_to_name_and_description():
    loc = item_localization(_fake_blob())
    assert loc.names["item_test"] == "Test Widget"
    assert loc.descriptions["item_test"] == "A thing for testing."
    assert loc.names["item_unicode"] == "Café Ω"
    # description absent -> not present
    assert "item_unicode" not in loc.descriptions
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_localization.py::test_item_localization_maps_ids_to_name_and_description -v`
Expected: FAIL — `ImportError: cannot import name 'item_localization'`

- [ ] **Step 3: Write minimal implementation** (append to `src/sand_scraper/localization.py`)

```python
import re
from dataclasses import dataclass, field
from pathlib import Path

_NAME_RE = re.compile(r"^Items/(?P<id>.+)_name$")
_DESC_RE = re.compile(r"^Items/(?P<id>.+)_description$")


@dataclass
class ItemLocalization:
    names: dict[str, str] = field(default_factory=dict)
    descriptions: dict[str, str] = field(default_factory=dict)


def item_localization(buf: bytes) -> ItemLocalization:
    """Build id -> English name/description maps from an I2 blob."""
    terms = extract_terms(buf, ["Items/"])
    loc = ItemLocalization()
    for key, english in terms.items():
        m = _NAME_RE.match(key)
        if m:
            loc.names[m.group("id")] = english
            continue
        m = _DESC_RE.match(key)
        if m:
            loc.descriptions[m.group("id")] = english
    return loc


def load_i2_blob(data_unity3d_path: Path) -> bytes:
    """Locate and return the raw bytes of the I2 LanguageSourceData MonoBehaviour."""
    import UnityPy

    if not data_unity3d_path.is_file():
        raise FileNotFoundError(f"data.unity3d not found: {data_unity3d_path}")
    env = UnityPy.load(str(data_unity3d_path))
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            raw = bytes(obj.get_raw_data())
        except Exception:
            continue
        if b"I2Languages" in raw and b"Items/" in raw:
            return raw
    raise ValueError(f"I2 LanguageSourceData not found in {data_unity3d_path}")


def load_item_localization(data_unity3d_path: Path) -> ItemLocalization:
    """Convenience: locate the I2 blob and parse it into an ItemLocalization."""
    return item_localization(load_i2_blob(data_unity3d_path))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_localization.py -v`
Expected: PASS (all localization tests)

- [ ] **Step 5: Commit**

```bash
git add sand-scraper/src/sand_scraper/localization.py sand-scraper/tests/test_localization.py
git commit -m "feat: I2 blob locator and item localization map"
```

---

## Task 3: Wire display names + descriptions into transform

**Files:**
- Modify: `sand-scraper/src/sand_scraper/transform.py`
- Test: `sand-scraper/tests/test_transform.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_transform.py`)

```python
from sand_scraper.localization import ItemLocalization


def test_display_name_from_localization_overrides_derived():
    loc = ItemLocalization(
        names={"item_shotgun": "Pepper Mill Shotgun"},
        descriptions={"item_shotgun": "A makeshift scattergun."},
    )
    payload, warnings = transform(_objects(), loc)
    shotgun = _by_id(payload["items"], "item_shotgun")
    assert shotgun["displayName"] == "Pepper Mill Shotgun"
    assert shotgun["description"] == "A makeshift scattergun."
    assert shotgun["name"] == "Shotgun"  # derived name unchanged (back-compat)


def test_missing_localization_falls_back_to_derived_name_with_warning():
    loc = ItemLocalization(names={}, descriptions={})
    payload, warnings = transform(_objects(), loc)
    shotgun = _by_id(payload["items"], "item_shotgun")
    assert shotgun["displayName"] == "Shotgun"        # derived fallback
    assert shotgun["description"] is None
    assert any("item_shotgun" in w for w in warnings)


def test_no_localization_arg_keeps_derived_displayname_no_warning():
    payload, warnings = transform(_objects())
    shotgun = _by_id(payload["items"], "item_shotgun")
    assert shotgun["displayName"] == "Shotgun"
    assert not any("localized name" in w for w in warnings)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_transform.py -k display_name -v`
Expected: FAIL — `transform()` takes 1 positional arg / `KeyError: 'displayName'`

- [ ] **Step 3: Write minimal implementation**

In `src/sand_scraper/transform.py`, add the import at the top:

```python
from sand_scraper.localization import ItemLocalization
```

Change the `transform` signature:

```python
def transform(objects: list[RawObject], localization: ItemLocalization | None = None) -> tuple[dict[str, Any], list[str]]:
    """Map decoded game objects to {items, recipes}. Returns (payload, warnings).

    If localization is provided, items get real displayName/description from the I2
    table; ids with no localized name fall back to the derived name and emit a warning.
    """
```

In the `# 4. Items.` loop, replace the `items.append({...})` block with:

```python
    for iid in all_ids:
        cat = catalog.get(iid)
        typ = cat["type"] if cat else None
        real_name = localization.names.get(iid) if localization else None
        if localization is not None and real_name is None:
            warnings.append(f"no localized name for '{iid}'")
        description = localization.descriptions.get(iid) if localization else None
        items.append({
            "slug": slug_by_id[iid],
            "id": iid,
            "name": humanize(iid),
            "displayName": real_name or humanize(iid),
            "description": description,
            "type": typ,
            "isResource": bool(typ) and typ.startswith("RESOURCE_"),
            "storageStack": cat["storageStack"] if cat else None,
            "workbenchTier": tier_by_output.get(iid),
            "fromCatalog": cat is not None,
        })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_transform.py -v`
Expected: PASS (existing transform tests + 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add sand-scraper/src/sand_scraper/transform.py sand-scraper/tests/test_transform.py
git commit -m "feat: emit displayName and description on items"
```

---

## Task 4: Update schema for the new fields

**Files:**
- Modify: `sand-scraper/src/sand_scraper/schema.py`
- Test: `sand-scraper/tests/test_schema.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_schema.py`)

```python
def test_validate_accepts_items_with_display_name_and_description():
    data = {
        "meta": {},
        "items": [{"slug": "shotgun", "name": "Shotgun",
                   "displayName": "Pepper Mill Shotgun", "description": None}],
        "recipes": [],
    }
    validate_output(data)  # must not raise
```

(If `validate_output` is not yet imported in this test file, add `from sand_scraper.schema import validate_output`.)

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `.venv/Scripts/python -m pytest tests/test_schema.py -k display_name -v`
Expected: PASS is acceptable (validator is permissive); if it errors, proceed to Step 3.

- [ ] **Step 3: Update the Item TypedDict**

In `src/sand_scraper/schema.py`, add two fields to `Item`:

```python
class Item(TypedDict, total=False):
    slug: str
    id: str
    name: str
    displayName: str
    description: str | None
    type: str | None
    isResource: bool
    storageStack: int | None
    workbenchTier: int | None
    fromCatalog: bool
```

- [ ] **Step 4: Run tests**

Run: `.venv/Scripts/python -m pytest tests/test_schema.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sand-scraper/src/sand_scraper/schema.py sand-scraper/tests/test_schema.py
git commit -m "feat: schema for displayName and description"
```

---

## Task 5: Icon name-matching and manifest (pure)

**Files:**
- Create: `sand-scraper/src/sand_scraper/icons.py`
- Test: `sand-scraper/tests/test_icons.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_icons.py
from sand_scraper.icons import normalize, build_icon_manifest


def test_normalize_strips_prefixes_and_folds():
    assert normalize("item_resourceFabricScraps") == normalize("icon_fabricScraps")
    assert normalize("item_shotgun") == "shotgun"
    assert normalize("icon_item_alloySteel") == "alloysteel"


def test_build_manifest_auto_matches_by_normalized_name():
    item_ids = ["item_shotgun", "item_resourceFabricScraps"]
    sprite_to_png = {"icon_shotgun": "icons/icon_shotgun.png",
                     "icon_fabricScraps": "icons/icon_fabricScraps.png"}
    manifest, missing = build_icon_manifest(item_ids, sprite_to_png, overrides={})
    assert manifest["item_shotgun"] == "icons/icon_shotgun.png"
    assert manifest["item_resourceFabricScraps"] == "icons/icon_fabricScraps.png"
    assert missing == []


def test_overrides_take_precedence_over_auto_match():
    item_ids = ["item_shotgun"]
    sprite_to_png = {"icon_shotgun": "icons/icon_shotgun.png",
                     "icon_item_specialShotgun": "icons/icon_item_specialShotgun.png"}
    manifest, missing = build_icon_manifest(
        item_ids, sprite_to_png, overrides={"item_shotgun": "icon_item_specialShotgun"})
    assert manifest["item_shotgun"] == "icons/icon_item_specialShotgun.png"
    assert missing == []


def test_unmatched_item_is_reported_missing():
    manifest, missing = build_icon_manifest(["item_ghost"], {"icon_shotgun": "icons/icon_shotgun.png"}, overrides={})
    assert "item_ghost" not in manifest
    assert missing == ["item_ghost"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_icons.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sand_scraper.icons'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_scraper/icons.py
from __future__ import annotations

import re

_PREFIX_RE = re.compile(r"^(icon_item_|icon_|item_)")
_RESOURCE_RE = re.compile(r"resource", re.IGNORECASE)
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize(name: str) -> str:
    """Fold a sprite name or item id to a comparable key.

    Strips icon_/item_/icon_item_/resource markers, lowercases, drops non-alphanumerics.
    """
    s = _PREFIX_RE.sub("", name)
    s = _RESOURCE_RE.sub("", s)
    return _NON_ALNUM.sub("", s.lower())


def build_icon_manifest(
    item_ids: list[str],
    sprite_to_png: dict[str, str],
    overrides: dict[str, str],
) -> tuple[dict[str, str], list[str]]:
    """Map item id -> png path. Overrides (id -> spriteName) win over normalized match.

    Returns (manifest, missing_ids). Missing ids have neither an override nor a match.
    """
    by_norm: dict[str, str] = {}
    for sprite in sprite_to_png:
        by_norm.setdefault(normalize(sprite), sprite)

    manifest: dict[str, str] = {}
    missing: list[str] = []
    for iid in item_ids:
        sprite = overrides.get(iid) or by_norm.get(normalize(iid))
        png = sprite_to_png.get(sprite) if sprite else None
        if png:
            manifest[iid] = png
        else:
            missing.append(iid)
    return manifest, missing
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_icons.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add sand-scraper/src/sand_scraper/icons.py sand-scraper/tests/test_icons.py
git commit -m "feat: icon normalized matching and manifest builder"
```

---

## Task 6: Sprite export + override loading

**Files:**
- Modify: `sand-scraper/src/sand_scraper/icons.py`
- Test: `sand-scraper/tests/test_icons.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_icons.py`)

```python
import json
from pathlib import Path

from sand_scraper.icons import load_overrides, write_manifest


def test_load_overrides_missing_file_returns_empty(tmp_path):
    assert load_overrides(tmp_path / "nope.json") == {}


def test_load_overrides_reads_mapping(tmp_path):
    p = tmp_path / "ov.json"
    p.write_text(json.dumps({"item_shotgun": "icon_item_specialShotgun"}), encoding="utf-8")
    assert load_overrides(p) == {"item_shotgun": "icon_item_specialShotgun"}


def test_write_manifest_roundtrips(tmp_path):
    out = tmp_path / "icons.json"
    write_manifest({"item_shotgun": "icons/icon_shotgun.png"}, out)
    assert json.loads(out.read_text(encoding="utf-8")) == {"item_shotgun": "icons/icon_shotgun.png"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_icons.py -k "overrides or manifest" -v`
Expected: FAIL — `ImportError: cannot import name 'load_overrides'`

- [ ] **Step 3: Write minimal implementation** (append to `src/sand_scraper/icons.py`)

```python
import json
from pathlib import Path


def load_overrides(path: Path) -> dict[str, str]:
    """Read the curated id -> spriteName override file. Missing file -> empty dict."""
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_manifest(manifest: dict[str, str], path: Path) -> None:
    """Write the id -> png-path manifest as pretty UTF-8 JSON with a trailing newline."""
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = {k: manifest[k] for k in sorted(manifest)}
    path.write_text(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _safe_filename(name: str) -> str:
    """Make a sprite name safe for a filename (sprites can contain odd characters)."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)


def export_sprites(ui_bundle_path: Path, out_dir: Path) -> tuple[dict[str, str], list[str]]:
    """Export every Sprite in the UI bundle to out_dir as PNG.

    Returns ({spriteName: relative-png-path}, warnings). Relative paths are
    'out_dir.name/<file>.png' so they are portable in the manifest.
    """
    import UnityPy

    if not ui_bundle_path.is_file():
        raise FileNotFoundError(f"UI bundle not found: {ui_bundle_path}")
    out_dir.mkdir(parents=True, exist_ok=True)
    sprite_to_png: dict[str, str] = {}
    warnings: list[str] = []
    env = UnityPy.load(str(ui_bundle_path))
    for obj in env.objects:
        if obj.type.name != "Sprite":
            continue
        try:
            data = obj.read()
            name = data.m_Name
            if not name or name in sprite_to_png:
                continue
            filename = f"{_safe_filename(name)}.png"
            data.image.save(out_dir / filename)
            sprite_to_png[name] = f"{out_dir.name}/{filename}"
        except Exception as e:  # decode/save failure on an individual sprite
            warnings.append(f"sprite export failed: {e}")
    return sprite_to_png, warnings
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_icons.py -v`
Expected: PASS (all icon tests; `export_sprites` is exercised by the integration run in Task 8, not unit-tested — it needs the real bundle)

- [ ] **Step 5: Commit**

```bash
git add sand-scraper/src/sand_scraper/icons.py sand-scraper/tests/test_icons.py
git commit -m "feat: sprite export and override/manifest io"
```

---

## Task 7: Config additions

**Files:**
- Modify: `sand-scraper/src/sand_scraper/config.py`
- Modify: `sand-scraper/config.toml`
- Test: `sand-scraper/tests/test_cli.py` (or wherever config is tested — check existing `test_cli.py`)

- [ ] **Step 1: Write the failing test** (append to `tests/test_cli.py`)

```python
import tomllib  # noqa: F401  (ensure available; remove if unused)
from pathlib import Path

from sand_scraper.config import load_config


def test_load_config_reads_names_and_icon_paths(tmp_path):
    cfg_text = """
game_data_dir = "G:/game/Sand_Data"
target_bundles = ["a.bundle"]
output_path = "out/data.json"
raw_dump_dir = "out/raw"
data_unity3d = "data.unity3d"
ui_bundle = "StreamingAssets/aa/StandaloneWindows64/ui_assets_all.bundle"
icon_overrides_path = "icon_overrides.json"
icons_out_dir = "out/icons"
icons_manifest_path = "out/icons.json"
"""
    p = tmp_path / "config.toml"
    p.write_text(cfg_text, encoding="utf-8")
    cfg = load_config(p)
    assert cfg.data_unity3d_path == Path("G:/game/Sand_Data") / "data.unity3d"
    assert cfg.ui_bundle_path.name == "ui_assets_all.bundle"
    assert cfg.icon_overrides_path == tmp_path / "icon_overrides.json"
    assert cfg.icons_manifest_path == tmp_path / "out/icons.json"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_cli.py -k names_and_icon -v`
Expected: FAIL — `AttributeError: 'Config' object has no attribute 'data_unity3d_path'`

- [ ] **Step 3: Write minimal implementation**

In `src/sand_scraper/config.py`, extend the dataclass and loader:

```python
@dataclass(frozen=True)
class Config:
    game_data_dir: Path
    target_bundles: list[str]
    output_path: Path
    raw_dump_dir: Path
    data_unity3d_path: Path
    ui_bundle_path: Path
    icon_overrides_path: Path
    icons_out_dir: Path
    icons_manifest_path: Path

    def bundle_paths(self) -> list[Path]:
        return [self.game_data_dir / rel for rel in self.target_bundles]


def load_config(path: Path) -> Config:
    """Load and validate config.toml. Raises FileNotFoundError with a clear message."""
    if not path.is_file():
        raise FileNotFoundError(f"Config not found: {path}")
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    base = path.parent
    game_data_dir = Path(raw["game_data_dir"])
    return Config(
        game_data_dir=game_data_dir,
        target_bundles=list(raw["target_bundles"]),
        output_path=(base / raw["output_path"]),
        raw_dump_dir=(base / raw["raw_dump_dir"]),
        data_unity3d_path=(game_data_dir / raw.get("data_unity3d", "data.unity3d")),
        ui_bundle_path=(game_data_dir / raw["ui_bundle"]),
        icon_overrides_path=(base / raw.get("icon_overrides_path", "icon_overrides.json")),
        icons_out_dir=(base / raw.get("icons_out_dir", "out/icons")),
        icons_manifest_path=(base / raw.get("icons_manifest_path", "out/icons.json")),
    )
```

Append to `sand-scraper/config.toml`:

```toml
# Main asset file holding the I2 localization table (display names + descriptions).
data_unity3d = "data.unity3d"

# UI bundle holding item icon sprites (used by --icons).
ui_bundle = "StreamingAssets/aa/StandaloneWindows64/ui_assets_all.bundle"

# Curated item-id -> sprite-name overrides for icons that do not auto-match.
icon_overrides_path = "icon_overrides.json"
icons_out_dir = "out/icons"
icons_manifest_path = "out/icons.json"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_cli.py -v`
Expected: PASS (note: existing config-dependent tests may need the new required `ui_bundle` key — see Step 5)

- [ ] **Step 5: Fix any existing config fixtures, then commit**

If other tests build a `config.toml` or a `Config` directly, add the new keys/fields to them (e.g. `ui_bundle = "x.bundle"`). Run the full suite: `.venv/Scripts/python -m pytest -q` and fix fallout.

```bash
git add sand-scraper/src/sand_scraper/config.py sand-scraper/config.toml sand-scraper/tests/
git commit -m "feat: config keys for localization and icons"
```

---

## Task 8: CLI wiring (`--icons`, `--no-names`)

**Files:**
- Modify: `sand-scraper/src/sand_scraper/cli.py`
- Test: `sand-scraper/tests/test_cli.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_cli.py`)

```python
from sand_scraper.cli import build_parser


def test_parser_has_icons_and_no_names_flags():
    args = build_parser().parse_args(["--icons", "--no-names"])
    assert args.icons is True
    assert args.no_names is True


def test_parser_defaults_names_on_icons_off():
    args = build_parser().parse_args([])
    assert args.icons is False
    assert args.no_names is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_cli.py -k flags -v`
Expected: FAIL — `AttributeError: 'Namespace' object has no attribute 'icons'`

- [ ] **Step 3: Write minimal implementation**

In `src/sand_scraper/cli.py`:

Add to `build_parser()` (after the existing `--validate` line):

```python
    p.add_argument("--icons", action="store_true", help="Export item icons and write the icon manifest")
    p.add_argument("--no-names", action="store_true", help="Skip I2 localization (recipe-only, faster)")
```

Add imports at the top:

```python
from sand_scraper.icons import build_icon_manifest, export_sprites, load_overrides, write_manifest
from sand_scraper.localization import load_item_localization
```

Change `run()` to accept and use the new flags. Replace the current `run(cfg, *, strict, raw, validate)` definition body's first lines so it loads localization and threads it into `transform`, and runs icon export after writing output:

```python
def run(cfg: Config, *, strict: bool, raw: bool, validate: bool, icons: bool, no_names: bool) -> int:
    objects = load_objects(cfg.bundle_paths())
    if raw:
        _dump_raw(objects, cfg.raw_dump_dir)

    localization = None if no_names else load_item_localization(cfg.data_unity3d_path)
    payload, warnings = transform(objects, localization)
    output = assemble(
        payload,
        game_version=_read_game_version(cfg),
        scraped_at=datetime.now(timezone.utc).isoformat(),
        source_bundles=[Path(b).name for b in cfg.target_bundles],
    )
    write_output(output, cfg.output_path)

    if icons:
        sprite_to_png, icon_warnings = export_sprites(cfg.ui_bundle_path, cfg.icons_out_dir)
        warnings.extend(icon_warnings)
        overrides = load_overrides(cfg.icon_overrides_path)
        manifest, missing = build_icon_manifest([i["id"] for i in output["items"]], sprite_to_png, overrides)
        write_manifest(manifest, cfg.icons_manifest_path)
        print(f"Wrote {len(manifest)} icons -> {cfg.icons_manifest_path}"
              f" ({len(missing)} items without an icon)")

    for w in warnings:
        print(f"WARN: {w}")
    print(f"Wrote {len(output['items'])} items, {len(output['recipes'])} recipes -> {cfg.output_path}")

    if validate:
        validate_output(output)
        if not output["items"] or not output["recipes"]:
            print("VALIDATE: empty items or recipes")
            return 1
        print("VALIDATE: ok")

    if strict and warnings:
        print(f"STRICT: {len(warnings)} warning(s) -> failing")
        return 1
    return 0
```

Update the `main()` call site that invokes `run(...)`:

```python
        return run(cfg, strict=args.strict, raw=args.raw, validate=args.validate,
                   icons=args.icons, no_names=args.no_names)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_cli.py -v`
Expected: PASS. If an existing CLI test calls `run(...)` without the new kwargs, update it to pass `icons=False, no_names=False`.

- [ ] **Step 5: Commit**

```bash
git add sand-scraper/src/sand_scraper/cli.py sand-scraper/tests/test_cli.py
git commit -m "feat: --icons and --no-names CLI flags"
```

---

## Task 9: Full-suite green + real-data validation run

**Files:**
- Create (generated, do not hand-edit): `sand-scraper/out/data.json`, `sand-scraper/out/icons.json`, `sand-scraper/out/icons/*.png`
- Possibly create: `sand-scraper/icon_overrides.json`

- [ ] **Step 1: Run the full unit suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (all prior 36 tests + the new ones).

- [ ] **Step 2: Real names run (requires the game install on this machine)**

Run: `.venv/Scripts/python -m sand_scraper --validate`
Expected: `VALIDATE: ok`. Inspect `out/data.json`: `item_shotgun` should have `"displayName": "Pepper Mill Shotgun"`. Expect a small number (≈2) of `WARN: no localized name for ...` lines — record which ids.

- [ ] **Step 3: Real icons run**

Run: `.venv/Scripts/python -m sand_scraper --icons --validate`
Expected: `out/icons/` fills with PNGs, `out/icons.json` maps ids → png paths, and a line reporting how many items lack an icon (expect a majority initially, since auto-match covers ~33%).

- [ ] **Step 4: Seed `icon_overrides.json` for high-value misses (optional, time-boxed)**

For the most important items lacking an icon, add `{itemId: spriteName}` entries to `sand-scraper/icon_overrides.json` (sprite names are the PNG filenames in `out/icons/`). Re-run Step 3 and confirm the missing count drops. This file is curated and committed.

- [ ] **Step 5: Commit**

```bash
git add sand-scraper/icon_overrides.json
git commit -m "feat: seed curated icon overrides"
```

(Do not commit `out/` — confirm it is gitignored; the existing `.gitignore` already ignores `out/`.)

---

## Task 10: Wiki handoff note (docs only)

**Files:**
- Modify: `docs/superpowers/findings/2026-06-08-sand-bundle-schema.md` (add a correction note) OR create `docs/superpowers/findings/2026-06-09-sand-localization-icons.md`

- [ ] **Step 1: Record the outcome**

Create `docs/superpowers/findings/2026-06-09-sand-localization-icons.md` summarizing: names are recoverable from the I2 `LanguageSourceData` (no IL2CPP RE), the `Items/{id}_name` convention, the icon match-and-override approach, the final localized-name coverage (N/121), and the icon coverage (auto + overrides). Note the new outputs: `displayName`/`description` in `data.json`, and `out/icons.json` + `out/icons/`.

- [ ] **Step 2: Note the wiki consumption path**

State that the wiki should switch item display from `name` to `displayName`, render `description`, and copy `out/icons/` + `out/icons.json` into the wiki (mirroring how `data.json` is snapshotted into `sand-wiki/prisma/`). This is a separate wiki task, not part of this plan.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/findings/2026-06-09-sand-localization-icons.md
git commit -m "docs: localization + icons extraction findings"
```

---

## Self-review notes

- **Spec coverage:** names (Tasks 1–3), descriptions (Tasks 2–3), category labels — extractor supports arbitrary prefixes (Task 1) but per the spec's output contract only `displayName`/`description` are emitted; icons export + auto-match + overrides + manifest (Tasks 5–6, 8); CLI flags + config (Tasks 7–8); error handling (hard error on missing I2 object in Task 2's `load_i2_blob`; per-term/per-sprite skips in Tasks 1 & 6; fallback-with-warning in Task 3; missing-icon count in Task 8); tests (each task). Real-run validation (Task 9).
- **Naming:** `displayName`, `description`, `ItemLocalization.names/descriptions`, `build_icon_manifest`, `export_sprites`, `load_overrides`, `write_manifest`, `load_item_localization`, `load_i2_blob` — used consistently across tasks.
- **English-only output / multi-language deferred** and **no IL2CPP toolchain** — honored (parser reads `Languages[0]` only; no dumper).
