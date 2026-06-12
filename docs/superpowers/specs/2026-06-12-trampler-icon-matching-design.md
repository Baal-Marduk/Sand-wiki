# Trampler Icon Matching & Import — Design

**Date:** 2026-06-12
**Status:** Approved (brainstorming), pending implementation plan

## Goal

Give every wiki trampler page its crisp in-game part icon. Two halves:

1. **Match** all 152 exported game part-icon sprites to the 120 wiki trampler records,
   producing a `slug → spriteName` mapping.
2. **Import** the matched PNGs into the wiki so trampler cards and detail pages render
   the icon (the same way item icons already work).

## Background / current state

- **sand-scraper** (worktree `feat/sand-scraper-impl`, unmerged) has already exported
  **152** sprites named `walker_comp<Category>_<Variant>_<Material>_<WxH>_icon.png` into
  `out/part-icons/`.
- A deterministic token-overlap matcher exists: `src/sand_scraper/trampler_icons.py`
  (`auto_match`, `parse_sprite`, `wiki_keywords`, `build_manifest`). It is precision-first
  — it only commits a match when exactly one in-category sprite has the strictly-highest
  token overlap, leaving material variants (Wood/Metal/Frame/Open) and flavor-name gaps
  unmatched.
- A standalone HTML picker exists: `src/sand_scraper/trampler_icon_tool.py` — renders every
  trampler with its current icon + status badge and a category-filtered picker; exports
  `trampler_icon_overrides.json`.
- **`icon_link_sheet.pdf`** is a prior *visual* matching attempt: 40 of 152 sprites mapped
  to wiki trampler names with reasoning notes (32 confident, 5 to verify, 3 unused). It
  covers only the Armor/Balcony/Cargo/CaptainCrew categories. **This work exists only in
  the PDF** — no `trampler_icon_overrides.json` is committed yet.
- **sand-wiki** (`master`) has **120** tramplers in `prisma/tramplers.json` (slug/name/
  category; no `icon` field). Rendering plumbing already exists:
  - `TramplerPart.icon: String?` in `prisma/schema.prisma`
  - `ItemIcon` component renders an `icon` path on a neutral tile (used by `TramplerCard`
    and `EntityDetail`)
  - empty `public/tramplers/` directory
  - item-icon precedent: `seed.ts` reads `prisma/icons.json` and stores `icon` as
    `/icons/<file>.png`; `import-scraper-assets.mjs` copies the PNGs into `public/icons/`.

### Why matching is fundamentally visual

The wiki names are scraped flavor names (`S&H Cargo Bay, L-Shape`) with no internal id to
join on, and material variants routinely tie under pure token overlap. The PDF demonstrates
the working approach: read the rendered icon + the sprite name + the candidate wiki names,
and reason out the match. Hence a **hybrid**: deterministic for the unambiguous majority,
vision for the ambiguous remainder.

## Decisions (from brainstorming)

- **Match method:** Hybrid — deterministic `auto_match` for unambiguous sprites, a vision
  pass for the ambiguous remainder.
- **Verify gate:** Regenerate a full review sheet over all 152 (HTML picker + PDF link-sheet),
  human eyeballs/corrects, exports the final overrides, *then* import.
- **Architecture:** Extend the existing scraper pipeline (rejected alternatives: one-shot
  vision mapping; authoring the mapping directly in the wiki — both break the established
  separation where the scraper owns the sprites + matcher).

## Pipeline (5 stages)

### 1. Seed prior work (scraper)
Parse `icon_link_sheet.pdf` (PyMuPDF, already installed in the worktree `.venv`) and
normalize its 40 `sprite → wiki-name` links into `trampler_icon_overrides.json`
(`{slug: spriteName}`). Join names to slugs with a normalizer that repairs the PDF's HTML
artifacts (`S&H;` → `S&H`, `L&R;` → `L&R`, `&amp;`) and slugifies to match `tramplers.json`
slugs. **Any PDF target that does not resolve to a real slug is reported, not silently
dropped** (e.g. `S.Trs HA Armor Plate` may have no matching trampler record).

### 2. Deterministic pass (scraper)
Run the existing `auto_match` over the sprites not already pinned by step 1. Accept its
high-confidence unambiguous matches automatically — the "easy" half of the hybrid.

### 3. Vision pass — ambiguous remainder (scraper)
For each wiki category that still has ambiguity, dispatch a vision agent given:
- the category's still-unmatched sprite PNGs,
- the category's candidate trampler names + slugs,
- the deterministic proposals as a starting point.

It returns `slug → sprite` with a confidence and a one-line reason. Category-constrained, so
candidate sets stay small. Results merge into the overrides. Per-category agents can run in
parallel.

### 4. Review sheet + export (scraper)
Regenerate the existing HTML picker tool (and a refreshed PDF link-sheet) over **all 152**,
showing every match, its source (override / auto / vision), and confidence. Human
eyeballs/corrects and exports the final `trampler_icon_overrides.json`. Then `build_manifest`
writes `out/trampler-icons.json` (`{slug: "part-icons/<file>.png"}`) and reports unmatched
tramplers and unused sprites.

### 5. Wiki import (sand-wiki)
New `prisma/import-trampler-icons.mjs`, mirroring `import-scraper-assets.mjs`:
- copy matched PNGs from `out/part-icons/` into `public/tramplers/`,
- write `prisma/trampler-icons.json`,
- `seed.ts` sets `TramplerPart.icon = "/tramplers/<file>.png"` from that manifest.

`ItemIcon` / `TramplerCard` / `EntityDetail` already render `icon` — **no component
changes**. Unmatched tramplers fall back to the existing placeholder glyph.

## Where the work lives

- Stages 1–4: **sand-scraper**, worktree `feat/sand-scraper-impl`.
- Stage 5: **sand-wiki**, `master`.

This mirrors the existing cross-repo split (`config.toml` already cross-references both
repos; `import-scraper-assets.mjs` is the precedent importer).

## Components / interfaces

| Unit | Purpose | Depends on |
|------|---------|-----------|
| PDF parser + name→slug normalizer | recover the prior 40 into overrides | PyMuPDF, `tramplers.json` |
| `auto_match` (existing) | deterministic unambiguous matches | sprite names, trampler records |
| vision matcher | resolve ambiguous remainder per category | rendered PNGs, candidate names |
| review sheet (existing HTML tool + PDF) | human verify/correct | overrides, sprite PNGs |
| `build_manifest` (existing) | overrides → `trampler-icons.json` | overrides, sprite→png map |
| `import-trampler-icons.mjs` (new) | copy PNGs + write wiki manifest | `out/`, wiki `public/`, `prisma/` |

## Testing

- Pure unit tests over committed fixtures for the **PDF parser** and the **name→slug
  normalizer** (these are deterministic and join-critical).
- The vision pass is non-deterministic — it is gated behind the human review sheet rather
  than asserted in tests.
- Existing `trampler_icons` tests continue to cover `auto_match`/`parse_sprite`.

## Risks / open points

- **152 sprites vs 120 tramplers** — a partial 1:1 join. Some sprites are genuinely unused
  (PDF flagged 3), some tramplers may have no sprite. Unmatched tramplers render the
  placeholder; the review sheet surfaces both leftovers.
- **Name-join fragility** — PDF/scraped names may not exactly equal `tramplers.json` names.
  The normalizer handles known artifacts; unresolved names are reported for manual mapping.
- **Worktree is unmerged** — scraper-side work continues on `feat/sand-scraper-impl`; the
  wiki import lands on `master` only after the final overrides + manifest are produced.
