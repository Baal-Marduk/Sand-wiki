# Desert Raiders Restyle — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design); proceeding to plan
**Builds on:** the SAND wiki + navigation taxonomy (branch `build/sand-wiki-impl`)

## 1. Goal

Restyle the entire wiki with a cohesive "Desert Raiders" visual theme built on **DaisyUI**,
including a light/dark toggle and a display font for headings. Presentation-only — no new pages,
routes, or data changes.

Also corrects the game's name throughout to **"SAND: Raiders of Sophie"** (previously written
"Raiders of Sofia").

## 2. Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Framework | **DaisyUI 5** (Tailwind v4 compatible) via `@plugin "daisyui"` |
| Visual direction | **Desert Raiders** — warm sand/amber/rust palette |
| Theme mode | **Dark + light toggle**: `desertnight` (default, dark) and `desertday` (light) |
| Headings font | **Oswald** (display) via `next/font/google`; system sans for body |
| Scope | **Full themed redesign** across all pages |
| Homepage | **Layout A**: hero with display title, subtitle, prominent search, category chips, and a "browse by section" card grid |
| Game name | **SAND: Raiders of Sophie** (fix all "Sofia" occurrences) |

## 3. Theming

- In `src/app/globals.css`: keep `@import "tailwindcss"`, add `@plugin "daisyui";`, and define two
  custom themes with `@plugin "daisyui/theme" { ... }`:
  - **`desertnight`** (`default: true`, `color-scheme: dark`): `base-100` ≈ `#171009`,
    `base-200` ≈ `#1f160d`, `base-300` ≈ `#3a2c1c` (borders), `base-content` ≈ `#ece0cb`,
    `primary` ≈ `#e8893b` (amber) with dark `primary-content`, `secondary`/`accent` ≈ `#b5532a`
    (rust).
  - **`desertday`** (`color-scheme: light`): warm sand `base-100` ≈ `#efe6d6`, dark-brown
    `base-content` ≈ `#2a1d10`, deeper amber `primary` ≈ `#c2671f`.
- Remove the old hand-rolled `body { background/color }` workaround and the `bg-neutral-950
  text-neutral-100` classes on `<body>`; use DaisyUI semantic classes (`bg-base-100`,
  `text-base-content`, `btn-primary`, `card`, `badge`, `navbar`, `table`, `hero`, `alert`).
- `<html data-theme="desertnight">` is the default; the toggle overrides it.

## 4. Typography

- Load **Oswald** with `next/font/google` (weights 500/700) in `layout.tsx`, exposed as a CSS
  variable (e.g. `--font-display`).
- Apply it to the logo, hero title, and page/section headings (via a `font-display` utility class
  or by mapping it in the Tailwind theme). Body text keeps the default sans.

## 5. Theme toggle

- A small **`ThemeToggle`** client component (`"use client"`) using DaisyUI's `theme-controller`
  (a `swap` with ☀/☾), placed at the end of the navbar.
- Persists the choice to `localStorage` under a key like `sand-theme`.
- A tiny inline script in `<head>` reads `localStorage` and sets `document.documentElement
  .dataset.theme` before paint to avoid a flash of the wrong theme (FOUC).
- Default when nothing stored: `desertnight`.

## 6. Per-page redesign

- **`MainNav`** → DaisyUI `navbar`: Oswald logo "SAND", Items `dropdown` of categories, the other
  sections as links, then `ThemeToggle` and About. Keep `aria-label="Primary"` and keyboard
  operability (DaisyUI dropdown via `<details>` or focusable button).
- **Home (`/`)** → DaisyUI `hero`: display title "Unofficial SAND Wiki", subtitle referencing
  *Raiders of Sophie*, a prominent search (`input` + `btn-primary`), category chips (`badge`
  links to `/items?category=<slug>`), and a "Browse by section" grid of `card`s for the five
  sections.
- **Items (`/items`)** → filter form as DaisyUI controls (`input`, `select`, `btn`) inside a
  `card`; results as a responsive grid of `card`s; result count as a `badge`; styled empty state.
- **Item detail (`/items/[slug]`)** → header with `badge`s (category, workbench level); recipe
  and "used in" as clean lists; metadata; back link as `btn-ghost`/`link`.
- **Tech (`/tech`)** → graph inside a themed `card` (React Flow stays, container restyled, still
  `inert` with the accessible table fallback); tech list as a DaisyUI `table`; calculator as a
  `card` form; totals as `badge`s.
- **Placeholders (`/environment`, `/tramplers`)** → `hero`/`alert` "Coming soon" with planned
  categories as `badge`s.
- **Tools (`/tools`)** → calculator list as `card`s. **About (`/about`)** → styled prose card
  with the corrected name and disclaimer.
- **Footer** → DaisyUI `footer` with the unofficial / not-affiliated-with-tinyBuild disclaimer.

## 7. Name correction

Replace "SAND: Raiders of Sofia" / "Raiders of Sofia" with **"SAND: Raiders of Sophie"** in:
`src/app/layout.tsx` (metadata), `src/app/page.tsx`, `src/app/about/page.tsx`, and `README.md`.
(Historical spec docs are left as-is.)

## 8. Accessibility

- Run axe (Playwright) in **both** themes — the existing per-page pass on the default
  (`desertnight`) plus one pass that sets `desertday` — and keep zero serious/critical violations.
  Both custom themes must meet contrast (set `base-content`/`primary-content` accordingly).
- DaisyUI dropdown remains keyboard-operable; the theme toggle is a labelled control
  (`aria-label`); the decorative graph stays `inert` with the table fallback.

## 9. Testing

- Existing e2e selectors are role/name-based and should largely survive. Update any that break
  from navbar markup changes (e.g. the "Items" menu opener). Add:
  - a theme-toggle test (clicking it changes `documentElement` `data-theme` to `desertday`);
  - a second axe pass in `desertday`.
- Unit tests (taxonomy, tech-tree, item-filter) are unaffected.
- Full gate green: `npm run test`, `tsc --noEmit`, `lint`, `build`, `test:e2e`.

## 10. Out of scope

No new pages/routes, no data-model or query changes, no new dependencies beyond DaisyUI and the
`next/font` Oswald import.
