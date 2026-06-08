# SAND Game-File Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a re-runnable Python tool that extracts items, crafting recipes, and the tech tree (plus equipment/loot extras) from the installed *SAND* game files and emits a `data.json` the wiki's `prisma/seed.ts` ingests.

**Architecture:** A standalone `sand-scraper/` project (src layout). A three-stage pipeline — **extract** (UnityPy reads Addressable bundles → raw MonoBehaviour dicts + a cross-reference index), **transform** (pure mapping of game objects → the wiki seed schema + extras), **emit** (slugify, stable-sort, stamp meta, write JSON). All testable business logic is pure and lives in `transform.py` / `emit.py` / utility modules, unit-tested with pytest over real fixtures captured by an early spike. Extraction is exercised by an integration check that auto-skips when game files are absent.

**Tech Stack:** Python 3.12, [UnityPy](https://github.com/K0lb3/UnityPy) (pinned), `tomllib` (stdlib) for config, pytest for tests. Il2CppDumper is a conditional fallback used only if the spike shows TypeTrees are stripped.

**Source spec:** `docs/superpowers/specs/2026-06-08-sand-scraper-design.md`
**Game install:** `F:\SteamLibrary\steamapps\common\Sand Playtest`
**Repo root:** `d:\Documents\SandLabs` — all `git` commands run from here. All `python`/`pytest` commands run from `sand-scraper/` unless stated.

---

## File Structure

```
sand-scraper/
  pyproject.toml                 # project metadata + pinned deps              (Task 1)
  config.toml                    # game path, target bundles, output path      (Task 1)
  README.md                      # run + re-run instructions                   (Task 9)
  src/sand_scraper/
    __init__.py                  # version                                     (Task 1)
    __main__.py                  # enables `python -m sand_scraper`            (Task 1)
    cli.py                       # arg parsing, pipeline wiring                 (Task 1, 8)
    config.py                    # load/validate config.toml                   (Task 1)
    slugify.py                   # name -> url slug (pure)                      (Task 4)
    schema.py                    # output TypedDicts + validate_output (pure)   (Task 3)
    extract.py                   # UnityPy bundle reading + PPtr index          (Task 5)
    transform.py                 # raw objects -> seed schema + extras (pure)   (Task 6)
    emit.py                      # assemble + sort + meta -> data.json (pure)   (Task 7)
  scripts/
    spike.py                     # one-off discovery of class/field names       (Task 2)
  tests/
    test_slugify.py                                                            (Task 4)
    test_schema.py                                                             (Task 3)
    test_extract.py              # pure index/pptr tests with fake objects      (Task 5)
    test_transform.py            # mapping tests over real fixtures             (Task 6)
    test_emit.py                                                               (Task 7)
    test_integration.py          # end-to-end against real game (auto-skips)    (Task 8)
    fixtures/                    # real raw objects captured by the spike       (Task 2)
  out/                           # data.json + raw/ (gitignored)
docs/superpowers/findings/
  2026-06-08-sand-bundle-schema.md   # spike findings: real class/field names  (Task 2)
```

---

## Task 1: Scaffold the `sand-scraper` project

**Files:**
- Create: `sand-scraper/pyproject.toml`
- Create: `sand-scraper/config.toml`
- Create: `sand-scraper/src/sand_scraper/__init__.py`
- Create: `sand-scraper/src/sand_scraper/__main__.py`
- Create: `sand-scraper/src/sand_scraper/config.py`
- Create: `sand-scraper/src/sand_scraper/cli.py`
- Modify: `d:\Documents\SandLabs\.gitignore`

- [ ] **Step 1: Create `sand-scraper/pyproject.toml`**

```toml
[project]
name = "sand-scraper"
version = "0.1.0"
description = "Extracts item, crafting, and tech-tree data from SAND game files for the wiki."
requires-python = ">=3.12"
dependencies = [
    "UnityPy==1.20.6",
]

[project.optional-dependencies]
dev = ["pytest==8.3.4"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

- [ ] **Step 2: Create `sand-scraper/config.toml`**

```toml
# Absolute path to the game's data folder (contains StreamingAssets, il2cpp_data).
game_data_dir = "F:/SteamLibrary/steamapps/common/Sand Playtest/Sand_Data"

# Bundles to scan, relative to game_data_dir. Names confirmed from the install on 2026-06-08.
target_bundles = [
    "StreamingAssets/aa/StandaloneWindows64/craftingrecipes_assets_all.bundle",
    "StreamingAssets/aa/StandaloneWindows64/configuration_assets_all.bundle",
    "StreamingAssets/aa/StandaloneWindows64/clientconfiguration_assets_all.bundle",
    "StreamingAssets/aa/StandaloneWindows64/equipment_assets_all.bundle",
    "StreamingAssets/aa/StandaloneWindows64/lootsets_assets_all.bundle",
    # The monoscripts bundle provides class names for m_Script references; always load it.
    "StreamingAssets/aa/StandaloneWindows64/sand_monoscripts.bundle",
]

output_path = "out/data.json"
raw_dump_dir = "out/raw"
```

- [ ] **Step 3: Create `sand-scraper/src/sand_scraper/__init__.py`**

```python
__version__ = "0.1.0"
```

- [ ] **Step 4: Create `sand-scraper/src/sand_scraper/__main__.py`**

```python
from sand_scraper.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Create `sand-scraper/src/sand_scraper/config.py`**

```python
from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    game_data_dir: Path
    target_bundles: list[str]
    output_path: Path
    raw_dump_dir: Path

    def bundle_paths(self) -> list[Path]:
        return [self.game_data_dir / rel for rel in self.target_bundles]


def load_config(path: Path) -> Config:
    """Load and validate config.toml. Raises FileNotFoundError with a clear message."""
    if not path.is_file():
        raise FileNotFoundError(f"Config not found: {path}")
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    base = path.parent
    return Config(
        game_data_dir=Path(raw["game_data_dir"]),
        target_bundles=list(raw["target_bundles"]),
        output_path=(base / raw["output_path"]),
        raw_dump_dir=(base / raw["raw_dump_dir"]),
    )
```

- [ ] **Step 6: Create a minimal `sand-scraper/src/sand_scraper/cli.py`** (expanded in Task 8)

```python
from __future__ import annotations

import argparse
from pathlib import Path

from sand_scraper import __version__


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="sand_scraper", description="Extract SAND game data.")
    p.add_argument("--config", type=Path, default=Path("config.toml"), help="Path to config.toml")
    p.add_argument("--strict", action="store_true", help="Exit non-zero on any unmapped/dangling object")
    p.add_argument("--raw", action="store_true", help="Also write raw object dumps to raw_dump_dir")
    p.add_argument("--validate", action="store_true", help="Run, then assert output is non-empty and valid")
    p.add_argument("--version", action="version", version=f"sand-scraper {__version__}")
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    # Full pipeline wired in Task 8.
    print(f"sand-scraper {__version__} (config={args.config})")
    return 0
```

- [ ] **Step 7: Append to `d:\Documents\SandLabs\.gitignore`**

Add these lines to the existing file:

```
# sand-scraper
sand-scraper/out/
__pycache__/
*.pyc
.pytest_cache/
*.egg-info/
.venv/
```

- [ ] **Step 8: Create the virtualenv and install** (from `sand-scraper/`)

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
```
Expected: installs UnityPy 1.20.6 and pytest with no errors.

> All later `python`/`pytest` commands use this interpreter: `.venv/Scripts/python -m ...`.

- [ ] **Step 9: Verify the CLI runs**

Run: `.venv/Scripts/python -m sand_scraper --version`
Expected: prints `sand-scraper 0.1.0`.
Run: `.venv/Scripts/python -m sand_scraper --help`
Expected: usage text listing `--config --strict --raw --validate`.

- [ ] **Step 10: Commit** (from repo root)

```bash
git add sand-scraper/pyproject.toml sand-scraper/config.toml sand-scraper/src .gitignore
git commit -m "chore: scaffold sand-scraper project and CLI skeleton"
```

---

## Task 2: Discovery spike — find real class names, field names, and typetree status

This is an **investigation task**, not TDD. Its deliverables are (a) committed test fixtures of real objects and (b) a findings doc recording the actual class/field names that Tasks 5–6 depend on. Do not proceed to Task 6 without it.

**Files:**
- Create: `sand-scraper/scripts/spike.py`
- Create (output): `sand-scraper/tests/fixtures/*.json` (committed)
- Create: `docs/superpowers/findings/2026-06-08-sand-bundle-schema.md`

- [ ] **Step 1: Write `sand-scraper/scripts/spike.py`**

```python
"""One-off discovery script. Lists MonoBehaviour classes per bundle, detects whether
TypeTrees are embedded, and dumps a few sample objects so we can read the real field names.

Run: .venv/Scripts/python scripts/spike.py
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import UnityPy

from sand_scraper.config import load_config

# Base MonoBehaviour fields present even when the script's own TypeTree is stripped.
BASE_MB_KEYS = {"m_GameObject", "m_Enabled", "m_Script", "m_Name"}


def script_class_name(reader) -> str:
    """Resolve a MonoBehaviour's C# class name via its m_Script PPtr; '' if unresolved."""
    try:
        mb = reader.read()
        script = mb.m_Script.read()
        return getattr(script, "m_ClassName", "") or getattr(script, "m_Name", "")
    except Exception:
        return ""


def main() -> None:
    cfg = load_config(Path("config.toml"))
    fixtures_dir = Path("tests/fixtures")
    fixtures_dir.mkdir(parents=True, exist_ok=True)

    for bundle in cfg.bundle_paths():
        if not bundle.is_file():
            print(f"!! missing: {bundle}")
            continue
        env = UnityPy.load(str(bundle))
        classes: Counter[str] = Counter()
        stripped_seen = False
        samples_dumped = 0

        for obj in env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            cls = script_class_name(obj)
            classes[cls] += 1
            tree = obj.read_typetree()
            if set(tree.keys()) <= BASE_MB_KEYS:
                stripped_seen = True
            elif samples_dumped < 3:
                # Dump the first few rich objects from each bundle for inspection.
                name = tree.get("m_Name") or f"path{obj.path_id}"
                safe = "".join(c if c.isalnum() else "_" for c in f"{bundle.stem}_{cls}_{name}")
                (fixtures_dir / f"{safe}.json").write_text(
                    json.dumps(tree, indent=2, default=str), encoding="utf-8"
                )
                samples_dumped += 1

        print(f"\n== {bundle.name} ==")
        print(f"   typetree_stripped={stripped_seen}")
        for cls, n in classes.most_common():
            print(f"   {n:5d}  {cls or '<unresolved>'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the spike**

Run (from `sand-scraper/`): `.venv/Scripts/python scripts/spike.py`
Expected: per-bundle listing of class names + counts, a `typetree_stripped` flag, and sample
`*.json` files written under `tests/fixtures/`.

- [ ] **Step 3: Decide the typetree path**

- If every bundle prints `typetree_stripped=False` and the sample fixtures contain rich fields
  (recipe ingredients, costs, etc.) → **TypeTrees are embedded; no Il2CppDumper needed.** Continue.
- If `typetree_stripped=True` and fixtures contain only the 4 base keys → see Task 2a (fallback)
  before continuing.

- [ ] **Step 4: Identify the key classes from the output**

From the printed class names and the dumped fixtures, identify and note:
- The **item/definition** class (in `configuration`/`clientconfiguration`) and its fields for:
  name, type/category, workbench level, craft time, unlock conditions, is-resource flag.
- The **crafting recipe** class (in `craftingrecipes`) and how it references the output item and
  its ingredients (PPtr list + quantities).
- The **tech node** class and its cost list (resource PPtr + quantity) and prerequisite PPtrs.
- The **equipment** and **loot set** classes (for extras).

- [ ] **Step 5: Write `docs/superpowers/findings/2026-06-08-sand-bundle-schema.md`**

Record, with real values from Step 4 (this is the contract Task 6 maps against):

```markdown
# SAND bundle schema findings (2026-06-08)

TypeTrees embedded: <yes/no>

## Item class: `<RealClassName>`  (bundle: configuration)
| Wiki field        | Source field         | Notes |
|-------------------|----------------------|-------|
| name              | `<m_DisplayName?>`   |       |
| type              | `<m_Category?>`      | enum int -> label map: {...} |
| workbenchLevel    | `<...>`              |       |
| craftTimeSeconds  | `<...>`              | unit: seconds? ms? |
| unlockConditions  | `<...>`              |       |
| isResource        | `<...>`              |       |

## Recipe class: `<RealClassName>`  (bundle: craftingrecipes)
- output item ref: `<field>` (PPtr -> item)
- ingredients: `<field>` = list of { item PPtr `<field>`, quantity `<field>` }

## Tech node class: `<RealClassName>`
- costs: `<field>` = list of { resource PPtr `<field>`, quantity `<field>` }
- prerequisites: `<field>` = list of PPtr -> tech node

## Equipment class / Loot set class (extras)
- <fields of interest>
```

- [ ] **Step 6: Trim fixtures to a useful, small set**

Keep ~5–8 representative fixtures (at least: one item, one resource-type item, one recipe,
one tech node with prerequisites, one equipment, one loot set). Delete the rest from
`tests/fixtures/`. Rename them to clear names, e.g. `item_iron_plate.json`, `recipe_scrap_rifle.json`,
`technode_basic_weapons.json`, `equipment_<x>.json`, `lootset_<x>.json`.

- [ ] **Step 7: Commit** (from repo root)

```bash
git add sand-scraper/scripts/spike.py sand-scraper/tests/fixtures docs/superpowers/findings/2026-06-08-sand-bundle-schema.md
git commit -m "chore: spike SAND bundle schema and capture fixtures"
```

---

## Task 2a: Il2CppDumper fallback (ONLY if Task 2 Step 3 found stripped typetrees)

Skip entirely if TypeTrees are embedded.

**Files:**
- Create: `sand-scraper/src/sand_scraper/typeinfo.py`
- Modify: `sand-scraper/config.toml` (add `[il2cpp]` section)

- [ ] **Step 1: Generate type info with Il2CppDumper** (manual, one-time)

Download Il2CppDumper (https://github.com/Perfare/Il2CppDumper). Run it against the game's
`GameAssembly.dll` and `Sand_Data/il2cpp_data/Metadata/global-metadata.dat`. This produces a
`DummyDll/` folder of managed type stubs. Place it at `sand-scraper/il2cpp/DummyDll/`.

- [ ] **Step 2: Add config** — append to `config.toml`:

```toml
[il2cpp]
dummy_dll_dir = "il2cpp/DummyDll"
unity_version = "<value from boot.config / spike output>"
```

- [ ] **Step 3: Create `typeinfo.py`** to build a UnityPy TypeTreeGenerator from the DummyDlls

```python
from __future__ import annotations

from pathlib import Path

from UnityPy.helpers import TypeTreeHelper  # API confirmed against UnityPy 1.20.6 in the spike


def load_generator(dummy_dll_dir: Path, unity_version: str):
    """Return a typetree generator UnityPy can use to parse MonoBehaviours whose
    embedded TypeTrees were stripped. Wraps Il2CppDumper DummyDll output."""
    from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

    gen = TypeTreeGenerator(unity_version)
    gen.load_local_dll_folder(str(dummy_dll_dir))
    return gen
```

- [ ] **Step 4: Note for Task 5** — when a generator is configured, `extract.py` passes it to
  `obj.read_typetree(generator)` instead of `obj.read_typetree()`. (Wire-up lives in Task 5 Step 5.)

- [ ] **Step 5: Re-run the spike** (Task 2 Step 2) and confirm fixtures now contain rich fields,
  then complete Task 2 Steps 4–7.

- [ ] **Step 6: Commit** (from repo root)

```bash
git add sand-scraper/src/sand_scraper/typeinfo.py sand-scraper/config.toml
git commit -m "feat: Il2CppDumper typetree fallback for stripped MonoBehaviours"
```

---

## Task 3: Output schema + validator (pure, TDD)

**Files:**
- Create: `sand-scraper/src/sand_scraper/schema.py`
- Test: `sand-scraper/tests/test_schema.py`

- [ ] **Step 1: Write the failing test** — `tests/test_schema.py`

```python
import pytest

from sand_scraper.schema import validate_output


def _valid():
    return {
        "meta": {"gameVersion": "1.0", "scrapedAt": "2026-06-08T00:00:00Z", "sourceBundles": ["a"]},
        "items": [{"slug": "iron-ore", "name": "Iron Ore", "type": "resource", "isResource": True}],
        "techNodes": [{"slug": "metalworking", "name": "Metalworking",
                       "costs": [{"resource": "iron-ore", "quantity": 20}], "prerequisites": []}],
        "extras": {"equipment": [], "lootSets": []},
    }


def test_accepts_valid_output():
    validate_output(_valid())  # should not raise


def test_rejects_missing_top_level_key():
    data = _valid()
    del data["techNodes"]
    with pytest.raises(ValueError, match="techNodes"):
        validate_output(data)


def test_rejects_item_without_slug():
    data = _valid()
    del data["items"][0]["slug"]
    with pytest.raises(ValueError, match="slug"):
        validate_output(data)


def test_rejects_technode_cost_without_quantity():
    data = _valid()
    del data["techNodes"][0]["costs"][0]["quantity"]
    with pytest.raises(ValueError, match="quantity"):
        validate_output(data)
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_schema.py -v`
Expected: FAIL — `cannot import name 'validate_output'`.

- [ ] **Step 3: Implement `src/sand_scraper/schema.py`**

```python
from __future__ import annotations

from typing import Any, TypedDict


class RecipeEntry(TypedDict):
    ingredient: str
    quantity: int


class Item(TypedDict, total=False):
    slug: str
    name: str
    type: str
    isResource: bool
    description: str | None
    workbenchLevel: int | None
    craftTimeSeconds: int | None
    unlockConditions: str | None
    unlockedBy: str | None
    imageAlt: str | None
    recipe: list[RecipeEntry]


class TechCost(TypedDict):
    resource: str
    quantity: int


class TechNode(TypedDict, total=False):
    slug: str
    name: str
    description: str | None
    costs: list[TechCost]
    prerequisites: list[str]


def _require(obj: dict[str, Any], key: str, where: str) -> Any:
    if key not in obj:
        raise ValueError(f"Missing '{key}' in {where}")
    return obj[key]


def validate_output(data: dict[str, Any]) -> None:
    """Raise ValueError if the output dict does not satisfy the seed contract."""
    for key in ("meta", "items", "techNodes", "extras"):
        _require(data, key, "output root")

    for i, item in enumerate(data["items"]):
        where = f"items[{i}]"
        _require(item, "slug", where)
        _require(item, "name", where)
        _require(item, "type", where)
        for j, r in enumerate(item.get("recipe", [])):
            _require(r, "ingredient", f"{where}.recipe[{j}]")
            _require(r, "quantity", f"{where}.recipe[{j}]")

    for i, node in enumerate(data["techNodes"]):
        where = f"techNodes[{i}]"
        _require(node, "slug", where)
        _require(node, "name", where)
        for j, c in enumerate(node.get("costs", [])):
            _require(c, "resource", f"{where}.costs[{j}]")
            _require(c, "quantity", f"{where}.costs[{j}]")
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_schema.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit** (from repo root)

```bash
git add sand-scraper/src/sand_scraper/schema.py sand-scraper/tests/test_schema.py
git commit -m "feat: output schema types and validator"
```

---

## Task 4: Slugify utility (pure, TDD)

**Files:**
- Create: `sand-scraper/src/sand_scraper/slugify.py`
- Test: `sand-scraper/tests/test_slugify.py`

- [ ] **Step 1: Write the failing test** — `tests/test_slugify.py`

```python
from sand_scraper.slugify import slugify


def test_lowercases_and_hyphenates_spaces():
    assert slugify("Scrap Rifle") == "scrap-rifle"


def test_strips_punctuation():
    assert slugify("Iron Plate (Mk.II)") == "iron-plate-mk-ii"


def test_collapses_and_trims_separators():
    assert slugify("  Heavy   Armor!! ") == "heavy-armor"


def test_keeps_digits():
    assert slugify("Workbench 2") == "workbench-2"


def test_empty_becomes_empty():
    assert slugify("!!!") == ""
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_slugify.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/sand_scraper/slugify.py`**

```python
from __future__ import annotations

import re

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    """Lowercase, replace any run of non-alphanumerics with a single hyphen, trim hyphens."""
    return _NON_ALNUM.sub("-", name.lower()).strip("-")
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_slugify.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit** (from repo root)

```bash
git add sand-scraper/src/sand_scraper/slugify.py sand-scraper/tests/test_slugify.py
git commit -m "feat: slugify utility"
```

---

## Task 5: Extraction harness — UnityPy bundles → records + reference index

`extract.py` exposes a pure, testable core (record dataclass, index, PPtr resolution) plus a thin
UnityPy-driven loader. The pure parts are unit-tested with fake objects; the loader is exercised by
the integration test in Task 8.

**Files:**
- Create: `sand-scraper/src/sand_scraper/extract.py`
- Test: `sand-scraper/tests/test_extract.py`

- [ ] **Step 1: Write the failing test** — `tests/test_extract.py`

```python
import pytest

from sand_scraper.extract import RawObject, ObjectIndex


def test_index_resolves_by_pathid():
    a = RawObject(class_name="Item", name="Iron Ore", file_id=0, path_id=10, fields={})
    b = RawObject(class_name="Item", name="Fuel", file_id=0, path_id=20, fields={})
    idx = ObjectIndex([a, b])
    assert idx.resolve(0, 10) is a
    assert idx.resolve(0, 20) is b


def test_resolve_pptr_reads_fileid_pathid_dict():
    a = RawObject(class_name="Item", name="Iron Ore", file_id=0, path_id=10, fields={})
    idx = ObjectIndex([a])
    pptr = {"m_FileID": 0, "m_PathID": 10}
    assert idx.resolve_pptr(pptr) is a


def test_resolve_pptr_returns_none_for_null_pointer():
    idx = ObjectIndex([])
    assert idx.resolve_pptr({"m_FileID": 0, "m_PathID": 0}) is None


def test_resolve_pptr_missing_target_returns_none():
    idx = ObjectIndex([])
    assert idx.resolve_pptr({"m_FileID": 0, "m_PathID": 99}) is None


def test_by_class_groups_objects():
    a = RawObject(class_name="Item", name="A", file_id=0, path_id=1, fields={})
    b = RawObject(class_name="Recipe", name="B", file_id=0, path_id=2, fields={})
    c = RawObject(class_name="Item", name="C", file_id=0, path_id=3, fields={})
    idx = ObjectIndex([a, b, c])
    assert idx.by_class("Item") == [a, c]
    assert idx.by_class("Recipe") == [b]
    assert idx.by_class("Nope") == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_extract.py -v`
Expected: FAIL — cannot import `RawObject` / `ObjectIndex`.

- [ ] **Step 3: Implement the pure core in `src/sand_scraper/extract.py`**

```python
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


@dataclass
class RawObject:
    """A decoded MonoBehaviour: its C# class, its m_Name, and its full typetree fields."""
    class_name: str
    name: str
    file_id: int
    path_id: int
    fields: dict[str, Any]


class ObjectIndex:
    """Lookup of RawObjects by (file_id, path_id), with PPtr resolution and class grouping."""

    def __init__(self, objects: Iterable[RawObject]):
        self._objects = list(objects)
        self._by_key: dict[tuple[int, int], RawObject] = {
            (o.file_id, o.path_id): o for o in self._objects
        }

    def __iter__(self):
        return iter(self._objects)

    def resolve(self, file_id: int, path_id: int) -> RawObject | None:
        return self._by_key.get((file_id, path_id))

    def resolve_pptr(self, pptr: dict[str, Any] | None) -> RawObject | None:
        """Resolve a Unity PPtr dict {m_FileID, m_PathID}. A 0 path id is a null pointer."""
        if not pptr:
            return None
        path_id = pptr.get("m_PathID", 0)
        if path_id == 0:
            return None
        return self.resolve(pptr.get("m_FileID", 0), path_id)

    def by_class(self, class_name: str) -> list[RawObject]:
        return [o for o in self._objects if o.class_name == class_name]
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_extract.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the UnityPy loader to `src/sand_scraper/extract.py`** (append below the pure core)

```python
def _script_class_name(reader) -> str:
    """Resolve a MonoBehaviour's C# class via its m_Script PPtr; '' if unresolved."""
    try:
        mb = reader.read()
        script = mb.m_Script.read()
        return getattr(script, "m_ClassName", "") or getattr(script, "m_Name", "")
    except Exception:
        return ""


def load_objects(
    bundle_paths: list[Path],
    typetree_generator: Any | None = None,
    raw_dump_dir: Path | None = None,
) -> ObjectIndex:
    """Load all MonoBehaviours from the given bundles into an ObjectIndex.

    Raises FileNotFoundError listing any missing bundle. If raw_dump_dir is set,
    each object's typetree is also written there as JSON for debugging.
    """
    import json

    import UnityPy

    missing = [p for p in bundle_paths if not p.is_file()]
    if missing:
        listed = "\n  ".join(str(p) for p in missing)
        raise FileNotFoundError(f"Missing game bundle(s):\n  {listed}")

    objects: list[RawObject] = []
    if raw_dump_dir is not None:
        raw_dump_dir.mkdir(parents=True, exist_ok=True)

    for path in bundle_paths:
        env = UnityPy.load(str(path))
        for obj in env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            tree = obj.read_typetree(typetree_generator) if typetree_generator else obj.read_typetree()
            name = tree.get("m_Name", "") or ""
            ro = RawObject(
                class_name=_script_class_name(obj),
                name=name,
                file_id=0,  # single-env resolution: all loaded objects share file space 0
                path_id=int(obj.path_id),
                fields=tree,
            )
            objects.append(ro)
            if raw_dump_dir is not None:
                (raw_dump_dir / f"{ro.path_id}.json").write_text(
                    json.dumps(tree, indent=2, default=str), encoding="utf-8"
                )

    return ObjectIndex(objects)
```

> Note: PPtr `m_FileID` is normalized to 0 because all target bundles are loaded into one
> resolution space and cross-bundle script refs are only used for class-name lookup (handled
> separately via `_script_class_name`). If the spike shows data refs spanning files with non-zero
> `m_FileID`, revisit this in Task 6 — the fixtures will reveal it.

- [ ] **Step 6: Commit** (from repo root)

```bash
git add sand-scraper/src/sand_scraper/extract.py sand-scraper/tests/test_extract.py
git commit -m "feat: UnityPy extraction harness with reference index"
```

---

## Task 6: Transform — game objects → seed schema + extras (pure, TDD)

This is the core mapping. The **single point of game-specific knowledge** is the `FIELDS` block at
the top of `transform.py`, populated from the Task 2 findings doc. The tests run over the **real
fixtures** captured in Task 2.

**Files:**
- Create: `sand-scraper/src/sand_scraper/transform.py`
- Test: `sand-scraper/tests/test_transform.py`

- [ ] **Step 1: Fill the `FIELDS` mapping from findings, then write `src/sand_scraper/transform.py`**

Replace each `"<...>"` below with the **real field name** from
`docs/superpowers/findings/2026-06-08-sand-bundle-schema.md`. Class names in `CLASSES` likewise.

```python
from __future__ import annotations

from typing import Any

from sand_scraper.extract import ObjectIndex, RawObject
from sand_scraper.slugify import slugify

# --- Game-specific mapping (populated from the Task 2 findings doc) -------------------
CLASSES = {
    "item": "<ItemClassName>",
    "recipe": "<RecipeClassName>",
    "technode": "<TechNodeClassName>",
    "equipment": "<EquipmentClassName>",
    "lootset": "<LootSetClassName>",
}

FIELDS = {
    # item
    "item_display_name": "<m_DisplayName>",
    "item_type": "<m_Category>",
    "item_workbench_level": "<m_WorkbenchLevel>",
    "item_craft_time": "<m_CraftTimeSeconds>",
    "item_unlock_conditions": "<m_UnlockText>",
    "item_is_resource": "<m_IsResource>",
    # recipe
    "recipe_output_pptr": "<m_OutputItem>",
    "recipe_ingredients": "<m_Ingredients>",     # list of dicts
    "recipe_ing_item_pptr": "<m_Item>",          # key inside an ingredient dict
    "recipe_ing_quantity": "<m_Amount>",         # key inside an ingredient dict
    # tech node
    "tech_costs": "<m_Costs>",                    # list of dicts
    "tech_cost_resource_pptr": "<m_Resource>",
    "tech_cost_quantity": "<m_Amount>",
    "tech_prereqs": "<m_Prerequisites>",          # list of PPtr dicts
}

# Map the game's numeric/enum item category to a wiki-facing label, if needed.
# Leave as identity if the source already stores readable strings.
TYPE_LABELS: dict[Any, str] = {}
# -------------------------------------------------------------------------------------


class TransformWarning(Exception):
    """Collected, not raised, unless --strict. Carries a human-readable reason."""


def _label_type(raw_value: Any) -> str:
    return TYPE_LABELS.get(raw_value, str(raw_value))


def _slug_of(obj: RawObject) -> str:
    name = obj.fields.get(FIELDS["item_display_name"]) or obj.name
    return slugify(str(name))


def transform(index: ObjectIndex) -> tuple[dict[str, Any], list[str]]:
    """Return (output_without_meta, warnings). `meta` is added later by emit.py.

    output keys: items, techNodes, extras. warnings lists dangling refs / skips.
    """
    warnings: list[str] = []

    items = index.by_class(CLASSES["item"])
    slug_by_pathid: dict[int, str] = {it.path_id: _slug_of(it) for it in items}

    def resolve_item_slug(pptr: dict[str, Any] | None, ctx: str) -> str | None:
        target = index.resolve_pptr(pptr)
        if target is None:
            warnings.append(f"{ctx}: unresolved item reference {pptr}")
            return None
        return slug_by_pathid.get(target.path_id) or _slug_of(target)

    # --- items (with recipes attached) ---
    recipes_by_output: dict[int, RawObject] = {}
    for rec in index.by_class(CLASSES["recipe"]):
        out = index.resolve_pptr(rec.fields.get(FIELDS["recipe_output_pptr"]))
        if out is None:
            warnings.append(f"recipe {rec.name}: unresolved output item")
            continue
        recipes_by_output[out.path_id] = rec

    out_items: list[dict[str, Any]] = []
    for it in items:
        f = it.fields
        slug = slug_by_pathid[it.path_id]
        entry: dict[str, Any] = {
            "slug": slug,
            "name": str(f.get(FIELDS["item_display_name"]) or it.name),
            "type": _label_type(f.get(FIELDS["item_type"])),
            "isResource": bool(f.get(FIELDS["item_is_resource"], False)),
            "workbenchLevel": f.get(FIELDS["item_workbench_level"]),
            "craftTimeSeconds": f.get(FIELDS["item_craft_time"]),
            "unlockConditions": f.get(FIELDS["item_unlock_conditions"]),
            "imageAlt": None,  # never extract protected assets; alt text only, added manually
        }
        rec = recipes_by_output.get(it.path_id)
        if rec is not None:
            recipe: list[dict[str, Any]] = []
            for ing in rec.fields.get(FIELDS["recipe_ingredients"], []) or []:
                ing_slug = resolve_item_slug(ing.get(FIELDS["recipe_ing_item_pptr"]), f"recipe {rec.name}")
                if ing_slug is None:
                    continue
                recipe.append({"ingredient": ing_slug, "quantity": int(ing.get(FIELDS["recipe_ing_quantity"], 0))})
            if recipe:
                entry["recipe"] = recipe
        out_items.append(entry)

    # --- tech nodes ---
    tech_objs = index.by_class(CLASSES["technode"])
    tech_slug: dict[int, str] = {t.path_id: slugify(str(t.name)) for t in tech_objs}
    out_tech: list[dict[str, Any]] = []
    for t in tech_objs:
        f = t.fields
        costs: list[dict[str, Any]] = []
        for c in f.get(FIELDS["tech_costs"], []) or []:
            res_slug = resolve_item_slug(c.get(FIELDS["tech_cost_resource_pptr"]), f"tech {t.name}")
            if res_slug is None:
                continue
            costs.append({"resource": res_slug, "quantity": int(c.get(FIELDS["tech_cost_quantity"], 0))})
        prereqs: list[str] = []
        for p in f.get(FIELDS["tech_prereqs"], []) or []:
            target = index.resolve_pptr(p)
            if target is None:
                warnings.append(f"tech {t.name}: unresolved prerequisite {p}")
                continue
            prereqs.append(tech_slug.get(target.path_id) or slugify(str(target.name)))
        out_tech.append({
            "slug": tech_slug[t.path_id],
            "name": str(t.name),
            "description": None,
            "costs": costs,
            "prerequisites": prereqs,
        })

    # --- extras (captured raw-ish for later; not consumed by seed.ts today) ---
    extras = {
        "equipment": [
            {"slug": slugify(str(e.name)), "name": str(e.name), "fields": e.fields}
            for e in index.by_class(CLASSES["equipment"])
        ],
        "lootSets": [
            {"slug": slugify(str(l.name)), "name": str(l.name), "fields": l.fields}
            for l in index.by_class(CLASSES["lootset"])
        ],
    }

    return {"items": out_items, "techNodes": out_tech, "extras": extras}, warnings
```

- [ ] **Step 2: Write the test over real fixtures** — `tests/test_transform.py`

Build an `ObjectIndex` from the committed fixtures and assert the mapped output. **Fill the
`expected` values from the actual numbers visible in your fixture files** (e.g. the real ingredient
quantities in `recipe_*.json`). Adjust fixture filenames/path_ids to the ones you kept in Task 2.

```python
import json
from pathlib import Path

from sand_scraper.extract import ObjectIndex, RawObject
from sand_scraper.transform import transform, CLASSES

FIX = Path(__file__).parent / "fixtures"


def _load(name: str, class_name: str, path_id: int) -> RawObject:
    fields = json.loads((FIX / name).read_text(encoding="utf-8"))
    return RawObject(class_name=class_name, name=fields.get("m_Name", ""), file_id=0,
                     path_id=path_id, fields=fields)


def _index() -> ObjectIndex:
    # path_ids here must match the m_PathID values the fixtures reference each other by.
    # Read them from the PPtr fields in the recipe/tech fixtures and assign accordingly.
    return ObjectIndex([
        _load("item_iron_ore.json", CLASSES["item"], path_id=10),
        _load("item_iron_plate.json", CLASSES["item"], path_id=11),
        _load("item_scrap_rifle.json", CLASSES["item"], path_id=12),
        _load("recipe_scrap_rifle.json", CLASSES["recipe"], path_id=30),
        _load("technode_metalworking.json", CLASSES["technode"], path_id=40),
        _load("technode_basic_weapons.json", CLASSES["technode"], path_id=41),
    ])


def test_items_have_slugs_and_types():
    out, _ = transform(_index())
    slugs = {i["slug"] for i in out["items"]}
    assert {"iron-ore", "iron-plate", "scrap-rifle"} <= slugs


def test_recipe_resolves_ingredient_slugs_and_quantities():
    out, _ = transform(_index())
    rifle = next(i for i in out["items"] if i["slug"] == "scrap-rifle")
    # EXPECTED: fill from recipe_scrap_rifle.json's real ingredient quantities.
    assert {"ingredient": "iron-plate", "quantity": 3} in rifle["recipe"]


def test_tech_prerequisites_resolve_to_slugs():
    out, _ = transform(_index())
    basic = next(t for t in out["techNodes"] if t["slug"] == "basic-weapons")
    assert "metalworking" in basic["prerequisites"]


def test_dangling_reference_is_warned_not_crashed():
    idx = ObjectIndex([
        _load("recipe_scrap_rifle.json", CLASSES["recipe"], path_id=30),  # ingredients point nowhere
    ])
    out, warnings = transform(idx)
    assert any("unresolved" in w for w in warnings)
    assert out["items"] == []  # no item objects present
```

- [ ] **Step 3: Run to verify it fails (then passes after fixing FIELDS/path_ids)**

Run: `.venv/Scripts/python -m pytest tests/test_transform.py -v`
Expected first run: failures pointing at wrong field names / path_ids. Adjust `FIELDS`, `CLASSES`,
fixture `path_id`s, and `expected` values to match the real fixtures until **all tests PASS**.

> This iterate-against-real-data loop is expected: the fixtures are ground truth. When green, the
> mapping is correct for the captured objects.

- [ ] **Step 4: Commit** (from repo root)

```bash
git add sand-scraper/src/sand_scraper/transform.py sand-scraper/tests/test_transform.py
git commit -m "feat: transform game objects to wiki seed schema"
```

---

## Task 7: Emit — assemble, sort, stamp meta, write JSON (pure, TDD)

**Files:**
- Create: `sand-scraper/src/sand_scraper/emit.py`
- Test: `sand-scraper/tests/test_emit.py`

- [ ] **Step 1: Write the failing test** — `tests/test_emit.py`

```python
import json

from sand_scraper.emit import assemble, write_output


def _payload():
    return {
        "items": [
            {"slug": "fuel", "name": "Fuel", "type": "resource", "isResource": True},
            {"slug": "iron-ore", "name": "Iron Ore", "type": "resource", "isResource": True},
        ],
        "techNodes": [
            {"slug": "metalworking", "name": "Metalworking", "costs": [], "prerequisites": []},
        ],
        "extras": {"equipment": [], "lootSets": []},
    }


def test_assemble_adds_meta_block():
    out = assemble(_payload(), game_version="1.2.3", scraped_at="2026-06-08T00:00:00Z",
                   source_bundles=["a.bundle"])
    assert out["meta"] == {
        "gameVersion": "1.2.3",
        "scrapedAt": "2026-06-08T00:00:00Z",
        "sourceBundles": ["a.bundle"],
    }


def test_assemble_sorts_items_by_slug():
    out = assemble(_payload(), game_version="1", scraped_at="t", source_bundles=[])
    assert [i["slug"] for i in out["items"]] == ["fuel", "iron-ore"]


def test_write_output_roundtrips(tmp_path):
    out = assemble(_payload(), game_version="1", scraped_at="t", source_bundles=[])
    path = tmp_path / "data.json"
    write_output(out, path)
    reloaded = json.loads(path.read_text(encoding="utf-8"))
    assert reloaded["items"][0]["slug"] == "fuel"
    assert reloaded["meta"]["gameVersion"] == "1"
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_emit.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/sand_scraper/emit.py`**

```python
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def assemble(payload: dict[str, Any], *, game_version: str, scraped_at: str,
             source_bundles: list[str]) -> dict[str, Any]:
    """Add the meta block and stable-sort collections by slug for clean cross-version diffs."""
    items = sorted(payload["items"], key=lambda i: i["slug"])
    tech = sorted(payload["techNodes"], key=lambda t: t["slug"])
    extras = {
        "equipment": sorted(payload["extras"].get("equipment", []), key=lambda e: e["slug"]),
        "lootSets": sorted(payload["extras"].get("lootSets", []), key=lambda l: l["slug"]),
    }
    return {
        "meta": {
            "gameVersion": game_version,
            "scrapedAt": scraped_at,
            "sourceBundles": list(source_bundles),
        },
        "items": items,
        "techNodes": tech,
        "extras": extras,
    }


def write_output(data: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, sort_keys=False) + "\n",
                    encoding="utf-8")
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_emit.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (from repo root)

```bash
git add sand-scraper/src/sand_scraper/emit.py sand-scraper/tests/test_emit.py
git commit -m "feat: emit assembled, sorted data.json with meta"
```

---

## Task 8: Wire the CLI end-to-end + integration smoke test

**Files:**
- Modify: `sand-scraper/src/sand_scraper/cli.py`
- Create: `sand-scraper/tests/test_integration.py`

- [ ] **Step 1: Replace `src/sand_scraper/cli.py` with the full pipeline**

```python
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

from sand_scraper import __version__
from sand_scraper.config import Config, load_config
from sand_scraper.emit import assemble, write_output
from sand_scraper.extract import load_objects
from sand_scraper.schema import validate_output
from sand_scraper.transform import transform


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="sand_scraper", description="Extract SAND game data.")
    p.add_argument("--config", type=Path, default=Path("config.toml"), help="Path to config.toml")
    p.add_argument("--strict", action="store_true", help="Exit non-zero on any warning")
    p.add_argument("--raw", action="store_true", help="Also write raw object dumps to raw_dump_dir")
    p.add_argument("--validate", action="store_true", help="Assert output is non-empty and valid")
    p.add_argument("--version", action="version", version=f"sand-scraper {__version__}")
    return p


def _read_game_version(cfg: Config) -> str:
    """Best-effort game version from boot.config; 'unknown' if unreadable."""
    boot = cfg.game_data_dir / "boot.config"
    if boot.is_file():
        for line in boot.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("application.version="):
                return line.split("=", 1)[1].strip()
    return "unknown"


def run(cfg: Config, *, strict: bool, raw: bool, validate: bool) -> int:
    index = load_objects(
        cfg.bundle_paths(),
        raw_dump_dir=cfg.raw_dump_dir if raw else None,
    )
    payload, warnings = transform(index)
    output = assemble(
        payload,
        game_version=_read_game_version(cfg),
        scraped_at=datetime.now(timezone.utc).isoformat(),
        source_bundles=[Path(b).name for b in cfg.target_bundles],
    )
    write_output(output, cfg.output_path)

    for w in warnings:
        print(f"WARN: {w}")
    print(f"Wrote {len(output['items'])} items, {len(output['techNodes'])} tech nodes "
          f"-> {cfg.output_path}")

    if validate:
        validate_output(output)
        if not output["items"] or not output["techNodes"]:
            print("VALIDATE: empty items or techNodes")
            return 1
        print("VALIDATE: ok")

    if strict and warnings:
        print(f"STRICT: {len(warnings)} warning(s) -> failing")
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = load_config(args.config)
    return run(cfg, strict=args.strict, raw=args.raw, validate=args.validate)
```

- [ ] **Step 2: Write the integration smoke test** — `tests/test_integration.py`

```python
from pathlib import Path

import pytest

from sand_scraper.cli import run
from sand_scraper.config import load_config

CONFIG = Path(__file__).parent.parent / "config.toml"


@pytest.fixture
def cfg():
    c = load_config(CONFIG)
    if not all(p.is_file() for p in c.bundle_paths()):
        pytest.skip("SAND game bundles not present on this machine")
    return c


def test_end_to_end_produces_nonempty_valid_output(cfg, tmp_path):
    # Redirect output to a temp file so the test never clobbers a real artifact.
    from dataclasses import replace
    c = replace(cfg, output_path=tmp_path / "data.json")
    rc = run(c, strict=False, raw=False, validate=True)
    assert rc == 0
    assert (tmp_path / "data.json").is_file()
```

- [ ] **Step 3: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -v`
Expected: all unit tests PASS; `test_integration` PASSES if the game is installed, otherwise SKIPS.

- [ ] **Step 4: Run the real scraper**

Run: `.venv/Scripts/python -m sand_scraper --validate`
Expected: `VALIDATE: ok`, non-zero item/tech counts, `out/data.json` written. Review any `WARN:`
lines and confirm they are acceptable (e.g. intentionally-unreferenced objects).

- [ ] **Step 5: Commit** (from repo root)

```bash
git add sand-scraper/src/sand_scraper/cli.py sand-scraper/tests/test_integration.py
git commit -m "feat: wire end-to-end scraper pipeline and integration test"
```

---

## Task 9: README, dataset handoff to the wiki, final verification

**Files:**
- Create: `sand-scraper/README.md`

- [ ] **Step 1: Create `sand-scraper/README.md`**

```markdown
# SAND Game-File Scraper

Extracts items, crafting recipes, and the tech tree (plus equipment/loot extras) from the
installed game *SAND: Raiders of Sofia* into a `data.json` consumed by the Unofficial SAND Wiki.

Spec: `../docs/superpowers/specs/2026-06-08-sand-scraper-design.md`

## Setup

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
```

Edit `config.toml` so `game_data_dir` points at your install's `Sand_Data` folder.

## Run

```bash
.venv/Scripts/python -m sand_scraper --validate
```

Writes `out/data.json`. Flags: `--raw` (dump raw objects), `--strict` (fail on warnings),
`--validate` (assert non-empty + schema-valid).

## Re-running after a game patch

1. Re-run the command above.
2. `git diff` the dataset snapshot (below) for a clean, sorted view of what changed.
3. If field names changed (warnings appear), re-run `scripts/spike.py`, update the findings doc
   and `FIELDS`/`CLASSES` in `src/sand_scraper/transform.py`, and re-run the tests.

## Handoff to the wiki

After reviewing `out/data.json`, copy it into the wiki as the committed dataset:

```bash
cp out/data.json ../sand-wiki/prisma/data.json
```

Then seed the wiki with `SEED_FILE=prisma/data.json npm run db:seed` (see the wiki plan, Task 6).

## Tests

`.venv/Scripts/python -m pytest` — pure unit tests over committed fixtures; the integration test
auto-skips when game files are absent.
```

- [ ] **Step 2: Full verification gate**

Run: `.venv/Scripts/python -m pytest -v` → all unit tests pass (integration passes or skips).
Run: `.venv/Scripts/python -m sand_scraper --validate` → `VALIDATE: ok`, non-zero counts.

- [ ] **Step 3: Produce and review the dataset snapshot**

Run: `.venv/Scripts/python -m sand_scraper --validate`
Then open `out/data.json` and sanity-check a few items/recipes/tech nodes against in-game knowledge.

- [ ] **Step 4: Commit** (from repo root)

```bash
git add sand-scraper/README.md
git commit -m "docs: add sand-scraper README and handoff instructions"
```

> The wiki-side handoff (copying `data.json` into `sand-wiki/prisma/` and committing it) happens
> when the wiki itself is built (wiki plan, Task 6). It is intentionally not committed here because
> `sand-wiki/` does not exist yet.

---

## Coverage map (spec → task)

| Spec section / requirement | Task(s) |
|----------------------------|---------|
| §2 Source findings → config of real bundle paths | 1, 2 |
| §4 UnityPy approach; typetree fork | 5; 2a (fallback) |
| §5 Project layout | 1 |
| §6 Extract stage | 5 |
| §6 Transform stage (pure core) | 6 |
| §6 Emit stage (slugify, stable-sort, meta) | 4, 7 |
| §7 Spike (typetree status, fixtures, field discovery) | 2 |
| §8 Output contract (items/techNodes/meta/extras) | 3, 6, 7 |
| §9 Handoff to wiki `prisma/data.json` | 9 |
| §10 Error handling (missing bundles, stripped typetrees, drift, dangling refs) | 5, 2a, 6, 8 |
| §11 Pure unit tests + integration smoke (auto-skip) | 3–8 |
| §12 Re-runnability (one command, stamped meta, clean diffs) | 7, 8, 9 |
| §13 Open items resolved during impl | 2 (fields), 2a (typetree), 8 (game version) |
```
