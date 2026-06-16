# Enriched-Select Normalization — Design

**Date:** 2026-06-16
**Status:** Proposed (extends the 2026-06-16 admin link-editor redesign)

## Problem

The search-to-add enriched picker (icons + rarity color) currently lives only inside
`LinkPicker` (loot / cost / keys / item "Found in"). Other editable tabs and forms that
pick an **item** still use plain `<select>` dropdowns with no search, icons, or rarity color:

- **Recipe inputs/outputs** (`RecipeEditForm` → `LineEditor`) — powers **Crafted by**,
  **Used in**, and **Crafted here** (all route through `new-recipe` / `edit-recipe`).

Two short enum selects (**rarity**, **category**) also lack the visual cues that would make
them quick to scan.

## Goals (decided with the user)

1. **Items everywhere → one enriched picker.** Extract the enriched search UI out of
   `LinkPicker` into a shared primitive and reuse it for recipe lines. Recipe lines adopt the
   **search-to-add** interaction (same as `LinkPicker`).
2. **Style rarity + category selects only.** Rarity gets a color swatch + colored label;
   category gets its `CategoryIcon`. Other enums (kind, workbench, tiers, target type) stay
   plain — they are not item searches.
3. **Codify it in `instructions.md`** so future selects follow the rule.

Non-goals: changing any server action / proposal / schema; enriching kind/workbench/tier/
targetType selects; drag-reordering; touching `parseRecipeLines` / `parseLinkRows`.

## Key facts (verified)

- `LinkOption = { slug, name, rarity, icon, category }` and pure helpers
  (`filterLinkOptions`, `hasExactOptionMatch`) already exist in `src/lib/link-picker.ts`.
- Recipe lines submit index-aligned `inputSlug`/`outputSlug` + `inputAmount`/`outputAmount`
  arrays; `parseRecipeLines` resolves names from the DB by slug and **errors on a duplicate
  slug**. `RecipeLineDraft = { slug, name, amount }`.
- `RecipeEditForm` is used by `new-recipe/page.tsx` (seeds the originating item as a line)
  and `edit-recipe/page.tsx`. Both fetch `items` as `{ slug, name }` only.
- `EnumField` (`src/components/EnumField.tsx`) is a generic native `<select>` + "Other…"
  free-text used by `EditProposalForm` (rarity/category/workbenchTier/researchTier) and
  `RecipeEditForm` (workbench). Rarity and category are **closed** sets (no real "Other").
- `CategoryIcon` takes a category **slug** (which equals the category select's value);
  `rarityColor(name)` takes the rarity **name** (which equals the rarity select's value).
- `instructions.md` (line ~268) currently says "Use native form elements … Closed taxonomy
  sets are selects" — this rule needs an explicit carve-out for the new patterns.

## Design

### 1. `EntitySearchBox` — shared enriched search primitive (new)

Extract the search input + results dropdown from `LinkPicker` into
`src/components/EntitySearchBox.tsx`:

```ts
EntitySearchBox({
  items: LinkOption[];
  excludeSlugs: string[];           // already-selected slugs, hidden from results
  optionNoun?: string;              // default "item" → placeholder "Add an item…"
  allowCustom?: boolean;            // default false
  onSelect: (o: LinkOption) => void;
  onSelectCustom?: (name: string) => void;  // required-when-used if allowCustom
})
```

Owns its own `query` + highlight state, runs `filterLinkOptions` / `hasExactOptionMatch`,
renders results with `ItemIcon` (size sm) + rarity-colored name, the dashed "Add … as
custom / unlinked" row when `allowCustom`, keyboard nav (↑/↓/Enter/Esc), and `onMouseDown`
selection. Clears its query after a pick. No FormData — purely calls back to the parent.

### 2. `LinkPicker` refactor (behavior-preserving)

`LinkPicker` keeps its selected-row rendering and the FormData contract (`linkSlug` /
`linkName` / `linkAmount` / `linkTier` / `linkValue1`). Its inline search block is replaced
by `<EntitySearchBox items={items} excludeSlugs={selectedSlugs} allowCustom={allowCustom}
optionNoun={optionNoun} onSelect={addOption} onSelectCustom={addCustom} />`. No user-visible
change; the existing `link-picker.test.ts` (pure helpers) stays the test of record.

### 3. `RecipeEditForm` → search-to-add

- Change its local `ItemOption` type to `LinkOption` (import from `@/lib/link-picker`).
- `LineEditor` becomes search-to-add: render existing lines as cards — `ItemIcon` (sm, from
  the matching option) + rarity-colored name + the `${side}Amount` number input + remove ✕,
  plus a hidden `<input name="${side}Slug" value={line.slug}>` per row. Below them, an
  `<EntitySearchBox items={items} excludeSlugs={selectedSlugs} allowCustom={false}
  onSelect={addLine} />`. Drop the leading blank-row default (`blankLine`) — start from the
  snapshot's lines (new-recipe still seeds the originating item via the snapshot).
- Emission is unchanged (`${side}Slug` + `${side}Amount`, index-aligned) → `parseRecipeLines`
  untouched. `allowCustom={false}` because recipe lines must reference real items.
- Widen the `items` query in `new-recipe/page.tsx` and `edit-recipe/page.tsx` to
  `select: { slug, name, rarity, icon, category }`.

### 4. Styled enum selects — `StyledSelect` (new) + rarity/category usage

`src/components/StyledSelect.tsx` — a small accessible custom listbox for **closed** option
sets:

```ts
StyledSelect({
  name: string;
  options: { value: string; label: string }[];
  value?: string;                       // controlled
  defaultValue?: string;                // uncontrolled
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  renderLeading?: (value: string) => React.ReactNode;  // swatch / icon
})
```

Renders a button (leading visual + current label) and an absolute listbox of options (each
with its leading visual), emitting a hidden `<input name>` with the selected value. Handles
click-outside close, Esc, ↑/↓/Enter, and `role="listbox"`/`role="option"`/`aria-selected`.

- **Rarity:** `renderLeading={(v) => <swatch style={{background: rarityColor(v)}}/>}`, label
  text tinted with `rarityColor`. Used in `CreateEntityForm` (replaces the rarity `<select>`)
  and `EditProposalForm` (when `field === "rarity"`).
- **Category:** `renderLeading={(v) => <CategoryIcon slug={v} />}`. Used in `CreateEntityForm`
  (replaces the category `<select>`, kept controlled so a Kind change clears it) and
  `EditProposalForm` (when `field === "category"`).

`EnumField` is unchanged and still serves workbench / workbenchTier / researchTier (the
wiki-sourced sets that legitimately need "Other…"). `EditProposalForm` branches: rarity →
rarity `StyledSelect`, category → category `StyledSelect`, else `EnumField`.

### 5. `instructions.md`

Update the form-conventions section: entity/item selection MUST use the enriched picker
(`EntitySearchBox`, via `LinkPicker` / `RecipeEditForm`) — never a plain `<select>` of items.
Rarity and category selects use `StyledSelect` (rarity color swatch / category icon). Other
closed or wiki-sourced enums (kind, workbench, tiers, target type) stay native
`<select>` / `EnumField`.

## File plan

- **New:** `src/components/EntitySearchBox.tsx`, `src/components/StyledSelect.tsx`.
- **Modify:** `src/components/LinkPicker.tsx` (use EntitySearchBox), `src/components/RecipeEditForm.tsx` (search-to-add + LinkOption), `src/app/contribute/new-recipe/page.tsx` + `src/app/contribute/edit-recipe/page.tsx` (widen items select), `src/components/EditProposalForm.tsx` (rarity/category branch), `src/components/CreateEntityForm.tsx` (rarity/category → StyledSelect), `instructions.md`.
- **Unchanged:** all server actions, `parseRecipeLines`, `parseLinkRows`, `EnumField`, schema.

## Testing

- Existing vitest suites stay green (no parser/contract changes).
- `npx tsc --noEmit` clean (except the known pre-existing `layout.test.ts` crownsIcon error);
  `npm run lint` clean; `npm run build` succeeds.
- Manual (admin): edit a recipe's inputs/outputs via search-to-add (Crafted by / Used in /
  Crafted here); confirm a `recipe_edit` / new-recipe proposal with the right lines, duplicate
  add prevented, amount edits work. Confirm rarity/category styled selects submit the right
  value in both the create form and the scalar edit form.
