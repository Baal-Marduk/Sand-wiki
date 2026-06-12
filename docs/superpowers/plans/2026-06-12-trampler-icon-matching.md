# Trampler Icon Matching & Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match all 152 game part-icon sprites to the 120 wiki trampler records and render those icons on the wiki's trampler pages.

**Architecture:** Hybrid matching inside the existing sand-scraper pipeline — recover the prior 40 matches from `icon_link_sheet.pdf`, let the deterministic `auto_match` handle the unambiguous rest, fill the ambiguous remainder with a vision pass, human-verify via the existing HTML picker (+ a regenerated PDF), export `trampler_icon_overrides.json`, then `build_manifest` → `out/trampler-icons.json`. A new wiki-side importer copies the matched PNGs into `public/tramplers/` and `seed.ts` wires `TramplerPart.icon` exactly like item icons.

**Tech Stack:** Python 3.13 (sand-scraper, pytest, PyMuPDF/`fitz`), Node + Prisma + Next.js (sand-wiki), TypeScript.

**Repos / working dirs:**
- Scraper (Tasks 1–7): `d:\Documents\SandLabs\.claude\worktrees\sand-scraper-impl\sand-scraper` on branch `feat/sand-scraper-impl`. Commands use `.venv\Scripts\python`.
- Wiki (Tasks 8–10): `d:\Documents\SandLabs\sand-wiki` on `master`.

**Key existing facts (do not re-derive):**
- Sprites exported at `out/part-icons/*.png`; sprite key used everywhere is the file **stem** (no `.png`), e.g. `walker_compArmor_Spot_Metal_1x1_icon`.
- Overrides file shape: `{ "<trampler-slug>": "<spriteStem>" }`.
- `tramplers.json` keys ARE the slugs, and each slug equals `slugify(name)` where `slugify(s) = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")`. Verified: `"S&H Cargo Bay, L-Shape"` → `s-h-cargo-bay-l-shape`, `"S.Trs Cargo Bay, L-Shape"` → `s-trs-cargo-bay-l-shape`.
- Existing modules: `trampler_icons.py` (`auto_match`, `build_manifest`), `trampler_icon_tool.py` (`main()` writes the HTML picker), `icons.py` (`load_overrides`, `write_manifest`).
- `.venv` already has `pymupdf` installed.

---

## File Structure

**sand-scraper (new):**
- `src/sand_scraper/pdf_links.py` — parse the link-sheet into records. Split into a pure `parse_link_text(text)` and a thin `parse_link_pdf(path)` PyMuPDF wrapper.
- `src/sand_scraper/trampler_overrides_seed.py` — `slugify`, and `seed_overrides(records, valid_slugs)` → `(overrides, unresolved)`.
- `scripts/seed_trampler_overrides.py` — CLI glue: parse PDF, seed overrides against `tramplers.json`, merge into `trampler_icon_overrides.json`, print coverage + unresolved.
- `scripts/build_link_sheet.py` — regenerate the 4-section review PDF from the current overrides + auto-match + sprite PNGs.
- `tests/test_pdf_links.py`, `tests/test_trampler_overrides_seed.py`.

**sand-wiki (new/modified):**
- `prisma/import-trampler-icons.mjs` (new) — copy matched PNGs into `public/tramplers/`, write `prisma/trampler-icons.json`.
- `prisma/seed.ts` (modify) — read `trampler-icons.json`, prefer it for `TramplerPart.icon`.
- `prisma/import-trampler-icons.test.ts` (new) — pure path-transform test.

---

## Task 1: PDF link-sheet parser (pure text → records)

**Files:**
- Create: `src/sand_scraper/pdf_links.py`
- Test: `tests/test_pdf_links.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_pdf_links.py
from sand_scraper.pdf_links import LinkRecord, parse_link_text

# Mimics PyMuPDF's get_text() output: sprite names wrap mid-token across lines,
# "File: <name>" gives the target, "— no target —" marks an unused sprite, and
# free lines after a record are reasoning notes. Section headers/counts are noise.
SAMPLE = """Trampler Icon → Wiki Page Link Sheet
40 icons processed so far  •  32 matched  •  5 to verify  •  3 unused
Confident matches (32)
walker_compArmor_Spot_Metal_1x1_icon.p
ng
File: S.Trs HA Armor Plate
plain plate = HA
walker_compBalcony_Bridge_Open_1x1_ico
n.png
File: S&H; Bridge Balcony
Unused (no wiki page) (3)
walker_compBalcony_InnerCorner_Open_1x
1_icon.png
— no target —
base open inner corner - wiki only has (L)/(R)
"""


def test_parse_rejoins_wrapped_sprite_names():
    recs = parse_link_text(SAMPLE)
    sprites = [r.sprite for r in recs]
    assert "walker_compArmor_Spot_Metal_1x1_icon.png" in sprites
    assert "walker_compBalcony_Bridge_Open_1x1_icon.png" in sprites


def test_parse_captures_targets_and_notes():
    recs = {r.sprite: r for r in parse_link_text(SAMPLE)}
    armor = recs["walker_compArmor_Spot_Metal_1x1_icon.png"]
    assert armor.target == "S.Trs HA Armor Plate"
    assert armor.note == "plain plate = HA"


def test_parse_marks_unused_as_none_target():
    recs = {r.sprite: r for r in parse_link_text(SAMPLE)}
    unused = recs["walker_compBalcony_InnerCorner_Open_1x1_icon.png"]
    assert unused.target is None


def test_parse_ignores_headers_and_counts():
    recs = parse_link_text(SAMPLE)
    # exactly the three sprite records, no header rows leak in
    assert len(recs) == 3
    assert all(isinstance(r, LinkRecord) for r in recs)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_pdf_links.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sand_scraper.pdf_links'`.

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_scraper/pdf_links.py
"""Parse the trampler icon link-sheet PDF into (sprite, target, note) records.

The PDF (`icon_link_sheet.pdf`) is a prior visual matching attempt. PyMuPDF emits its
text with sprite names wrapped mid-token across two lines; this module rejoins them and
pairs each sprite with its `File: <wiki name>` target (or `None` for `— no target —`)
plus the first reasoning-note line. Section headers and the count line are dropped.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_NO_TARGET = "— no target —"
# Header/count rows that must never be treated as a record.
_HEADER_RE = re.compile(r"^(Trampler Icon|Confident matches|Flagged|Unused|\d+ icons)", re.I)


@dataclass(frozen=True)
class LinkRecord:
    sprite: str             # e.g. "walker_compArmor_Spot_Metal_1x1_icon.png"
    target: str | None      # wiki page name, or None when flagged unused
    note: str               # first reasoning line, "" if none


def parse_link_text(text: str) -> list[LinkRecord]:
    lines = [ln.strip() for ln in text.splitlines()]
    records: list[LinkRecord] = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if not line or _HEADER_RE.match(line):
            i += 1
            continue
        if line.startswith("walker_"):
            # Rejoin continuation fragments (no separator) until ".png".
            buf = line
            i += 1
            while not buf.endswith(".png") and i < n:
                buf += lines[i]
                i += 1
            sprite = buf
            target: str | None = None
            note = ""
            # Next meaningful line: the target.
            while i < n and not lines[i]:
                i += 1
            if i < n:
                if lines[i] == _NO_TARGET:
                    target = None
                elif lines[i].startswith("File:"):
                    target = lines[i][len("File:"):].strip()
                i += 1
            # Optional note: first non-empty line that isn't a new record/header.
            while i < n and not lines[i]:
                i += 1
            if i < n and not lines[i].startswith("walker_") and not _HEADER_RE.match(lines[i]):
                note = lines[i]
                i += 1
            records.append(LinkRecord(sprite=sprite, target=target, note=note))
        else:
            i += 1
    return records


def parse_link_pdf(path) -> list[LinkRecord]:  # pragma: no cover - thin IO wrapper
    import fitz  # PyMuPDF

    doc = fitz.open(path)
    text = "\n".join(page.get_text() for page in doc)
    return parse_link_text(text)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_pdf_links.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/sand_scraper/pdf_links.py tests/test_pdf_links.py
git commit -m "feat(scraper): parse trampler icon link-sheet PDF into records"
```

---

## Task 2: Slugify + seed overrides from records

**Files:**
- Create: `src/sand_scraper/trampler_overrides_seed.py`
- Test: `tests/test_trampler_overrides_seed.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_trampler_overrides_seed.py
from sand_scraper.pdf_links import LinkRecord
from sand_scraper.trampler_overrides_seed import seed_overrides, slugify

VALID = {"s-trs-ha-armor-plate", "s-h-bridge-balcony", "s-h-cargo-bay-l-shape"}


def test_slugify_matches_tramplers_json_keys():
    assert slugify("S&H Cargo Bay, L-Shape") == "s-h-cargo-bay-l-shape"
    assert slugify("S.Trs HA Armor Plate") == "s-trs-ha-armor-plate"


def test_slugify_absorbs_pdf_html_artifacts():
    # the PDF leaks "S&H;" / "L&R;" — trailing punctuation collapses away
    assert slugify("S&H; Bridge Balcony") == "s-h-bridge-balcony"


def test_seed_maps_resolved_targets_to_sprite_stems():
    recs = [LinkRecord("walker_compArmor_Spot_Metal_1x1_icon.png", "S.Trs HA Armor Plate", "")]
    overrides, unresolved = seed_overrides(recs, VALID)
    assert overrides == {"s-trs-ha-armor-plate": "walker_compArmor_Spot_Metal_1x1_icon"}
    assert unresolved == []


def test_seed_skips_unused_records():
    recs = [LinkRecord("walker_compCargo_Large_Wood_1x1_icon.png", None, "likely UNUSED")]
    overrides, unresolved = seed_overrides(recs, VALID)
    assert overrides == {}
    assert unresolved == []


def test_seed_reports_targets_with_no_matching_slug():
    recs = [LinkRecord("walker_x_icon.png", "Nonexistent Plate", "")]
    overrides, unresolved = seed_overrides(recs, VALID)
    assert overrides == {}
    assert unresolved == [("walker_x_icon.png", "Nonexistent Plate")]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_trampler_overrides_seed.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sand_scraper.trampler_overrides_seed'`.

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_scraper/trampler_overrides_seed.py
"""Turn parsed link-sheet records into a slug -> sprite-stem override seed.

Wiki trampler slugs equal `slugify(name)`, so a record's `File:` target slugifies straight
to a slug. Unused records (no target) are skipped; targets that slugify to no known slug are
returned as `unresolved` for manual follow-up rather than silently dropped.
"""
from __future__ import annotations

import re

from sand_scraper.pdf_links import LinkRecord


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def seed_overrides(
    records: list[LinkRecord], valid_slugs: set[str]
) -> tuple[dict[str, str], list[tuple[str, str]]]:
    """Returns ({slug: spriteStem}, [(sprite, target) that did not resolve])."""
    overrides: dict[str, str] = {}
    unresolved: list[tuple[str, str]] = []
    for rec in records:
        if rec.target is None:
            continue
        slug = slugify(rec.target)
        if slug in valid_slugs:
            overrides[slug] = rec.sprite.removesuffix(".png")
        else:
            unresolved.append((rec.sprite, rec.target))
    return overrides, unresolved
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_trampler_overrides_seed.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/sand_scraper/trampler_overrides_seed.py tests/test_trampler_overrides_seed.py
git commit -m "feat(scraper): seed trampler overrides from link-sheet records"
```

---

## Task 3: CLI to seed overrides from the PDF

**Files:**
- Create: `scripts/seed_trampler_overrides.py`

- [ ] **Step 1: Write the script**

```python
# scripts/seed_trampler_overrides.py
"""Seed trampler_icon_overrides.json from the link-sheet PDF.

Usage (from sand-scraper/):  .venv\\Scripts\\python scripts/seed_trampler_overrides.py
Merges recovered matches into the existing overrides file (recovered entries do NOT clobber
ones already present), then prints coverage and any unresolved PDF targets.
"""
from __future__ import annotations

import json
from pathlib import Path

from sand_scraper.config import load_config
from sand_scraper.icons import load_overrides
from sand_scraper.pdf_links import parse_link_pdf
from sand_scraper.trampler_overrides_seed import seed_overrides

PDF = Path("icon_link_sheet.pdf")


def main() -> int:
    cfg = load_config(Path("config.toml"))
    if cfg.tramplers_path is None or not cfg.tramplers_path.is_file():
        raise FileNotFoundError(f"tramplers_path not set/missing ({cfg.tramplers_path})")
    valid_slugs = set(json.loads(cfg.tramplers_path.read_text(encoding="utf-8")))

    records = parse_link_pdf(PDF)
    seeded, unresolved = seed_overrides(records, valid_slugs)

    existing = load_overrides(cfg.trampler_icon_overrides_path)
    merged = {**seeded, **existing}  # existing wins
    out = dict(sorted(merged.items()))
    cfg.trampler_icon_overrides_path.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Parsed {len(records)} link records; seeded {len(seeded)} matches "
          f"(file now has {len(out)} overrides).")
    if unresolved:
        print(f"{len(unresolved)} unresolved target(s) — map these by hand:")
        for sprite, target in unresolved:
            print(f"  {sprite}  ->  {target!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run it**

Run: `.venv\Scripts\python scripts/seed_trampler_overrides.py`
Expected: prints `Parsed 40 link records; seeded ~32 matches ...` and lists any unresolved targets (e.g. an Armor-Plate name with no `tramplers.json` entry). Creates/updates `trampler_icon_overrides.json`.

- [ ] **Step 3: Eyeball the unresolved list**

Read the printed unresolved targets. For each, either (a) it is a real trampler whose name differs from the PDF wording — find its slug in `tramplers.json` and note it for the vision pass, or (b) it is genuinely not a wiki page — leave it. Do not hand-edit yet; the vision pass (Task 5) and review sheet (Task 6) resolve these.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed_trampler_overrides.py trampler_icon_overrides.json
git commit -m "feat(scraper): seed overrides from link-sheet PDF (recovers prior 40)"
```

---

## Task 4: Snapshot deterministic coverage (no new code)

**Files:** none (uses existing `auto_match`).

- [ ] **Step 1: Print current coverage across all 152 sprites**

Run:
```bash
.venv\Scripts\python -c "import json; from pathlib import Path; from sand_scraper.config import load_config; from sand_scraper.icons import load_overrides; from sand_scraper.trampler_icons import auto_match; c=load_config(Path('config.toml')); raw=json.loads(c.tramplers_path.read_text('utf-8')); mods=[{'slug':s,'name':t['name'],'category':t['category']} for s,t in raw.items()]; sprites=[p.stem for p in sorted(c.part_icons_out_dir.glob('*.png'))]; ov=load_overrides(c.trampler_icon_overrides_path); auto,unm=auto_match(mods,sprites); covered={*ov}|{*auto}; print('tramplers',len(mods),'| overrides',len(ov),'| auto',len(auto),'| covered',len(covered),'| still missing',[m['slug'] for m in mods if m['slug'] not in covered][:60])"
```
Expected: prints counts and the list of trampler slugs that have neither an override nor a confident auto-match. **This list is the input to the vision pass.** Record it.

- [ ] **Step 2: No commit** (read-only diagnostic).

---

## Task 5: Vision pass over the ambiguous remainder (procedural)

This task is non-deterministic (vision agents) and human-supervised — it produces additions to `trampler_icon_overrides.json`, not code. Group the missing slugs from Task 4 by their `category`.

- [ ] **Step 1: For each category with missing slugs, dispatch a vision agent**

Use the Agent tool (general-purpose). Give each agent, for one category:
  - the list of still-missing trampler slugs + their `name` (from `tramplers.json`),
  - the candidate sprite stems in that category — compute the category for a sprite with `sand_scraper.trampler_icons.parse_sprite(stem)[0]` and include only sprites not already claimed in overrides,
  - the absolute PNG paths `out/part-icons/<stem>.png` for both sets so the agent can **Read (view) the images**,
  - this instruction: *"Look at each candidate icon image and assign it to the single best-matching trampler name. Material words map: Wood/Open→S&H, Metal/Frame→S.Trs (verify visually). Return JSON {slug: spriteStem} only for confident matches; list the rest as unsure with a one-line reason. Do not invent slugs."*

Request structured output: `{ "matches": {slug: spriteStem}, "unsure": [{slug, reason}] }`.

- [ ] **Step 2: Merge confident matches into the overrides file**

For each returned `matches` map, update `trampler_icon_overrides.json` (keep it sorted, `slug -> spriteStem`, sprite stem **without** `.png`). Verify each `spriteStem` exists as `out/part-icons/<stem>.png` and each `slug` exists in `tramplers.json` before writing — drop any that fail and report them.

- [ ] **Step 3: Re-run the Task 4 coverage command**

Confirm `still missing` shrank. Remaining entries are either genuinely sprite-less tramplers or `unsure` cases left for the human review sheet.

- [ ] **Step 4: Commit**

```bash
git add trampler_icon_overrides.json
git commit -m "feat(scraper): add vision-matched trampler icon overrides"
```

---

## Task 6: Regenerate review artifacts + build manifest

**Files:**
- Create: `scripts/build_link_sheet.py`
- Uses existing: `trampler_icon_tool.main()`, `--trampler-icons`.

- [ ] **Step 1: Regenerate the HTML picker (existing tool)**

Run: `.venv\Scripts\python -m sand_scraper.trampler_icon_tool`
Expected: `Wrote out/trampler_icon_tool.html  (120 modules, NNN with an icon, 152 sprites pickable)`.

- [ ] **Step 2: Write the PDF link-sheet generator**

```python
# scripts/build_link_sheet.py
"""Regenerate icon_link_sheet.pdf from the CURRENT overrides + auto-match.

Usage (from sand-scraper/):  .venv\\Scripts\\python scripts/build_link_sheet.py
Sections: matched (override or auto) and unmatched, each row = icon thumbnail + sprite stem
+ trampler name. Offline review companion to the HTML picker.
"""
from __future__ import annotations

import json
from pathlib import Path

import fitz  # PyMuPDF

from sand_scraper.config import load_config
from sand_scraper.icons import load_overrides
from sand_scraper.trampler_icons import auto_match


def main() -> int:
    cfg = load_config(Path("config.toml"))
    raw = json.loads(cfg.tramplers_path.read_text(encoding="utf-8"))
    mods = [{"slug": s, "name": t["name"], "category": t["category"]} for s, t in raw.items()]
    sprites = [p.stem for p in sorted(cfg.part_icons_out_dir.glob("*.png"))]
    ov = load_overrides(cfg.trampler_icon_overrides_path)
    auto, _ = auto_match(mods, sprites)

    rows = []  # (name, sprite_stem_or_None, source)
    for m in sorted(mods, key=lambda x: (x["category"], x["name"])):
        sprite = ov.get(m["slug"]) or auto.get(m["slug"])
        src = "override" if m["slug"] in ov else ("auto" if m["slug"] in auto else "missing")
        rows.append((f'{m["category"]} · {m["name"]}', sprite, src))

    doc = fitz.open()
    page = doc.new_page()
    y, x = 40, 40
    page.insert_text((x, y), "Trampler Icon Review Sheet", fontsize=16); y += 28
    matched = sum(1 for _, s, _ in rows if s)
    page.insert_text((x, y), f"{len(rows)} tramplers · {matched} with icon · {len(rows)-matched} missing", fontsize=10)
    y += 24
    for name, sprite, src in rows:
        if y > 760:
            page = doc.new_page(); y = 40
        if sprite:
            png = cfg.part_icons_out_dir / f"{sprite}.png"
            if png.is_file():
                page.insert_image(fitz.Rect(x, y - 2, x + 28, y + 26), filename=str(png))
        label = f"{name}   [{src}]   {sprite or '— none —'}"
        page.insert_text((x + 36, y + 14), label, fontsize=9)
        y += 34
    out = Path("icon_link_sheet.pdf")
    doc.save(out)
    print(f"Wrote {out} ({len(rows)} rows, {matched} matched).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: Generate the PDF and review both artifacts**

Run: `.venv\Scripts\python scripts/build_link_sheet.py`
Then open `out/trampler_icon_tool.html` in a browser (it references `part-icons/` relatively) and/or `icon_link_sheet.pdf`. **Human checkpoint:** correct any wrong/missing matches in the HTML picker and click *Export* → save over `trampler_icon_overrides.json`. Re-run this script if you changed anything.

- [ ] **Step 4: Build the slug → png manifest (existing pipeline)**

Run: `.venv\Scripts\python -m sand_scraper --trampler-icons --no-names`
Expected: `Wrote NNN trampler icons -> out/trampler-icons.json (M modules without an icon; ...)`. (`--no-names` avoids the I2 localization dependency; drop it if `data.unity3d` is present.)

- [ ] **Step 5: Commit**

```bash
git add scripts/build_link_sheet.py icon_link_sheet.pdf trampler_icon_overrides.json out/trampler-icons.json
git commit -m "feat(scraper): regenerate review sheet and build trampler icon manifest"
```

---

## Task 7: Verify the manifest before crossing repos

**Files:** none.

- [ ] **Step 1: Sanity-check the manifest**

Run:
```bash
.venv\Scripts\python -c "import json; m=json.load(open('out/trampler-icons.json',encoding='utf-8')); print('entries',len(m)); import os; missing=[p for p in m.values() if not os.path.isfile(os.path.join('out',*p.split('/')))]; print('png files present:', not missing, missing[:5])"
```
Expected: prints entry count and `png files present: True []`. If any PNG is missing, fix the override pointing at it and re-run Task 6 Step 4.

- [ ] **Step 2: No commit** (diagnostic).

---

## Task 8: Wiki importer — copy PNGs + write manifest

**Working dir:** `d:\Documents\SandLabs\sand-wiki` (branch `master`).

**Files:**
- Create: `prisma/import-trampler-icons.mjs`
- Create: `prisma/import-trampler-icons.test.ts`

- [ ] **Step 1: Write the failing test for the path transform**

```typescript
// prisma/import-trampler-icons.test.ts
import { describe, it, expect } from "vitest";
import { publicIconPath } from "./import-trampler-icons.mjs";

describe("publicIconPath", () => {
  it("maps a manifest rel path to a /tramplers public path", () => {
    expect(publicIconPath("part-icons/walker_compArmor_Spot_Metal_1x1_icon.png"))
      .toBe("/tramplers/walker_compArmor_Spot_Metal_1x1_icon.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/import-trampler-icons.test.ts`
Expected: FAIL — cannot find module / `publicIconPath` is not exported.

- [ ] **Step 3: Write the importer**

```javascript
// prisma/import-trampler-icons.mjs
// One-time importer: copies matched trampler part-icon PNGs from the sand-scraper out/
// snapshot into the wiki, and writes prisma/trampler-icons.json (slug -> rel png path).
// Usage (from sand-wiki/):  node prisma/import-trampler-icons.mjs [outDir]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/** Manifest rel path ("part-icons/<file>.png") -> wiki public path ("/tramplers/<file>.png"). */
export function publicIconPath(rel) {
  return "/tramplers/" + basename(rel);
}

// Importer body is skipped under test (vitest sets VITEST); only the pure fn is imported.
if (!process.env.VITEST) {
  if (!existsSync("prisma") || !existsSync("public")) {
    console.error("Run this from the sand-wiki/ directory (prisma/ and public/ not found).");
    process.exit(1);
  }
  const OUT =
    process.argv[2] ??
    join("..", ".claude", "worktrees", "sand-scraper-impl", "sand-scraper", "out");

  const manifest = JSON.parse(readFileSync(join(OUT, "trampler-icons.json"), "utf-8"));
  writeFileSync("prisma/trampler-icons.json", JSON.stringify(manifest, null, 2) + "\n");

  mkdirSync("public/tramplers", { recursive: true });
  let n = 0;
  for (const rel of Object.values(manifest)) {
    copyFileSync(join(OUT, rel), join("public", "tramplers", basename(rel)));
    n++;
  }
  console.log(`Imported trampler-icons.json and ${n} icons into public/tramplers/.`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run prisma/import-trampler-icons.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Run the importer**

Run: `node prisma/import-trampler-icons.mjs`
Expected: `Imported trampler-icons.json and NNN icons into public/tramplers/.`; `public/tramplers/` now holds the matched PNGs and `prisma/trampler-icons.json` exists.

- [ ] **Step 6: Commit**

```bash
git add prisma/import-trampler-icons.mjs prisma/import-trampler-icons.test.ts prisma/trampler-icons.json public/tramplers
git commit -m "feat(wiki): import matched trampler part-icons"
```

---

## Task 9: Wire TramplerPart.icon in seed.ts

**Files:**
- Modify: `prisma/seed.ts` (icon-loading block near line 45–51; trampler scraped object near line 168)

- [ ] **Step 1: Add the trampler-icon loader next to the existing item `iconFor`**

After the existing `iconFor` block (`prisma/seed.ts:48-51`), insert:

```typescript
  const tramplerIconRel: Record<string, string> = JSON.parse(
    readFileSync(join(__dirname, "trampler-icons.json"), "utf-8"),
  );
  const tramplerIconFor = (slug: string): string | undefined => {
    const rel = tramplerIconRel[slug];
    return rel ? "/tramplers/" + rel.split("/").pop() : undefined;
  };
```

- [ ] **Step 2: Prefer the matched sprite over the scraped web image**

In the trampler `scraped` object (`prisma/seed.ts:168`), change the `icon` field from:

```typescript
      description: opt(t.description), icon: opt(t.icon), sourceUrl: opt(t.sourceUrl),
```

to:

```typescript
      description: opt(t.description), icon: tramplerIconFor(slug) ?? opt(t.icon), sourceUrl: opt(t.sourceUrl),
```

- [ ] **Step 3: Confirm the manifest the seed will read exists**

The repo has no standalone typecheck script; `db:seed` runs via `tsx`. Confirm `prisma/trampler-icons.json` is present (created in Task 8) so the new `readFileSync` won't throw:

Run: `node -e "console.log(require('fs').existsSync('prisma/trampler-icons.json'))"`
Expected: `true`. (Actual type/seed validation happens in Task 10 Step 1.)

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(wiki): seed trampler part icons from matched sprites"
```

---

## Task 10: Seed, run, and verify on the tramplers pages

**Files:** none (verification).

- [ ] **Step 1: Re-seed the dev database**

Run: `npm run db:seed`  (equivalently `npx tsx prisma/seed.ts`)
Expected: completes without error; trampler upserts run. Type errors in the Task 9 edit would surface here.

- [ ] **Step 2: Start the app and view the tramplers section**

Use the `/run` skill (or `npm run dev`) and open the tramplers list + a few detail pages whose icons were matched in different categories (e.g. an Armor plate, a Balcony, a Cargo bay, a Reactor matched by vision).
Expected: each shows its game part-icon sprite on the `ItemIcon` tile (not the `▦` placeholder). Tramplers with no sprite still show the placeholder — that is correct.

- [ ] **Step 3: Spot-check correctness against the review sheet**

Confirm the on-page icons match what the review PDF/HTML showed for a handful of material variants (Wood vs Metal etc.). If any are wrong, fix the override in the scraper (Task 6 Step 3), re-run Tasks 6 Step 4 → 7 → 8 → 10.

- [ ] **Step 4: No code commit** (verification only). If `/run` produced screenshots, note them in the PR description.

---

## Notes for the executor

- **Cross-repo ordering is strict:** Tasks 1–7 (scraper, `feat/sand-scraper-impl`) must finish and produce `out/trampler-icons.json` + populated `out/part-icons/` before Tasks 8–10 (wiki, `master`). The wiki importer reads the scraper `out/` directory by relative path.
- **Vision pass (Task 5) is the only non-TDD task** — it is human-supervised and gated by the Task 6 review sheet; do not skip the review checkpoint.
- The wiki's `AGENTS.md` warns its Next.js has breaking changes — for any wiki code beyond seed/import scripts, read `node_modules/next/dist/docs/` first. This plan touches only seed/import scripts, so no Next.js APIs are involved.
