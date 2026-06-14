# Item-side loot editing ("Found in") — Design

**Date:** 2026-06-14
**Status:** Approved direction; pending spec review
**Branch:** feat/entity-tab-editing

## Problem

Loot is a core relationship for almost every item: a container/landmark states what
items can be found inside it, and an item should state which containers/landmarks it
can be found in. Today:

- Loot is editable **only from the container/landmark side** — any environment entity
  (`loot-containers` and `landmarks`) gets a Loot editor in its Edit Tabs
  (`edit-tabs` `ROLE_FOR_TYPE.envEntity = "loot"`).
- The item detail page **displays** a "Loot" tab (where the item is found) via
  `getCratesContaining`, but that query only includes `loot-containers` and
  **excludes landmarks**.
- There is **no way to edit loot from the item's Edit Tabs page** — it shows only the
  recipe sections (Crafted by / Used in).

We want item-side (inverse) loot editing, plus a display fix so the item's loot list
includes landmarks.

## Data model (unchanged)

`EntityLink(role="loot", source = container/landmark, target = item, tier, value1, sortOrder)`.

- Forward (existing): edit a **source's outgoing** loot links (pick items).
- Inverse (new): edit an **item's incoming** loot links (pick sources).

A loot source is an `Entity` with `kind="environment"` and
`category ∈ { "loot-containers", "landmarks" }`.

## Approach

Mirror the existing `links_edit` pipeline with a **dedicated proposal kind** rather than
overloading `links_edit` with a direction flag. The forward apply path ("edit a source's
outgoing links") and the inverse apply path ("edit an item's incoming links") have
different delete scopes and slug resolution; separate apply functions keep each simple.
The pure helpers (`LinkRowDraft`, `parseLinkRows`, `diffLinkRows`, snapshot equality) and
the `LinkEditForm` UI are reused.

**Proposal kind:** `loot_sources_edit`
- `targetType = "item"`, `targetSlug = <item slug>`
- `changes = { role: "loot", old: LinkRowDraft[], new: LinkRowDraft[] }`
- **Inversion convention:** in these rows, `LinkRowDraft.targetSlug` holds the **source**
  (container/landmark) slug, and `name` holds the source's display name. This is the only
  semantic difference from `links_edit` rows; documented in code where the rows are built
  and consumed.

**Apply strategy:** careful per-row diff (not delete-all-recreate), keyed by
**source slug + tier**, so:
- the same item appearing at two tiers in one source stays two distinct rows, and
- editing an item's loot does **not** reshuffle each container's existing loot ordering.

## Components

### 1. `src/lib/queries.ts`
- `getIncomingLootLinks(itemSlug)`: returns the item's incoming loot links resolved to
  `{ sourceSlug, name, tier, value1, sortOrder }` (ordered by sortOrder). Returns null if
  the slug is not an item. Used to build the `old` snapshot and prefill the form.
- `listLootSources()`: `{ slug, name }[]` of env entities with
  `category ∈ {loot-containers, landmarks}`, ordered by name — the source dropdown options.
- Widen `getCratesContaining(itemSlug)`: change `source: { category: "loot-containers" }`
  to `source: { kind: "environment", category: { in: ["loot-containers", "landmarks"] } }`
  so the item's Loot tab shows containers and landmarks. Return shape unchanged.

### 2. `src/lib/link-proposal.ts`
- `incomingLootToDrafts(rows)`: map loaded incoming-loot rows
  (`{ source: {slug}, name, tier, value1, sortOrder }`) → `LinkRowDraft[]` with
  `targetSlug = source.slug`. Sorted by sortOrder. (Mirror of `linksToSnapshot` for the
  inverse direction.)
- `diffLootSources(existing, newRows)`: **pure** planner returning
  `{ creates: LinkRowDraft[], updates: {row, existing}[], deletes: existingKey[] }`,
  keyed by `${sourceSlug}|${tier ?? ""}`. `existing` rows carry their link id + sortOrder.
  Unit-tested. Used by the apply function.
- Reuse `parseLinkRows` (slug+tier+value1 pairing) and `snapshotsEqual` / `diffLinkRows`
  unchanged.

### 3. `src/lib/proposal-apply.ts`
- `applyItemLootProposal(proposalId, reviewerSteamId)`, transactional:
  1. Load proposal; assert `kind === "loot_sources_edit"`, pending, has targetSlug + changes.
  2. Resolve the target item entity by slug (must be `kind="item"`).
  3. Load existing loot links targeting the item:
     `entityLink.findMany({ where: { role:"loot", targetId: item.id }, include source slug })`.
  4. Resolve all `new` row source slugs → source entity ids; throw on unknown source.
  5. `diffLootSources(existing, change.new)`:
     - **deletes** → `entityLink.delete` per removed link.
     - **updates** → `entityLink.update` setting `value1` (tier is part of the key, so
       unchanged); keep sortOrder.
     - **creates** → `entityLink.create` with `{ sourceId, targetId: item.id, role:"loot",
       tier, value1, name: item.name, sortOrder: (max sortOrder among that source's loot
       links) + 1 }`.
  6. Mark `lootCurated = true` on the union of all touched source ids (old ∪ new), so a
     reseed won't clobber the community edit (additions stay, removals don't reappear).
  7. Mark the proposal applied (reviewer + timestamp).

### 4. `src/app/contribute/actions.ts`
- `submitItemLootEdit(formData)`: mirror of `submitLinksEdit`:
  - Require `type === "item"`; force `role = "loot"`; read slug + note.
  - `requireUser` + `assertUnderQuota`.
  - Build `old` from `getIncomingLootLinks(slug)` via `incomingLootToDrafts`.
  - `nameBySlug` from `listLootSources()`; `parseLinkRows` (reject `CUSTOM_TARGET` — sources
    must be real entities).
  - No-op guard via `snapshotsEqual`; else create `loot_sources_edit` proposal.
  - Redirect to `/contribute/edit-tabs?type=item&slug=...&proposed=1`.

### 5. `src/components/LinkEditForm.tsx`
Parameterize (backwards-compatible defaults):
- `action?: (fd: FormData) => void | Promise<void>` (default `submitLinksEdit`).
- `optionNoun?: string` (default `"item"`) — used in the select placeholder
  (`— select {optionNoun} —`).
- `allowCustom?: boolean` (default `true`) — when false, hide the `— custom / unlinked —`
  option (inverse loot has no free-text sources).
Inverse usage passes `submitItemLootEdit`, `"source"`, `allowCustom={false}`.

### 6. `src/app/contribute/edit-tabs/page.tsx`
- For `type === "item"`, add a **"Found in"** section above the recipe sections, rendering
  the parameterized `LinkEditForm`:
  `action=submitItemLootEdit`, `role="loot"`, `label="Found in"`,
  `fields=linkFields("loot")` (tier, value1), `rows=incoming drafts`,
  `items=listLootSources()`, `optionNoun="source"`, `allowCustom={false}`.
- Replace the "No editable tabs for this entity yet." copy path for items (they now have
  the Found-in editor). Update the footer note to reflect loot is now editable here.

### 7. Admin review
- `src/app/admin/proposals/[id]/page.tsx`: add a `loot_sources_edit` branch that renders
  the same diff table as `links_edit` (reuse `diffLinkRows(old, new)`), relabeling the
  "Target" column header to "Entity" (generic for source/target). Title:
  `Loot sources · item · <slug>`.
- `src/app/admin/proposals/actions.ts` (approve): add
  `else if (p.kind === "loot_sources_edit") await applyItemLootProposal(id, session.steamId)`.
- `src/app/admin/proposals/page.tsx` (list): add label
  `loot_sources_edit → "Loot sources · item · <slug>"`.

## Testing
- `diffLootSources`: creates/updates/deletes correctly; same source at two tiers stays two
  rows (source+tier keying); value1-only change → update not delete+create.
- `incomingLootToDrafts`: maps source slug → targetSlug, sorts by sortOrder.
- `getCratesContaining`: includes landmark sources after the widen (query-shape assertion
  or integration test consistent with existing query tests).
- Existing `link-proposal` / `proposal-schema` tests remain green.

## Out of scope / non-goals
- No new free-text/unlinked loot sources (sources must be existing entities).
- No change to the forward (container-side) loot editor.
- No visual redesign of the item Loot tab beyond including landmark rows. (Labeling
  landmark vs container in the display is a possible follow-up, not required here.)
- `amount` is not used for loot (loot fields are tier + value1).

## Risks
- **sortOrder collisions** within a source are cosmetic (tie-break falls back to insertion
  order in `groupLootByTier`); the append-on-create strategy keeps new rows last.
- **Inversion convention** (`targetSlug` = source slug for this kind) must be clearly
  documented at every read/write site to avoid confusion with `links_edit`.
