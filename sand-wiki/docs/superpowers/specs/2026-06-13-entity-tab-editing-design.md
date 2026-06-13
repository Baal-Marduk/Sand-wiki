# Entity Tab Editing — Design

**Date:** 2026-06-13
**Status:** Design / approved (no implementation yet)
**Branch context:** `master`
**Builds on:** [unified-entity-data-model-design](2026-06-12-unified-entity-data-model-design.md) (the live `Entity` + `EntityLink` + `Recipe` model)

## Problem

Contributors can propose edits to an entity's **scalar fields** (`edit` proposal) and to an
existing **recipe** (`recipe_edit` proposal), but they cannot touch the data behind most of the
**tabs** on an entity detail page. Today the tabs are populated three different ways and only one
of them has any contributor editing path:

| Tab(s) | Page | Backing data | Editable today? |
|---|---|---|---|
| Loot | environment | `EntityLink` outgoing rows, role `loot` | ❌ |
| Build Cost | trampler part | `EntityLink` outgoing rows, role `cost` | ❌ |
| Crafted by / Used in | item | `Recipe` (RecipeOutput / RecipeInput) | edit only (`recipe_edit`) |
| Loot (reverse) | item | reverse lookup `getCratesContaining()` | ❌ (edited on the crate) |
| Ammo / Used by | item | computed from caliber name-matching | n/a (not row data) |

The goal: let signed-in contributors **add / update / delete** the content of the tabs an entity
page renders, through a single "Edit tabs" surface, reviewed by an admin like every other proposal.

## Scope

**In scope**
- A generic `EntityLink` row editor for the outgoing **Loot** and **Build Cost** tabs (`links_edit`).
- Full recipe lifecycle for the **Crafted by / Used in** tabs: edit (existing `recipe_edit`),
  **add** (`recipe_new`), **delete** (`recipe_delete`).
- A unified **"Edit tabs"** hub page per entity that routes each tab to its editor.

**Explicitly out of scope (decoupled into their own specs)**
- **Landmark / environment crafting** — connecting `Recipe` to an environment entity (a new FK or
  a `workbench`-string match) and rendering a "Crafts here" tab on environment pages. This is a
  data-model + rendering change, independent of editing. This spec makes the hub *ready* for it:
  recipe sections are gated by a single `RECIPE_TAB_KINDS` set (today `{ "item" }`); landmark
  crafting later adds `"environment"` to that set and the editing comes along for free.
- **Converting Ammo / Used-by to stored rows** — they stay computed from caliber matching; they
  change only via the item's scalar fields (existing `edit` proposal).
- **Editing the item Loot reverse-view directly** — those rows live on the crate; you edit them on
  the crate's Loot tab (which *is* `links_edit`).

## Approach

Reuse the existing proposal machinery — a `Proposal` row with a `kind`, a `changes` JSON snapshot,
an admin diff view, and a transactional apply function. We add **new `kind`s only**, each following
the exact `{ old, new }`-snapshot shape that `recipe_edit` already established. No new storage model.

**Per-tab snapshot proposals** (one proposal edits one tab on one entity). Rejected alternatives:
- *Per-row proposals* (one proposal per add/edit/delete row) — floods the review queue, diverges
  from the snapshot pattern.
- *One mega "tab edit" proposal* bundling loot + cost + recipes — recipes are hyper-edges shared
  across entities and can't be cleanly snapshotted per-entity; mixing two storage models in one
  proposal is messy.

### New proposal kinds

| kind | tab(s) | `changes` shape | apply |
|---|---|---|---|
| `links_edit` | Loot, Build Cost | `{ role, old: LinkRowDraft[], new: LinkRowDraft[] }` | full-replace outgoing rows of that role |
| `recipe_new` | Crafted by / Used in | `{ new: RecipeSnapshot }` | create `Recipe` + lines with a generated slug |
| `recipe_delete` | Crafted by / Used in | `{ old: RecipeSnapshot }` | delete `Recipe` (cascades lines) |

(`recipe_edit` and its `{ old, new: RecipeSnapshot }` shape are unchanged.)

## Components

### 1. `EntityLink` editing — `links_edit`

New lib `src/lib/link-proposal.ts`, mirroring [`recipe-proposal.ts`](../../../src/lib/recipe-proposal.ts):

- **`LinkRowDraft`** = `{ targetSlug: string | null, name: string, amount: number | null, tier: string | null, value1: string | null }`.
  A row is either **linked** (chosen target → `targetSlug`, `name` derived) or **unlinked**
  (free-text `name`, `targetSlug = null`) — preserving the model's `targetId?` + `name` fallback so
  existing unresolved scrape rows stay editable instead of being silently dropped.
- **`LinkSnapshot`** = `{ role: string, rows: LinkRowDraft[] }`. `sortOrder` is positional (the row
  index), so `snapshotsEqual` is order-sensitive — matching the recipe-line convention.
- **`parseLinkRows`** (index-aligned form arrays → validated rows, blank rows dropped),
  **`snapshotsEqual`**, **`diffLinkRows`** — same helpers as recipes.

**Role config** extends `LINK_ROLES` in [`entity-links.ts`](../../../src/lib/entity-links.ts) to
declare each role's editable columns and validation:

| role | editor columns | validation |
|---|---|---|
| `cost` | target (item picker) · amount | amount = positive integer |
| `loot` | target (item picker) · tier (Normal / Rare / Very Rare) · value1 (free text, e.g. "10-20") | tier ∈ set or blank |

**Form** — new client component `src/components/LinkEditForm.tsx`, same skeleton as
`RecipeEditForm`'s `LineEditor` (a list of rows with Add / Remove) but with columns driven by the
role config. The target `<select>` lists known items (`kind = "item"`, matching how `seed.ts` scopes
loot/cost targets) plus an "— custom / unlinked —" sentinel for the free-text-name case. Submits to
a `submitLinksEdit` server action that builds a `links_edit` proposal storing `{ role, old, new }`;
snapshot-equal (no-op) submissions are rejected, exactly like `submitRecipeEdit`.

### 2. Recipe add / delete — `recipe_new`, `recipe_delete`

Both reuse the `RecipeSnapshot` shape and the `RecipeEditForm` UI.

- **`recipe_new`** — page `src/app/contribute/new-recipe/page.tsx`
  (`?type=&slug=&side=output|input`). Renders `RecipeEditForm` blank, **pre-filling the originating
  entity** on the relevant side (`output` for Crafted-by, `input` for Used-in). `submitNewRecipe`
  validates (≥ 1 output, reusing `parseRecipeLines`) and stores `{ new: RecipeSnapshot }`. Apply
  (`applyRecipeNew`) generates a **unique slug** from the primary output slug (`<outputSlug>`,
  falling back to `<outputSlug>-2`, `<outputSlug>-3`, … on collision) and creates the `Recipe` with
  nested input/output lines.
- **`recipe_delete`** — a small inline confirm form on the hub (recipe slug + optional note, no other
  fields). Stores `{ old: RecipeSnapshot }`. Apply (`applyRecipeDelete`) deletes the `Recipe`
  (cascades its lines).

Both render in the admin detail page using the existing `diffRecipeLines` table — `recipe_new`
shows every line as "added", `recipe_delete` shows every line as "removed".

### 3. The unified "Edit tabs" hub

**Entry point.** The entity detail header keeps its scalar `SuggestCorrectionLink`
("Suggest a correction") and gains a second button **"Edit tabs"** →
`/contribute/edit-tabs?type=<item|envEntity|tramplerPart>&slug=<slug>`. The per-recipe
`SuggestRecipeLink` buttons embedded in the Crafted-by / Used-in tables are **removed** — recipe
editing now routes through the hub.

**Hub page** `src/app/contribute/edit-tabs/page.tsx` (server component, `requireUser`). It loads the
entity and renders one section per *editable* tab the entity has, via a server helper
`editableTabsFor(entity)` that returns the tab editors to show. Sections by kind today:

- **item** → Crafted-by section + Used-in section + read-only Ammo/Used-by note.
- **environment** → Loot links editor (inline).
- **tramplerPart** → Build Cost links editor (inline).

```
Edit tabs — <Entity name>
An admin reviews every change before it goes live.

┌─ Build Cost ──────────────────────────────┐   (trampler)   → inline LinkEditForm, role=cost
│  [ row editor ]                  [Submit]   │
└─────────────────────────────────────────────┘

┌─ Loot ────────────────────────────────────┐   (environment)→ inline LinkEditForm, role=loot
│  [ row editor ]                  [Submit]   │
└─────────────────────────────────────────────┘

┌─ Crafted by ──────────────────────────────┐   (item)
│  • Recipe @ Workbench T2     [Edit] [Delete]│  → edit-recipe ; recipe_delete (inline confirm)
│  [+ Propose a new recipe that crafts this] │  → new-recipe?...&side=output
└─────────────────────────────────────────────┘

┌─ Used in ─────────────────────────────────┐   (item, side=input) — same shape
└─────────────────────────────────────────────┘

ℹ Ammo / Used-by are derived from this item's ammo & category fields —
  edit those via "Suggest a correction".            (read-only note, items only)
```

**Inline vs. linked editors.** The two `EntityLink` editors (loot, cost) render **inline** in the
hub (each its own `<form>` → `links_edit`) — they are new and have no other home. Recipe operations
**link out** to dedicated pages (`edit-recipe` exists; `new-recipe` is new), except delete, which is
a fieldless inline confirm form. This keeps the hub a thin launchpad.

**Decoupling switch.** `editableTabsFor` decides whether to show recipe sections via a single
`RECIPE_TAB_KINDS` set (today `{ "item" }`). Landmark crafting later adds `"environment"`; no other
hub change is needed.

### 4. Admin review & apply

New transactional functions in [`proposal-apply.ts`](../../../src/lib/proposal-apply.ts), each using
the "resolve-then-write" structure of `applyRecipeProposal`:

- `applyLinksProposal` — `deleteMany` outgoing `EntityLink` where `{ sourceId, role }`, then recreate
  from the `new` snapshot (resolve `targetSlug` → id; unlinked rows keep `targetId = null` + `name`;
  `sortOrder` = index).
- `applyRecipeNew` — generate unique slug, `recipe.create` with nested lines.
- `applyRecipeDelete` — `recipe.delete` (cascades lines).

[`approveProposal`](../../../src/app/admin/proposals/actions.ts) gains three `else if` branches
routing to the above. The admin **detail page**
([`[id]/page.tsx`](../../../src/app/admin/proposals/[id]/page.tsx)) gains three render branches:
`links_edit` → a `diffLinkRows` table (role-aware columns); `recipe_new` / `recipe_delete` → the
existing recipe diff tables. Each computes **stale** ("base changed") state by comparing the stored
`old` snapshot to live data with `snapshotsEqual`, reusing the established warning. Snapshot-equality
guards in the submit actions stop empty submissions — no new mechanism.

## Seed-clobber mitigation

[`seed.ts`](../../../prisma/seed.ts) does a global `recipeInput.deleteMany()` +
`recipeOutput.deleteMany()` then recreates lines only for recipes in the scrape. So an applied
recipe edit can already be overwritten by a reseed, and a contributor-**added** recipe (slug not in
the scrape) would lose its lines on the very next seed run.

- **Recipes → add a `curated` flag.** Add `Recipe.curated Boolean @default(false)`; set it `true` on
  any contributor-applied recipe (`recipe_new` and `recipe_edit` apply paths); make `seed.ts` skip
  line-recreation for curated recipes. Mirrors the existing `Entity.lootCurated` pattern. Without
  this, `recipe_new` is actively fragile.
- **Loot / cost → reuse `lootCurated`.** The `EntityLink` loot/cost path reuses the existing
  `Entity.lootCurated` flag (set on the source entity when a `links_edit` is applied; `seed.ts`
  already respects it for loot). Confirm the cost path honors the same flag during implementation.

## Testing

Unit tests mirroring the existing `recipe-proposal` tests, targeting the pure-function libs:

- `link-proposal.test.ts` — `parseLinkRows` validation, `snapshotsEqual` order-sensitivity,
  `diffLinkRows` add/remove/change/same classification.
- Recipe slug-uniqueness generator — collision fallback (`<slug>`, `<slug>-2`, …).

Forms and pages stay thin; the libs and apply functions hold the logic worth testing.

## Build order

One spec, four shippable slices:

1. **`links_edit` end-to-end** (lib → `LinkEditForm` → `submitLinksEdit` → admin diff →
   `applyLinksProposal`) — delivers Loot + Build Cost editing.
2. **Hub page + entry point**, wired to slice 1 and the existing `recipe_edit`.
3. **`recipe_new` + `recipe_delete`** (+ `Recipe.curated` flag & `seed.ts` skip).
4. **Cleanup** — remove per-recipe `SuggestRecipeLink`s; add the read-only Ammo/Used-by note.

## Open questions for implementation planning

- Recipe slug generation: confirm the `<outputSlug>-N` scheme won't collide with scraper-owned slugs
  in a confusing way (e.g. reserve a contributor prefix?). Low risk; decide during slice 3.
- Should `recipe_delete` be blocked when the recipe is the *only* one producing an item (so the item
  doesn't lose its sole Crafted-by entry silently)? Rendering/UX only.
- Confirm the `cost` apply path honors `lootCurated` (or whether cost needs its own flag).
</content>
</invoke>
