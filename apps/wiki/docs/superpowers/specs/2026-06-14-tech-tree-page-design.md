# Tech Tree page — design

**Date:** 2026-06-14
**Branch/worktree:** `worktree-feat+tech-tree-page` (isolated, based on `origin/master` @ 289e2b8)
**Status:** Approved — ready for implementation plan

## Goal

Replace the placeholder `/tech` route with an interactive, read-only Tech Tree screen that
visualizes all 95 research nodes (3 factions × 4 tiers), faithful to the approved mockup in
`design/tech-tree.html` + `design/tech-tree.js`. Users can hover a node for full cost detail,
click nodes to plan an unlock path (combined cost of only what they haven't unlocked yet), and
mark nodes unlocked. Progress persists in `localStorage` (Phase 1); Steam-account sync is Phase 2.

This is the production rebuild of the throwaway POC at `public/tech-tree-poc.html`, which was used
only to validate the data and is **not** shipped.

## Data source (live, from Prisma)

The data is already seeded in the DB (verified: 95 `tech-node` entities, 95 `TechNodeStats`,
82 `tech-prereq` links, 121 `tech-unlocks`, 233 cost links). The page is a server component that
queries Prisma at request time — no generated static data file.

### `getTechTree()` — new query in `src/lib/queries.ts`

Returns a serializable graph. Per node:

| Field | Source |
|---|---|
| `slug`, `name` | `Entity` |
| `faction`, `tier` | `TechNodeStats` |
| `letter` | parsed from slug (`tech-<faction>-t<tier><letter>-…`) via a small helper — no schema migration |
| `crowns` | cost `EntityLink` where `name === "Crowns"` → `amount` (the card's single cost number) |
| `costs[]` | ALL cost `EntityLink`s → `{ name, amount, icon }` (icon resolved via the existing resource-name→icon map; `Raw Aurogen Crystal` has no icon → fallback). Drives the **tooltip** + **planner totals**. |
| `unlocks[]` | `tech-unlocks` links → `{ name, slug, icon }`. First unlock's icon = the node's glyph; full list shown in tooltip. |
| `prereqs[]` | `tech-prereq` links → target node slug, **filtered to same-faction only** (see Data rules) |

### Data rules

- **Same-faction prereq edges only.** Of 82 prereqs, exactly one is cross-faction:
  kaiser `3b` "Great Chassis" carries a stray `"III(a) Great Chassis"` label with no kaiser
  counterpart (kaiser `3a` is "Resources"). Its valid prereq `"II(b) Middling Chassis"` remains.
  The query drops any prereq whose resolved target is a different faction, cleanly ignoring this
  one bad edge **without editing source data**.
- **Free / default-unlocked roots.** Nodes with no (same-faction) prereqs are the free entry
  techs and seed the default-unlocked set. Each faction's starting hull part:
  godlewski → Small Chassis (`S&H Atm.Fs 77B-Q Small Chassis`), kaiser → Cargo Deck
  (`s-h-cargo-deck`), landwehr → Entrance Vestibule / fortified entrance area. Roots link to real
  part entities via `tech-unlocks` (confirm exact slugs during build; godlewski variant is `77B-Q`).

## Layout — `src/lib/tech-tree/layout.ts` (pure, unit-tested)

Transforms the node list into positioned data, mirroring `design/tech-tree.js`:

- **Columns:** each distinct `(tier, letter)` pair → one column; columns ordered by tier then
  letter and grouped under the 4 tier headers (validated against the POC: T1/T2 = a,b,c; T3/T4 = a,b,c,d).
- **Lanes:** a node's vertical index within its `(faction, tier, letter)` group → faction bands
  become a column × lane grid.
- **Edges:** from each prereq target → node, plus a faction-root edge for prereq-less nodes.
- **Graph helpers:** `ancestors(id)`, `descendants(id)` (transitive closure) for path costing and
  cascade unlock.

Layout constants (card/column/lane sizes) carried over from the mockup.

## Components

- `src/app/tech/page.tsx` — async server component: `const tree = await getTechTree()` →
  `<TechTreeView tree={tree} />`. Replaces the current `SectionPlaceholder`.
- `src/components/tech-tree/TechTreeView.tsx` — `"use client"`. Ports `design/tech-tree.js` 1:1 into
  React + the existing `globals.css` tokens:
  - Faction bands (tinted), absolute-positioned `.tnode` cards, SVG orthogonal connectors, sticky
    tier bar, top app bar (progress count, Clear selection, Reset progress), legend.
  - **Node card (compact):** rail, status ring (click → toggle unlocked), name, **Crowns cost only**,
    first-unlock icon glyph. Faction `--fac` accent set inline (blue / amber / green).
  - **NO faction level numbers** (the in-game 5 / 13 / 4 badges are omitted).
  - **Hover tooltip:** code, name, status, **full cost breakdown — every resource with icon + qty**,
    requires list, unlocks list, and "path from your progress" cost (Crowns).
  - **Path planner (bottom-right):** target chips, **remaining Crowns** (only un-unlocked nodes on
    path) + techs-left + full-path figures, **aggregated materials list** for the path, build-order
    steps, "Mark all unlocked".
  - States: `is-unlocked`, `is-selected`, `in-path`, `dimmed`, `flash`.
- `src/lib/tech-tree/types.ts` — shared TS types for the serialized tree.
- Faction accent colors: a small constant map (godlewski `#4493f8`, kaiser `#e3a008`,
  landwehr `#6fb24a`). Confirm against the desert palette during build.

## Persistence

### Phase 1 (this project) — localStorage

- Key `sand_techtree_unlocked_v1`; value = array of unlocked node slugs.
- Cascade (from mockup): unlocking a node marks all its ancestors; un-marking removes all
  descendants. Seeded with the default-unlocked roots on first load / reset.
- Toolbar: Clear selection, Reset progress (back to default roots, with confirm).

### Phase 2 (separate, after Phase 1 is verified) — Steam account sync

Out of scope for this plan; recorded for continuity:
- `UserTechProgress` model (`steamId` → unlocked slugs).
- `GET/PUT /api/tech/progress` gated behind the existing Steam session.
- Merge local progress into the account on login; account becomes source of truth when signed in.

## Testing

- **Unit (Vitest, matches existing `*.test.ts`):** `layout.ts` — column/lane assignment, tier
  grouping, same-faction edge filtering (asserts the kaiser `3b` cross-faction edge is dropped),
  `ancestors`/`descendants`, and path-cost math (remaining vs full, counts only un-unlocked).
- **Manual verify (run skill):** render the page, confirm the board matches the mockup, tooltip
  shows full materials, planner math is correct, unlock toggle + cascade + localStorage persistence
  work across reload.

## Out of scope

- Material costs on the card face (card is Crowns-only by decision).
- Steam account sync (Phase 2).
- Editing the tree (handled by the existing admin/proposal flow).
- Shipping the POC (`public/tech-tree-poc.html`) — dev aid only.
