# Shared Entity Detail Component — Design

**Date:** 2026-06-12
**Status:** Approved (pending spec review)

## Problem

The three leaf/detail pages — item (`items/[slug]`), trampler part (`tramplers/[slug]`),
and environment entity (`environment/[slug]`) — render bespoke layout markup. They have
drifted apart: different widths, different header structure, stats expressed three
different ways, and inconsistent presence of icons, badges, and source links. A recent
symptom is that the articles are no longer centered on the page.

This duplication makes consistency changes (button placement, breadcrumbs, spacing) a
three-file chore and a source of regressions. We want one shared display component so the
pages differ only in the data they feed it.

## Goal

Introduce a single shell component, `EntityDetail`, that renders every leaf page. Each
`page.tsx` becomes: fetch data → map to `EntityDetail` props → render. No layout markup
remains in the pages. Centering and width are owned by the shell.

Non-goals: changing data models, queries, or the contribution/edit flow. No new routes.
No redesign beyond normalizing the existing pieces.

## Layout (decision: adaptive two-column)

Top to bottom, the shell renders:

1. **Top row** — `Breadcrumb` (left) + `SuggestCorrectionLink` (right), in
   `flex items-center justify-between gap-2`.
2. **Header** — `flex flex-wrap items-start gap-4`: optional `ItemIcon` (size `lg`) +
   a `flex-1 min-w-[16rem] space-y-2` column holding the `h1` title, optional badges row,
   optional description paragraphs, and the optional prominent stat grid.
3. **Body** — adaptive:
   - If `detailRows` are provided → two-column grid `lg:grid-cols-[1fr_260px] items-start`:
     tabs in the main column, `ItemDetailsPanel` in the sidebar.
   - Otherwise → single column with tabs only.
4. **Source footer** — optional `Source: sandgame.wiki ↗` line.

**Width & centering** are derived from one `hasSidebar = detailRows?.length > 0` flag:
- two-column → `article` is `max-w-5xl mx-auto`
- single-column → `article` is `max-w-3xl mx-auto`

Every page gets `mx-auto`, which fixes the not-centered regression. Article spacing is
unified to `py-6 space-y-6`.

## Component API

```ts
interface EntityDetailProps {
  breadcrumb: Crumb[];                       // top-left trail (existing Breadcrumb)
  suggest: { type: string; slug: string };   // top-right SuggestCorrectionLink
  icon?: { name: string; icon: string | null; rarity?: string | null }; // omitted if absent
  title: string;                             // h1
  badges?: React.ReactNode;                  // composed per page (rarity badge + CategoryTag)
  description?: string | null;               // split on /\n+/ into <p> paragraphs
  stats?: StatCell[];                        // prominent grid under header (StatGrid)
  detailRows?: DetailRow[];                  // sidebar rows; presence => two-column
  tabs?: Tab[];                              // main content (existing ItemTabs)
  sourceUrl?: string | null;                 // footer link
}
```

- `Crumb` is the existing type from `Breadcrumb.tsx`.
- `DetailRow` is the existing type from `lib/item-view` used by `ItemDetailsPanel`.
- `Tab` is the existing type from `ItemTabs.tsx`.
- An `icon` with a truthy `rarity` renders with the rarity ring; otherwise decorative.
- `description` is always split on newlines, so a single-line string yields one paragraph
  and env's multi-paragraph text yields several — one code path.
- When `tabs` is empty/absent, the main column renders nothing (or the existing
  "no data" fallback the item page already uses, preserved on the item page only).

## Extraction: StatGrid

The prominent stat grid markup is duplicated today: `StatBox` and the trampler stats
`<dl>` are the same `dl grid grid-cols-2 sm:grid-cols-3 gap-px …` block. Extract it:

- **`StatGrid({ cells }: { cells: StatCell[] })`** — presentational; renders the `dl`.
  `StatCell = { label: string; value: React.ReactNode }`. Renders nothing when empty.
- **`StatBox`** keeps its current signature and behavior but builds its cells and delegates
  rendering to `StatGrid` (no visual change).
- Tramplers build their stat cells inline and pass them to `EntityDetail`'s `stats` prop,
  which renders `StatGrid`.

## Per-page mapping

| Slot | Item | Trampler | Environment |
|---|---|---|---|
| icon | ✓ + rarity | ✓ decorative | ✓ decorative *(new)* |
| badges | rarity badge + CategoryTag | CategoryTag | CategoryTag *(new)* |
| stats (grid) | Damage/Magazine/Type (StatBox cells) | Dimensions/Health/Weight/… | — |
| detailRows (sidebar) | category/storage/tier/value | Research node/name/tier | — |
| tabs | crafted-by / used-in / ammo / used-by / loot | Build Cost | loot tiers |
| sourceUrl | — | ✓ | ✓ |

Consequences of normalization:
- **Trampler Research** moves from a tab into the sidebar Details panel (rows: research
  node/name joined, plus a Research Tier row). The only trampler tab becomes Build Cost.
- **Environment** gains an icon and a category badge in its header (data already exists;
  the list cards already show the icon). The old detail page omitted both.
- The item page keeps its existing "No crafting, usage, or trade data" empty-state when
  it has zero tabs; other pages simply render no tab block.

## Files touched

- **New** `src/components/EntityDetail.tsx` — the shell.
- **New** `src/components/StatGrid.tsx` — extracted stat grid.
- **Edit** `src/components/StatBox.tsx` — delegate to `StatGrid`.
- **Rewrite** `src/app/items/[slug]/page.tsx` — map to `EntityDetail`.
- **Rewrite** `src/app/tramplers/[slug]/page.tsx` — map to `EntityDetail`; Research → sidebar.
- **Rewrite** `src/app/environment/[slug]/page.tsx` — map to `EntityDetail`; add icon + badge.

Unchanged and reused as-is: `Breadcrumb`, `SuggestCorrectionLink`, `ItemTabs`,
`ItemDetailsPanel`, `ItemIcon`, `CategoryTag`.

## Verification

- `tsc --noEmit` and `eslint` clean across the touched files.
- Manual check of all three page types in the running app:
  - item with sidebar + stats + multiple tabs; item with no tabs (empty-state preserved).
  - trampler: stats grid prominent, Research in sidebar, Build Cost tab, source link.
  - environment: icon + category badge present, single centered column, loot tabs, source.
- Confirm all three articles are centered and breadcrumb/Suggest sit on one top row.
```
