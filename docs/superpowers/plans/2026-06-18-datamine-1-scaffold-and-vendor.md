# Datamining Part 1 — Scaffold + Vendor the SEK Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `packages/datamine`, vendor SEK's Python extract/build/art scripts (repointed to our paths), seed `sek-out/` from SEK's current committed datasets, rewrite the localization builder to support all locales, and document the per-release runbook.

**Architecture:** `packages/datamine` owns a copy of SEK's Unity datamining scripts. Extraction (game files → `extracted/`) and build (`extracted/` → `sek-out/*.json`) run on a machine with game files; this plan only **vendors + wires** them and seeds `sek-out/` from SEK's already-committed playtest datasets so the downstream TS transform (Plan 2) has real inputs without anyone running extraction yet.

**Tech Stack:** Python 3.13 (UnityPy, numpy, Pillow), copied from `sek/sand-expedition-kit/datamine`. The TS transform is Plan 2.

**Spec:** `docs/superpowers/specs/2026-06-18-unified-datamining-pipeline-design.md`
**Branch:** continue on `feat/monorepo-static-foundation` (or a new `feat/datamine-pipeline` — controller's choice; this plan assumes the current branch).

> **Source of truth:** the SEK repo is cloned at `sek/sand-expedition-kit/`. Vendored copies come from `sek/sand-expedition-kit/datamine/`. Do NOT edit the SEK repo (it's a separate nested git repo); only read from it.

> **What this plan canNOT verify:** running the extraction (needs a game-files copy the agent doesn't have). Verification here is limited to: files copied, paths repointed (grep), Python syntax-checks, the localization rewrite's unit tests, and `sek-out/` populated. The first real extraction run is Plan 3 (user-run).

---

## File Structure (created by this plan)

```
packages/datamine/
  .gitignore                 # extracted/, gamefiles/, __pycache__, *.pyc
  README.md
  requirements.txt           # UnityPy, numpy, Pillow
  package.json               # name @sandlabs/datamine; datamine:* scripts (transform added in Plan 2)
  UPDATE_PIPELINE.md          # per-release runbook (user-run extraction)
  gamefiles/.gitkeep         # (gitignored dir; user drops a Sand_Data copy here)
  extracted/.gitkeep         # (gitignored intermediates)
  scripts/                   # vendored SEK Python (repointed)
    odin_parser.py  dump_bundle_json.py
    extract_loot_spawners.py  scan_location_prefabs.py  extract_compartments_db.py
    extract_progression_descriptions.py  extract_weapon_stats.py  extract_turret_stats.py
    extract_icons.py
    build_site_data.py  build_loot_sources.py  build_location_contents.py
    build_parts_v2.py  build_research_nodes.py  build_research_tree_from_sandhelp.py
    build_weapon_stats.py  build_turret_stats.py  build_container_loot.py
    build_localization.py    # REWRITTEN for all-locale
    render_part_thumbs.py  render_thumbs_v2.py  render_location_thumbs.py
    render_container_thumbs.py  export_part_meshes_v3.py
    test_build_localization.py   # NEW unit test (fixtures, no game files)
  sandhelp/
    sandhelp_tree_exact.json   # committed input for build_research_tree_from_sandhelp.py
  sek-out/                   # COMMITTED SEK-shape datasets (seeded from SEK's site/src/data)
    items.json recipes.json parts_v2.json research_nodes.json research_tree.json
    loot_sources.json loot_tables.json locations.json location_contents.json
    weapon_stats.json turret_stats.json chassis_cells.json
    localization.json        # (placeholder until Plan 3 re-extracts all locales)
```

---

## Task 1: Scaffold the package

**Files:**
- Create: `packages/datamine/.gitignore`, `requirements.txt`, `package.json`, `README.md`, `gamefiles/.gitkeep`, `extracted/.gitkeep`

- [ ] **Step 1: Create directories and gitignored placeholders**

```bash
mkdir -p packages/datamine/scripts packages/datamine/sek-out packages/datamine/sandhelp packages/datamine/gamefiles packages/datamine/extracted
printf '# gitignored — drop a COPY of the game files here, never the live install\n' > packages/datamine/gamefiles/.gitkeep
printf '# gitignored — intermediate extraction output\n' > packages/datamine/extracted/.gitkeep
```

- [ ] **Step 2: Create `packages/datamine/.gitignore`**

```gitignore
gamefiles/
extracted/
__pycache__/
*.pyc
.venv/
tools/
```

(`tools/` is gitignored because Il2CppDumper is large and user-local.)

- [ ] **Step 3: Create `packages/datamine/requirements.txt`**

```
UnityPy
numpy
Pillow
```

- [ ] **Step 4: Create `packages/datamine/package.json`**

```json
{
  "name": "@sandlabs/datamine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "loc:test": "echo \"run: python -m pytest scripts/test_build_localization.py\""
  }
}
```

(Transform + real `datamine:*` scripts are added in Plan 2; this is the package shell.)

- [ ] **Step 5: Create `packages/datamine/README.md`**

```markdown
# @sandlabs/datamine

Vendored SAND datamining pipeline (from SEK, `Sitting-in-a-towel/sand-expedition-kit`)
plus the wiki-specific transform (Plan 2). Regenerates `packages/data/generated/*.json`
for a new game build.

- `scripts/` — vendored SEK Python (extract → build → art), repointed to our paths.
- `sek-out/` — committed SEK-shape datasets (the transform's input).
- `extracted/`, `gamefiles/` — gitignored; populated by extraction on a machine with a
  game-files copy. NEVER mine the live install — copy `Sand_Data` + `GameAssembly.dll` here.
- See `UPDATE_PIPELINE.md` for the per-release run.
```

- [ ] **Step 6: Commit**

```bash
git add packages/datamine
git commit -m "chore(datamine): scaffold packages/datamine package shell"
```

---

## Task 2: Vendor the data-extraction scripts

**Files:**
- Create (copy from SEK): the extract scripts listed below.

- [ ] **Step 1: Copy the extraction scripts verbatim from SEK**

```bash
cd /d/Documents/SandLabs
for f in odin_parser.py dump_bundle_json.py extract_loot_spawners.py \
         scan_location_prefabs.py extract_compartments_db.py \
         extract_progression_descriptions.py extract_weapon_stats.py \
         extract_turret_stats.py extract_icons.py; do
  cp "sek/sand-expedition-kit/datamine/scripts/$f" "packages/datamine/scripts/$f"
done
```

- [ ] **Step 2: Repoint output paths in each copied script**

These scripts read from `gamefiles/` and `extracted/json/` (both cwd-relative — keep as-is; they run from `packages/datamine/`). Any that write into `../site/...` must be repointed. Apply this rule to each copied script:
- Output of icons/art → `../../apps/wiki/public/<dir>` (instead of `../site/public/<dir>`).
- Output of data JSON → `sek-out/<name>.json` (instead of `../site/src/data/<name>.json`).
- Leave `extracted/json/...` and `gamefiles/...` inputs unchanged.

After editing, verify NO stale paths remain:

```bash
grep -rn "\.\./site\|/site/src/data\|H:\\\\" packages/datamine/scripts/ || echo "clean — no stale SEK/absolute paths"
```
Expected: `clean` (or only matches inside comments, which you should also update).

- [ ] **Step 3: Syntax-check every copied script**

```bash
cd packages/datamine && python -m py_compile scripts/*.py && echo "all scripts compile"
```
Expected: `all scripts compile` (requires Python 3; UnityPy import happens at runtime, not compile, so this passes without the deps installed — if a script imports UnityPy at module top and py_compile still passes, good; if a script errors on missing import during compile it won't, py_compile doesn't import).

- [ ] **Step 4: Commit**

```bash
git add packages/datamine/scripts
git commit -m "chore(datamine): vendor SEK data-extraction scripts (repointed)"
```

---

## Task 3: Vendor the build scripts + sandhelp input

**Files:**
- Create (copy from SEK): build scripts + `sandhelp/sandhelp_tree_exact.json`.

- [ ] **Step 1: Copy the build scripts (except localization, which is rewritten in Task 4)**

```bash
cd /d/Documents/SandLabs
for f in build_site_data.py build_loot_sources.py build_location_contents.py \
         build_parts_v2.py build_research_nodes.py build_research_tree_from_sandhelp.py \
         build_weapon_stats.py build_turret_stats.py build_container_loot.py; do
  cp "sek/sand-expedition-kit/datamine/scripts/$f" "packages/datamine/scripts/$f"
done
```

- [ ] **Step 2: Copy the committed sandhelp tree input**

`build_research_tree_from_sandhelp.py` reads the sandhelp scrape. Find its input and copy it:

```bash
cd /d/Documents/SandLabs
cp sek/sand-expedition-kit/datamine/sandhelp/sandhelp_tree_exact.json packages/datamine/sandhelp/ 2>/dev/null \
  || cp sek/sand-expedition-kit/sandhelp_tree_exact.json packages/datamine/sandhelp/
```
Then read `build_research_tree_from_sandhelp.py` and repoint its sandhelp-input path to `sandhelp/sandhelp_tree_exact.json` and its output to `sek-out/research_tree.json`.

- [ ] **Step 3: Repoint output paths in the build scripts (same rule as Task 2)**

Data outputs → `sek-out/<name>.json`; keep `extracted/json/...` inputs. Then verify:

```bash
grep -rn "\.\./site\|/site/src/data" packages/datamine/scripts/build_*.py || echo "clean"
```
Expected: `clean`.

- [ ] **Step 4: Syntax-check**

```bash
cd packages/datamine && python -m py_compile scripts/build_*.py && echo "build scripts compile"
```

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/scripts packages/datamine/sandhelp
git commit -m "chore(datamine): vendor SEK build scripts + sandhelp input (repointed)"
```

---

## Task 4: Rewrite the localization builder for all locales (TDD — verifiable now)

**Files:**
- Create: `packages/datamine/scripts/build_localization.py` (rewritten)
- Test: `packages/datamine/scripts/test_build_localization.py`

The SEK version reads only `i2_terms_en.json`. The rewrite discovers every `i2_terms_<locale>.json` in `extracted/json/`, builds per-locale name/desc maps for items and compartments, and emits a locale-keyed structure. EN is required; other locales are optional. This is the one extraction script fully testable without game files (fixture term tables).

- [ ] **Step 1: Write the failing test with fixtures**

`packages/datamine/scripts/test_build_localization.py`:

```python
import json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

def _write(tmp, rel, obj):
    p = tmp / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")

def test_all_locale_build(tmp_path):
    ext = tmp_path / "extracted" / "json"
    # EN + FR term tables (the shape SandTools/I2 export produces: {"terms": {key: value}})
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
    # minimal registry (EN authoritative for items)
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
    # FR door has no description term -> desc is None, not missing
    assert door["locales"]["fr"]["desc"] is None
    assert "en" in data["locales"] and "fr" in data["locales"]
```

- [ ] **Step 2: Run the test, confirm it FAILS**

```bash
cd packages/datamine && python -m pytest scripts/test_build_localization.py -v
```
Expected: FAIL (current build_localization is EN-only / wrong output shape, or not yet copied).

- [ ] **Step 3: Write the rewritten `packages/datamine/scripts/build_localization.py`**

```python
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
"""
import json, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXT = HERE.parent / "extracted" / "json"
OUT = HERE.parent / "sek-out" / "localization.json"

ITEM_NAME = re.compile(r"Items/(item_\w+)_name$")
COMP_NAME = re.compile(r"WalkerCompartments/(walker_\w+?)_epb_name$")


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
    # en first, rest alpha
    return ["en"] + [l for l in locales if l != "en"]


def main():
    locales = _discover_locales()
    terms_by_locale = {loc: _load_terms(loc) for loc in locales}
    registry = json.loads((EXT / "items_registry.json").read_text(encoding="utf-8"))["items"] \
        if (EXT / "items_registry.json").exists() else {}

    # collect the union of item ids and compartment ids across all locales + registry
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
        # EN prefers the registry (authoritative descriptions); all locales fall back to terms.
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
        name = terms.get(f"WalkerCompartments/{cid}_epb_name")
        if name is None:
            return None
        return {"name": name,
                "desc": terms.get(f"WalkerCompartments/{cid}_epb_description") or None}

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
```

- [ ] **Step 4: Run the test, confirm it PASSES**

```bash
cd packages/datamine && python -m pytest scripts/test_build_localization.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/scripts/build_localization.py packages/datamine/scripts/test_build_localization.py
git commit -m "feat(datamine): all-locale localization builder (TDD)"
```

---

## Task 5: Vendor the art scripts

**Files:**
- Create (copy from SEK): the render/mesh scripts.

- [ ] **Step 1: Copy the art scripts**

```bash
cd /d/Documents/SandLabs
for f in render_part_thumbs.py render_thumbs_v2.py render_location_thumbs.py \
         render_container_thumbs.py export_part_meshes_v3.py; do
  cp "sek/sand-expedition-kit/datamine/scripts/$f" "packages/datamine/scripts/$f"
done
```

- [ ] **Step 2: Repoint art output paths**

Image outputs → `../../apps/wiki/public/<dir>` (icons already handled in Task 2; here: `parts`, `parts2`, `locart`, `containers`). The mesh manifest → `../data/generated/mesh_index.json` (i.e. `packages/data/generated/mesh_index.json`); mesh binaries → `../../apps/wiki/public/meshes`. Verify:

```bash
grep -rn "\.\./site" packages/datamine/scripts/render_*.py packages/datamine/scripts/export_part_meshes_v3.py || echo "clean"
```
Expected: `clean`.

- [ ] **Step 3: Syntax-check**

```bash
cd packages/datamine && python -m py_compile scripts/render_*.py scripts/export_part_meshes_v3.py && echo "art scripts compile"
```

- [ ] **Step 4: Commit**

```bash
git add packages/datamine/scripts
git commit -m "chore(datamine): vendor SEK art/mesh scripts (repointed)"
```

---

## Task 6: Seed `sek-out/` from SEK's committed datasets

**Files:**
- Create (copy from SEK): `packages/datamine/sek-out/*.json`

So the Plan-2 transform has real (current playtest) inputs without anyone running extraction.

- [ ] **Step 1: Copy SEK's committed site datasets into sek-out/**

```bash
cd /d/Documents/SandLabs
for f in items recipes parts_v2 research_nodes research_tree loot_sources loot_tables \
         locations location_contents weapon_stats turret_stats chassis_cells; do
  cp "sek/sand-expedition-kit/site/src/data/$f.json" "packages/datamine/sek-out/$f.json"
done
```

- [ ] **Step 2: Add a localization.json placeholder note**

The all-locale `localization.json` is produced by Task 4's script during a real extraction (Plan 3). Until then, seed a minimal placeholder so the transform (Plan 2) can run EN-only against SEK's current EN localization. Copy SEK's current EN localization and wrap it in the new shape, OR write a one-off note:

```bash
cd /d/Documents/SandLabs
node -e "
const src=require('./sek/sand-expedition-kit/site/src/data/localization.json');
const items={}; for(const [id,e] of Object.entries(src.items||{})) items[id]={locales:{en:{name:e.name,short:e.short??null,desc:e.desc??null}}};
const comps={}; for(const [id,e] of Object.entries(src.compartments||{})) comps[id]={locales:{en:{name:e.name,desc:e.desc??null}}};
const out={_source:'seeded EN-only from SEK; replaced by all-locale extract in Plan 3',locales:['en'],items,compartments:comps,factions:src.factions||[]};
require('fs').writeFileSync('packages/datamine/sek-out/localization.json', JSON.stringify(out,null,1));
console.log('seeded localization.json (en):', Object.keys(items).length,'items');
"
```

- [ ] **Step 3: Sanity-check the datasets are present and valid JSON**

```bash
cd packages/datamine/sek-out && for f in *.json; do node -e "require('./$f'); " && echo "ok $f" || echo "BAD $f"; done
```
Expected: `ok` for every file.

- [ ] **Step 4: Commit**

```bash
git add packages/datamine/sek-out
git commit -m "chore(datamine): seed sek-out datasets from SEK committed data (playtest baseline)"
```

---

## Task 7: Write the per-release runbook

**Files:**
- Create: `packages/datamine/UPDATE_PIPELINE.md`

- [ ] **Step 1: Write `packages/datamine/UPDATE_PIPELINE.md`**

```markdown
# UPDATE PIPELINE — regenerate all data for a new SAND build

Run on a machine with a **copy** of the game files (never the live install). Needs
Python 3 + `pip install -r requirements.txt`, and Il2CppDumper in `tools/il2cppdumper/`.
All commands run from `packages/datamine/`.

## 0. Refresh the file copy
Copy `<install>/Sand_Data` and `<install>/GameAssembly.dll` into `gamefiles/`.

## 1. Class reference (only for new investigations)
Il2CppDumper on `gamefiles/GameAssembly.dll` + `gamefiles/Sand_Data/il2cpp_data/Metadata/global-metadata.dat`
→ `extracted/il2cpp_dump/dump.cs`.

## 2. Extract → build (order matters)
```bash
python scripts/extract_icons.py
python scripts/extract_loot_spawners.py
python scripts/build_loot_sources.py
python scripts/scan_location_prefabs.py
python scripts/build_location_contents.py
python scripts/extract_compartments_db.py        # -> extracted/json/compartments_database.json (INSPECT for stats — see note)
python scripts/build_parts_v2.py
python scripts/extract_progression_descriptions.py
python scripts/build_research_nodes.py
python scripts/build_research_tree_from_sandhelp.py
python scripts/extract_weapon_stats.py && python scripts/build_weapon_stats.py
python scripts/extract_turret_stats.py && python scripts/build_turret_stats.py
# localization: obtain per-locale i2_terms_<locale>.json (re-extract I2Languages, all langs) into extracted/json/
python scripts/build_localization.py             # -> sek-out/localization.json (all locales)
python scripts/build_site_data.py                # items, recipes -> sek-out/
python scripts/build_container_loot.py
```

> **Trampler stats note:** after `extract_compartments_db.py`, inspect
> `extracted/json/compartments_database.json` for health/weight/energy/slot fields. If
> present, Plan 2's transform maps them; if absent, the transform falls back to the
> committed baseline. Report findings so the mapping can be wired.

## 3. Art (slow, ~GBs RAM)
```bash
python scripts/render_part_thumbs.py
python scripts/render_thumbs_v2.py
python scripts/render_location_thumbs.py
python scripts/render_container_thumbs.py
python scripts/export_part_meshes_v3.py      # -> apps/wiki/public/meshes + packages/data/generated/mesh_index.json
```

## 4. Transform → wiki artifact (Plan 2)
```bash
# from repo root
npx tsx packages/datamine/transform/run.ts        # -> packages/data/generated/*.json + diff report
```
Review the diff (esp. slug changes), then commit the regenerated artifact + art.

## 5. After-update checklist
- Bundle names can shift between builds — every extractor prints what it found; "NOT FOUND" = asset moved.
- Re-verify slug reconciliation overrides (`transform/overrides/slug-map.json`) against the diff.
- dump.cs TypeDefIndexes shift — re-dump before trusting old line numbers.
```

- [ ] **Step 2: Commit**

```bash
git add packages/datamine/UPDATE_PIPELINE.md
git commit -m "docs(datamine): per-release update runbook"
```

---

## Self-Review Notes (for the executor)

- **Don't run extraction.** This plan vendors + wires only. The only things that execute here are `py_compile` (syntax) and the localization unit test. Everything else is verified by grep + JSON validity.
- **Don't edit the SEK repo.** Copy from `sek/sand-expedition-kit/`, never write to it (separate git repo).
- **Repointing rule:** inputs (`extracted/json`, `gamefiles`) stay cwd-relative to `packages/datamine/`; outputs go to `sek-out/` (data) or `apps/wiki/public/` (art) or `packages/data/generated/mesh_index.json` (mesh manifest). The grep checks are the gate.
- If a script's path layout differs from the rule (e.g. uses `Path(__file__)` anchors like `build_localization` did), repoint its specific constants and re-grep.

## Outcome

`packages/datamine` exists with the full vendored pipeline (repointed, syntax-clean), an all-locale localization builder (unit-tested), committed `sek-out/` datasets (current playtest), and the per-release runbook. Plan 2 builds the TS transform against `sek-out/`; Plan 3 is the user's real extraction run.
