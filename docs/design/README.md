# SAND Wiki — Visual Redesign Reference

High-fidelity, framework-free HTML/CSS mockups for the redesign of the **Unofficial SAND Wiki** ("SAND: Raiders of Sophie"). These are the approved visual reference that the engineering phase will rebuild as themed **shadcn/ui** React components. They are *not* production React and import no framework.

> **Status (2026-06-19).** Approved visual reference for the now-completed shadcn/ui redesign — historical/reference, consolidated here under `docs/design/` (tracked). The live design system of record is `apps/wiki/src/app/globals.css` + `apps/wiki/src/lib/rarity.ts`; where this README disagrees (e.g. stale Epic/Legendary/Relic rarity names), those files win. See `apps/wiki/instructions.md` § Design system.

## Files

| File | What it is |
|---|---|
| `index.html` | The full reference — one scrollable page, one anchored section per screen, each shown at **desktop + mobile** width with its **key states** (hover, active filter, empty, loading skeleton, validation error). Sticky section nav at top. |
| `sand-wiki.css` | The unified design system: all tokens, type ramp, and every component class (`.ec` EntityCard, `.chip`, `.rarity-badge`, `.stat-grid`, `.tabs`, `.dtable`, `.appbar`, `.drawer`, `.ac` autocomplete, form controls, skeletons, empty states). This is the single source the React rebuild should mirror. |

`index.html` references `sand-wiki.css` relatively — open `index.html` in any browser, no server needed. (Minor deviation from "inline CSS": kept as one stylesheet so the system is legible as a token reference rather than buried in markup. Inline if a single-file artifact is required.)

## Coverage

1. **App shell** — sticky blurred header (brand, section-dropdown nav, inline search, auth menu) + restyled footer; mobile hamburger → left slide-in drawer; auth menu signed-in.
2. **Home** — hero + hero-search + blueprint grid + category entry cards.
3. **Items list** — `[sidebar | grid]`, per-category counts, rarity filter chips, EntityCard grid. States: default w/ hover, active filter, empty, loading skeleton, mobile chip row.
4. **EntityDetail** — large sprite + rarity/category badges, stat grid, tabbed relationship tables (crafting / used-in / loot), Details facts panel. Adaptive: split layout w/ relations, centered fallback without.
5. **Tramplers & Environments** — same browse shell; trampler mount stats; environment threat-level rail.
6. **Search + autocomplete** — navbar variant + hero variant + empty-query + no-results.
7. **Contribute / edit / admin** — proposal form (with validation-error state), recipe ingredient editor with enum selects, admin proposals queue with status tags + approve/reject.
8. **About + auth** — About page (hero + stat grid + license); auth menu signed-out and signed-in.

## Unified decisions

**Tokens** — verbatim from the locked spec; rarity 1–6 mirror `src/lib/rarity.ts`:

```
Surfaces  --background #0d0a06 · --card #15100a · --card-elevated #1d160d · --border #2a2012
          (+ --border-strong #3a2c18, added for input/divider contrast)
Text      --foreground #ece0cb · --muted-foreground #9a8f7c · --dim #74695a
Brand     --primary #e8893b · --secondary #b5532a · --accent #c9a24b
          (+ --primary-hover #f29b52, --primary-press #cf7530 for button states)
State     --info #6aa9c9 · --success #7fb069 · --warning #e0a341 · --destructive #d4654f
Rarity    1 #adadad Common · 2 #82b276 Uncommon · 3 #85b3db Rare · 4 #ab85d4 Epic · 5 #e2a554 Legendary · 6 #ec3f4a Relic
```

**Type** — Display **Oswald** (300–700) for headings, brand, labels, stat labels, tabs, chips, buttons. Body = system sans stack (14px / 1.55). Data/stats = system mono, `tabular-nums`.

**Spacing** — 4px base: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48`. Card padding 14–24; grid gap 12; section padding 18–24.

**Radius** — `0` everywhere. No rounded cards/buttons/badges/inputs/chips. The only rounded element on the page is the phone bezel (it's the review chrome, not the product).

**Motion** — color / background / border-color / brightness transitions only (100–120ms). No transforms, no entrance animations. The one exception is the loading-skeleton shimmer, gated behind `prefers-reduced-motion`.

**Accessibility** — every text/background pair targets WCAG AA @14px. `--primary` is **never** used as text on `--card`; primary always appears as a fill behind dark text (`#1a0f04`). Active filter chips = `--primary` background + dark foreground. Rarity colors are used for rails, dots and badge borders/text (all pass on dark surfaces), never as card fills behind body text.

## Deviations from the brainstorm rounds (with rationale)

- **EntityCard**: `cards.html` used a full rarity-tinted card background; `rarity-filter.html` used a thin rail. → **Unified on 4px rail + neutral card.** Keeps AA contrast on names, keeps a dense grid calm, reserves saturated rarity color for the badge + detail header.
- **EntityDetail stats**: `detail-stats.html` stacked stats as a vertical list. → **Promoted to a bordered stat grid** (rustlabs density) so headline numbers read first.
- **Relationship data**: crafting / used-in / loot were three separate panels. → **Unified into one tabbed table.**
- **Mobile search**: the navbar-search round kept search inline at all widths. → **Inline on desktop, moved into the drawer on mobile** so the narrow bar holds only brand + hamburger + auth.
- Added `--border-strong`, `--primary-hover`, `--primary-press` (not in the token list) purely for interactive-state and divider contrast — derived from the existing palette, no new hues.

## Flagged for engineering (ambiguous in the spec / not in source)

1. The spec's component map references **`polished-v2.html`**, which does **not** exist on disk. Direction was synthesized from the brainstorm rounds instead — confirm no canonical reference was lost.
2. **Trampler stat set** is undefined in the brief — `speed / cargo / health / stamina` is assumed. Confirm the real stat schema.
3. **Environment "threat" levels** are not in `rarity.ts`. Mapped to state colors (low→success, moderate→warning, high→destructive, extreme→rarity-6) as a placeholder scale — needs a canonical enum.
4. Sprite art is a `▦` glyph placeholder everywhere a real sprite will go (`.glyph`). The rebuild should swap in the sprite component while keeping the rarity-left-border treatment on the detail-page tile.
