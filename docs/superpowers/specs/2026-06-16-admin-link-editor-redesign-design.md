# Admin Link-Editor Redesign — Search-to-Add Picker

**Date:** 2026-06-16
**Status:** Approved design, ready for planning

## Problem

Admins edit an entity's relation "tabs" (loot, build cost, key requires/rewards, item
"Found in") through `LinkEditForm`. Today each row is a native `<select>` listing *every*
item with no search, no icons, and no rarity color, plus bare amount/tier/range inputs.
Picking an item from hundreds of options is slow, and blank rows clutter the form.

The user wants a simpler editor: a search bar in the picker, entity icons, rarity color,
and panel grouping.

## Goal

Replace the editing UI inside `LinkEditForm` with a **search-to-add** pattern while keeping
the exact same submission contract, so no server/schema/proposal code changes.

## Constraints & Key Facts

- The server action (`submitLinksEdit`, `submitItemLootEdit` in
  `src/app/contribute/actions.ts`) and `parseLinkRows` (`src/lib/link-proposal.ts`) read
  **index-aligned FormData arrays** via `getAll`: `linkSlug`, `linkName`, `linkAmount`,
  `linkTier`, `linkValue1`. The new component MUST emit these same field names in row order.
  This keeps the proposal pipeline and `link-proposal.test.ts` untouched.
- Roles and their fields come from `LINK_ROLES` / `linkFields(role)` in
  `src/lib/entity-links.ts`: `loot` → `[tier, value1]`, `cost` → `[amount]`,
  `requires-key` / `rewards-key` → `[]`.
- `allowCustom` is already a prop: true for loot/cost, false for key roles (catalog-only).
- Rarity color/gradient/sort live in `src/lib/rarity.ts` (`rarityColor`, `rarityGradient`,
  `byRarityThenName`). Icons render via `src/components/ItemIcon.tsx` (supports `size="sm"`,
  `rarity`, `icon`, `categorySlug`).
- Stack: Next.js 16 / React, radix-ui + shadcn-style `ui/` components present, but **no
  `cmdk`/combobox/popover primitive installed**. Dark-only theme. Decision: build a
  lightweight in-house combobox — no new dependency.

## Design

### Component: `LinkPicker` (new client component)

`LinkEditForm` keeps its current public props (`type`, `slug`, `role`, `label`, `fields`,
`rows`, `items`, `action`, `optionNoun`, `allowCustom`) and the surrounding `DirtyForm` +
note textarea + submit button. Its row-editing body is replaced by `LinkPicker` (either
inlined into `LinkEditForm` or extracted as `src/components/LinkPicker.tsx` and wrapped).

**Search input (top of each panel):**
- Text input, placeholder `Add a {optionNoun}…`.
- Filters `items` client-side by case-insensitive substring on `name`.
- Results sorted with `byRarityThenName`.
- Each result row: `<ItemIcon size="sm" .../>` + name colored via `rarityColor(rarity)`.
- Keyboard nav: ↑/↓ move highlight, Enter adds the highlighted result, Esc clears the query.
  Click also adds.
- Already-selected items are excluded from (or visually disabled in) the results so they
  can't be added twice.
- **Custom fallback:** when `allowCustom` and the trimmed query has no exact name match, a
  final dashed row reads `+ Add "<query>" as custom / unlinked`. Selecting it adds an
  unlinked row (`targetSlug: null`, `name: query`). Suppressed when `allowCustom` is false.

**Selected list (below search):**
- One compact card per selected row: `ItemIcon` + rarity-colored name + role-driven inline
  fields + remove ✕.
- Inline fields by role (driven by `fields` prop / `linkFields`):
  - `amount` → number input (min 1), as today.
  - `tier` → select with `Normal | Rare | Very Rare`.
  - `value1` → text input, placeholder `e.g. 1-2`.
  - keys → no extra fields.
- A small column-label legend (name / tier / range, etc.) shown when fields exist.
- Order = array order (this is the submitted `sortOrder`). **Drag-reordering is out of
  scope** for this change.

**Emitted FormData (unchanged contract):**
For each selected row, in order, render hidden/real inputs:
- `linkSlug` = slug, or `CUSTOM_TARGET` sentinel for custom rows.
- `linkName` = custom name (only meaningful for custom rows; emitted always to keep indices
  aligned, matching current behavior).
- `linkAmount`, `linkTier`, `linkValue1` = field values (emitted when the role uses them;
  emit empty otherwise to keep arrays index-aligned — mirror current component).

### Data changes

The picker needs rarity/icon/category to render. The Entity columns are `rarity` (String?),
`icon` (String?), and `category` (String); `ItemIcon`'s `categorySlug` prop is fed directly
from `category` (as done in `environment/[slug]/page.tsx` and `items/[slug]/page.tsx`).
Widen the `items` option type from `{ slug, name }` to
`{ slug, name, rarity, icon, category }` and widen the two sources:

- `src/app/contribute/edit-tabs/page.tsx`: the `prisma.entity.findMany({ kind: "item" })`
  select adds `rarity`, `icon`, `category`.
- `listLootSources()` in `src/lib/queries.ts` (used for the item "Found in" panel): add the
  same fields to its select.

The picker passes `categorySlug={item.category}` into `ItemIcon`.

### Panels / layout

The per-role `<section>` cards in `edit-tabs/page.tsx` already provide panel grouping. Keep
that structure; only the panel body changes. No broader layout restructure.

## Out of Scope

- Drag/reorder of selected rows.
- Adding `cmdk`/popover dependencies.
- Any server action, schema, proposal-apply, or proposal-review changes.
- Recipe tabs (Crafted by / Used in) and the admin entity create/image/disable flows.

## Testing

- `src/lib/link-proposal.test.ts` must stay green (parsing/contract unchanged).
- Manual verification: edit a tramplerPart `cost`, an envEntity `loot` (tier + range) and
  `requires-key` panel, and an item `Found in` panel; confirm each produces a `links_edit`
  proposal whose `changes.new` matches what was entered, including a custom/unlinked loot
  entry. Confirm key panels show no custom option.
- Visual: icons + rarity colors render in both search results and selected cards.
