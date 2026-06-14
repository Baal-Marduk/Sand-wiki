# Location Craft Tab + Backlinks (seed-safe)

**Date:** 2026-06-14
**Status:** Approved — ready for implementation plan
**App:** `sand-wiki/` (Next.js 16 + Prisma 6, Neon Postgres)

## Summary

Landmark/location pages (entities of `kind: environment`) gain a **Craft tab** that lists
the production recipes tied to that location (inputs → outputs). The tab is **editable**
through the site's existing proposal flow. Item pages get a **backlink**: an item produced
at a location (e.g. Rocket Ammo) links back to that location's page (e.g. Sprengstofffabrik).

A hard constraint drives the data-safety parts of this design: **a re-seed must never erase
hand-updated data in the database.** The current seed prunes any `environment` entity not in
its source JSON, which would silently delete the manually-added `sprengstofffabrik` location.

## Motivation / context

- Recipe data for four locations was extracted from an in-game screenshot and reconciled
  against existing entities (see "Source data" below).
- The user manually added the `sprengstofffabrik` location directly in the DB; it is not in
  any seed source file and is therefore currently at risk of deletion on the next `npm run seed`.

## Decisions (confirmed with user)

1. **Edit flow:** reuse the existing proposal → admin-apply pipeline, extended to carry a location.
2. **Multi-location modeling:** one `Recipe` row per location (duplication), via a `locationId`
   FK on `Recipe`. No many-to-many join table.
3. **Initial data load:** an idempotent curated-insert script (recipes marked `curated: true`),
   plus hardening the seed so it never prunes the manual location.

## Current-state facts (from code exploration)

- **Tabs:** `src/components/EntityDetail.tsx` renders a shared shell; `ItemTabs.tsx` renders a
  `Tab[]` (`{ id, label, content }`). Item pages and environment pages each build their own
  `tabs` array. Environment pages currently render one tab per loot tier via `LootTable`.
- **Recipe display:** `src/components/CraftTable.tsx` + `recipe-cells.tsx` render a `RecipeCard`
  (`src/lib/recipes.ts`): `{ slug, workbench, tier, craftTimeSeconds, inputs[], outputs[] }`,
  each row `{ slug, name, icon, rarity, amount }`. Icons resolved via `ItemIconLink`.
- **Queries:** `src/lib/queries.ts` — `getItemBySlug` loads `producedBy`/`usedIn` recipes;
  `getEnvEntityBySlug` loads outgoing `loot` links.
- **Edit flow:** forms (`RecipeEditForm`, `EditProposalForm`, `LinkEditForm`, `DirtyForm`) submit
  to server actions in `src/app/contribute/actions.ts` (`submitNewRecipe`, `submitRecipeEdit`,
  `submitDeleteRecipe`, …) which write `Proposal` rows. An admin applies them via
  `src/lib/proposal-apply.ts` (`applyRecipeNew` / `applyRecipeProposal` / `applyRecipeDelete`),
  which already set `curated: true` on affected recipes.
- **Schema:** `Recipe { id, slug @unique, workbench?, tier?, craftTimeSeconds?, curated, inputs, outputs }`.
  `RecipeInput`/`RecipeOutput { recipeId, itemId, amount }`. **No location FK exists.**
  `EntityLink` is the Entity→Entity join used for `loot`/`cost`/`tech-*` roles.
- **Seed safety (`prisma/seed.ts`):**
  - Curated recipes (`curated: true`) are skipped entirely on re-seed (preserved).
  - Non-curated recipe input/output rows are `deleteMany`'d then recreated.
  - Prune queries delete entities not in source per kind, e.g. line 218:
    `prisma.entity.deleteMany({ where: { kind: "environment", slug: { notIn: envSlugs } } })`.
    This is what endangers `sprengstofffabrik`.

## Design

### 1. Data model (additive migration — non-destructive on live Neon)

- `Recipe.locationId String?` — nullable FK to `Entity`. Inverse relation
  `Entity.craftedAtRecipes Recipe[]`. (Relation name must not clash with existing
  `producedBy`/`usedIn`.)
- `Entity.curated Boolean @default(false)` — mirrors `Recipe.curated`; marks any hand-added
  or admin-applied entity as protected from pruning.
- Both changes are additive (new nullable column + new boolean with default), safe to apply to
  the live database without data loss.

### 2. Seed hardening (core data-safety fix)

- Every prune `deleteMany({ … notIn … })` in `seed.ts` (items, recipes, env, trampler-parts,
  tech-nodes — lines ~130/172/218/268/313) gains a **`curated: false`** condition, so the seed
  **never deletes curated entities or recipes**.
- The post-seed count assertions that compare DB counts to snapshot length must be updated to
  scope to `curated: false` so curated additions don't trip the mismatch check.

### 3. Initial data load

- `prisma/location-recipes.json` — reviewable source holding the 9 recipes (see "Source data").
- `prisma/load-location-recipes.ts` — idempotent, re-runnable script that:
  - Ensures the four locations exist and sets `curated: true` on them
    (`kaiserplatz`, `rauchwolke`, `strudel`, `sprengstofffabrik`).
  - Upserts the 9 recipes by generated slug (pattern `loc-<location>-<output-slug>`), each with
    `locationId`, `curated: true`, and inputs/outputs resolved from the JSON by item slug.
  - Fails loudly if a referenced item or location slug does not resolve.
- Added as an npm script (e.g. `db:load-location-recipes`).

### 4. Location Craft tab (read)

- Extend `getEnvEntityBySlug` to also load `craftedAtRecipes` (with inputs/outputs/items),
  mapped to `RecipeCard[]` via the existing `toRecipeCard` path.
- In `environment/[slug]/page.tsx`, when the location has ≥1 recipe, prepend (or append) a
  **"Craft"** tab rendering the existing `CraftTable` component. No new display component.

### 5. Backlinks on item pages

- `RecipeCard` gains an optional `location: { slug, name } | null`, populated from
  `Recipe.location`.
- The existing **"Crafted by"** tab on item pages shows the producing location as a link per
  recipe (e.g. Rocket Ammo → "Sprengstofffabrik"). Reuses the `producedBy` query path; no new
  query. Display: a location link/badge within the recipe card header (exact placement decided
  in the plan, but inside the existing tab — not a separate "Produced at" section).

### 6. Editing (reuse proposal flow)

- The location Craft tab gets add / edit / delete affordances using the existing
  `RecipeEditForm`, with a hidden `locationSlug` field.
- `submitNewRecipe` / `submitRecipeEdit` / `submitDeleteRecipe` extended to accept and persist
  `locationSlug` in the proposal payload.
- `proposal-apply.ts` (`applyRecipeNew` / `applyRecipeProposal`) sets `locationId` (resolved
  from `locationSlug`) and `curated: true` on apply — consistent with current curated behavior.
- New location-recipe slugs are generated server-side to stay unique.

### 7. `instructions.md`

Add a rule to the Data pipeline section:

> **Re-seed safety:** the seed never prunes rows marked `curated: true`. All hand-added or
> admin-applied entities and recipes must be marked `curated: true`, or a re-seed will delete
> them. Child rows (recipe input/output lines, loot/cost/craft links) are always deleted and
> recreated for non-curated parents — never hand-edit those directly; edit via the proposal flow.

## Non-goals (YAGNI)

- No many-to-many location↔recipe join table (duplication chosen instead).
- No new "production vs workbench" concept — these reuse the `Recipe` model.
- No direct-to-DB editing path — editing stays on the proposal/admin-apply flow.
- No redesign of the existing loot tabs or CraftTable.

## Source data (the 9 confirmed recipes)

All item/location identifiers are confirmed slugs present in `data.json` / `gear.json`.
Resource display names: `resource-metal-t1` = Mechanical Parts, `resource-metal-t2` =
Pneumatic Parts, `resource-metal-t3` = Computing Module. "Raw Aurogen Crystal" has the
slug `crystal-handles`; "Energy Rod" = `energy-bar`.

| # | Location (slug) | Inputs (slug ×amount) | Outputs (slug ×amount) |
|---|---|---|---|
| 1 | kaiserplatz | crystal-handles ×1 | energy-bar ×10 |
| 2 | kaiserplatz | resource-alloy-steel ×40, resource-metal-t2 ×300 | game-packed-auto-turret-t2-container ×1 |
| 3 | rauchwolke | black-box ×1 | resource-metal-t3 ×10 |
| 4 | rauchwolke | resource-coral-piece ×1 | resource-coral-dust ×10, resource-metal-t1 ×2 |
| 5 | sprengstofffabrik | crystal-handles ×1 | energy-bar ×10 |
| 6 | sprengstofffabrik | resource-alloy-steel ×40, resource-metal-t2 ×300 | game-packed-turret-t2-container ×1 |
| 7 | sprengstofffabrik | resource-fabric ×10, resource-gunpowder ×10 | rocket-launcher-ammo-armor-piercing ×3 |
| 8 | sprengstofffabrik | resource-fabric ×10, resource-gunpowder ×10 | grenade-contact ×5 |
| 9 | strudel | resource-alloy-steel ×40, resource-metal-t2 ×300 | game-packed-shotgun-turret-t2-container ×1 |

## Risks / verification

- **Migration on live DB:** additive only; confirm with `prisma migrate` against Neon dev first.
- **Prune-guard correctness:** after adding `curated: false` to prune queries, a re-seed must
  leave the four curated locations and 9 curated recipes intact — verify by count before/after.
- **Backlink resolution:** confirm Rocket Ammo's item page links to Sprengstofffabrik after load.
