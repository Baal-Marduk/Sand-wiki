# Suggest-Correction: Enum Selects, Recipe Editing & Cancel

**Date:** 2026-06-12
**Status:** Approved — ready for implementation plan

## Problem

The community "suggest a correction" flow ([steam-community-contributions](2026-06-11-steam-community-contributions-design.md)) renders every editable field as a free-text/number input, only covers scalar fields on a single row, and has no way to back out of the form. Three gaps:

1. Some fields are really **enums** (rarity, tiers, category) but are typed by hand — error-prone and inconsistent.
2. **Recipes** (relational: a `Recipe` with many `RecipeInput`/`RecipeOutput`, each an item + amount) cannot be corrected at all, because the proposal pipeline assumes scalar fields on one row.
3. There is **no Cancel button** on the form.

## Decisions (from brainstorming)

- Recipe corrections are **fully structured with auto-apply** (one-click approve rewrites the relation rows), and cover **meta + lines** (workbench/tier/craft-time *and* add/remove/modify input & output lines).
- Enum select options are **derived from existing DB values** (Prisma `distinct`), with an **"Other…"** escape hatch revealing a free-text input so a genuinely new value is never blocked.
- Fields that become selects: **rarity**, **workbench tier** & **research tier**, **category**.
- Native `<select>` item picker for recipe lines in v1 (typeahead is a later upgrade).
- Cancel is a plain link back to the entity page — no unsaved-changes guard.

## Current architecture (for reference)

- `SuggestCorrectionLink` → `/contribute/edit?type&slug`
- `EditProposalForm` renders one input per `EditableField` (`string | text | int`)
- `submitEdit` (actions.ts) coerces + diffs → `Proposal{ kind:"edit", changes:{field:{old,new}} }`
- Admin `/admin/proposals/[id]` shows a table diff → `approveProposal` → `applyProposal` writes whitelisted scalar columns on one row (`item` | `envEntity` | `tramplerPart`).
- `Recipe` has a unique `slug`; recipes surface on item pages via `CraftTable`/`UsedInTable`. `RecipeInput`/`RecipeOutput` have **no sortOrder** column (id, recipeId, itemId, amount only).

---

## Section 1 — Cancel button + shared route helper

`submitEdit` hardcodes the type→route map for its redirect (`envEntity`→`environment`, `item`→`items`, else `tramplers`). Extract it once:

```ts
// proposal-schema.ts (or proposal-routes.ts)
export function entityHref(type: string, slug: string): string {
  const seg = type === "envEntity" ? "environment" : type === "item" ? "items" : "tramplers";
  return `/${seg}/${slug}`;
}
```

Reused by: the existing `submitEdit` redirect, the new recipe redirect, and a **Cancel** `<Link className="btn btn-ghost">` on both forms pointing at `entityHref(type, slug)`.

---

## Section 2 — Enum selects (DB-derived + "Other…")

### Schema (`proposal-schema.ts`)

- `FieldType` gains `"enum"`.
- `EditableField` gains optional `enumValueType: "string" | "int"` (so tier enums coerce to int).
- Mark as enum: `rarity` (item), `workbenchTier` (item, int).
- **Add to the whitelist** (not currently editable):
  - `category` enum (string) on **item**, **envEntity**, **tramplerPart**.
  - `researchTier` enum (int) on **tramplerPart**.
- `coerceValue` gains an enum branch that coerces by `enumValueType` (`int` → integer-or-null, else trimmed string / null).

### Options source

```ts
// proposal-entity.ts (or a new proposal-options.ts)
export async function getFieldOptions(type: string, field: string): Promise<string[]>
```
Runs `prisma[model].findMany({ where:{[field]:{not:null}}, distinct:[field], select:{[field]:true} })`, maps to strings, sorts (numeric sort for int enums). The edit page builds an `options: Record<field, string[]>` for every enum field of the target type and passes it to the form.

### Rendering

New `"use client"` component `EnumField`:
- `<select>` with the current value preselected, the derived options, and a trailing `<option value="__other__">Other…</option>`.
- Selecting "Other…" reveals a text input named `<field>__custom`.
- The field name posts the select value; on submit the **server** uses the custom text when the select value is the `__other__` sentinel, else the select value.

`EditProposalForm` switches on `f.type === "enum"` to render `EnumField`, otherwise unchanged. `submitEdit` resolves the `__other__` sentinel before `coerceValue`.

---

## Section 3 — Recipe editing (structured + auto-apply)

### Entry point

`SuggestRecipeLink({ slug })` rendered per recipe in `CraftTable` and `UsedInTable` → `/contribute/edit-recipe?slug=<recipeSlug>`. (Both directions point at the same recipe; editing is the same regardless of which item page you came from.)

### Form (`/contribute/edit-recipe`)

`RecipeEditForm` (client component):
- **Meta**: workbench (enum-select, DB-derived from `Recipe.workbench` + "Other…"), tier (number), craftTimeSeconds (number).
- **Inputs** and **Outputs**: editable line lists. Each line = item `<select>` (value=slug, label=name) + amount (number) + remove button. "Add line" button per list.
- The page loads the full item list `[{slug,name}]` once (sorted by name) and the current recipe, requires a logged-in user.

### Storage

New `kind: "recipe_edit"`, `targetType: "recipe"`, `targetSlug: <recipeSlug>`. `changes` holds:

```jsonc
{
  "old": { "workbench": "...", "tier": 1, "craftTimeSeconds": 5,
           "inputs":  [{ "slug": "iron", "name": "Iron", "amount": 2 }],
           "outputs": [{ "slug": "bolt", "name": "Bolt", "amount": 1 }] },
  "new": { /* same shape */ }
}
```
Slugs are stored (stable across renames); names stored for admin diff readability without extra lookups.

### Submit (`submitRecipeEdit`)

1. Resolve recipe by slug; build the `old` snapshot.
2. Parse submitted lines; **validate** every slug exists in `Item`, every amount is a positive integer; coerce meta. Reject on any invalid slug/amount.
3. Deep-compare `old` vs `new`; reject "No changes to submit." if identical.
4. Enforce the existing `assertUnderQuota(MAX_PENDING_PER_USER)`.
5. Create the proposal; redirect to the recipe's **primary output** item page with `?proposed=1` (fallback `/items` if no resolvable output).

### Admin review (`/admin/proposals/[id]`)

Add a `kind === "recipe_edit"` branch: meta diff (old vs new) plus input/output before-after lists marking **added / removed / amount-changed** lines. Reuse the "base changed" stale warning by comparing the stored `old` snapshot against the live recipe; warn (do not block), matching scalar-edit behavior.

### Apply (`applyRecipeProposal`, transactional)

In `proposal-apply.ts`, called from `approveProposal` when `kind === "recipe_edit"`:
1. Load + validate the proposal is a pending `recipe_edit`.
2. Resolve every `new` input/output slug → itemId; **throw** if any item is missing.
3. Update `Recipe` meta (workbench, tier, craftTimeSeconds).
4. **Full-replace** lines: `recipeInput.deleteMany({where:{recipeId}})` + `createMany`, same for outputs (safe because these tables have no sortOrder).
5. Mark the proposal `applied` with reviewer + timestamp.

Apply uses `new` only; concurrent base drift is overwritten (the admin was warned via the stale check).

---

## Testing

Follow existing vitest (`*.test.ts`) + Playwright (`tests/e2e`) patterns:
- Unit: `getFieldOptions` (distinct, sorted, non-null); enum `coerceValue` (int vs string, `__other__` resolution); recipe submit validation (unknown slug rejected, non-positive amount rejected, no-change rejected); `applyRecipeProposal` (line replacement, missing-item throw, meta update).
- E2e (optional, matching existing proposal specs): enum select renders options + "Other…"; recipe edit form add/remove line; cancel link returns to entity page.

## Out of scope (YAGNI)

- Typeahead item picker (native `<select>` for v1).
- Editing loot tables / trampler cost lines (same relational pattern, deferred).
- Adding `statType` / loot-tier enums to the whitelist.
- Unsaved-changes guard on Cancel.
