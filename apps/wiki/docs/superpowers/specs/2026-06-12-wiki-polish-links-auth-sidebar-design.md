# Wiki Polish: Ordered Enum Selects, Auth-Gated Suggest Links, Sticky Sidebar & In-Description Item Links

**Date:** 2026-06-12
**Status:** Approved — ready for implementation plan

## Problem

Four independent UX gaps in the wiki:

1. **Suggest-correction links show to logged-out users.** The entry points (`SuggestCorrectionLink`, `SuggestRecipeLink`) render for everyone, but `/contribute/*` requires login — so a logged-out user clicks through to a login redirect. Hide the entry points unless signed in.
2. **The "Jump to" sidebar doesn't stay visible.** `CategoryQuickNav` is `lg:sticky` but scrolls away almost immediately.
3. **Rarity/category selects in the correction form are mis-ordered and show raw slugs.** Options come back alphabetically (e.g. `Common, Experimental, Noteworthy, …`) and categories show slugs (`loot-containers`) instead of labels.
4. **Descriptions can't link to other items.** They render as plain `<p>` text; there's no way to reference another item inline.

## Decisions (from brainstorming)

- Sidebar: **fix the sticky** (keep it in the grid column) — not `position:fixed`.
- Item-link syntax: **`[[slug]]`** with optional **`[[slug|label]]`**.
- Item-link rendering: **inline text link** (app `link` style), **tinted by the item's rarity color**.
- Selects: **reorder + human labels** via native `<select>` (no custom color-swatch dropdown).
- Category selects offer the **full canonical category set** for the entity type (not just DB-present values).

## Relevant current state

- Auth: `src/lib/auth.ts` exposes non-throwing `getSession(): Promise<SessionPayload | null>`.
- Rarity: `src/lib/rarity.ts` exports `KNOWN_RARITY_NAMES` (tier order), `rarityColor(name)`, `rarityTier(name)`.
- Taxonomy: `src/lib/taxonomy.ts` exports `ITEM_CATEGORY_SLUGS`, `TRAMPLER_CATEGORY_SLUGS`, `categoryLabel(slug)`; env category slugs are `loot-containers`, `landmarks`, `game-modes`, `npcs` (in `SECTIONS`).
- Correction form: `EnumField` (`options: string[]`) is fed by `getFieldOptions` (alphabetical/numeric sort) in `src/lib/proposal-entity.ts`, wired in `src/app/contribute/edit/page.tsx`.
- Descriptions: `EntityDetail` (`src/components/EntityDetail.tsx`) does `description.split(/\n+/).map(p => <p>)`. No markdown anywhere.
- Item links elsewhere: `/items/${slug}` href; `ItemIconLink`/`ItemLinkList`. No name→slug or batch slug resolver exists yet.

---

## Section 1 — Hide suggest links when logged out

Thread a `canSuggest: boolean` from the server pages (which can `await getSession()`):

- `EntityDetail` gains `canSuggest?: boolean`; renders `SuggestCorrectionLink` only when true. The `suggest` prop stays (used to build the href when shown).
- The three detail pages (`src/app/items/[slug]/page.tsx`, `environment/[slug]/page.tsx`, `tramplers/[slug]/page.tsx`) compute `const canSuggest = !!(await getSession());` and pass it to `EntityDetail`.
- `items/[slug]/page.tsx` passes `canSuggest` to `CraftTable`/`UsedInTable`. When false, those components **omit the trailing "Edit" column** (column def, the per-row `null` sort key, and the `SuggestRecipeLink` cell) so there's no empty column; when true, behavior is unchanged.

No security change — `/contribute/*` still `requireUser`. This only hides entry points.

## Section 2 — Fix the sticky "Jump to" sidebar

**Cause:** in `grid … lg:grid-cols-[1fr_220px] items-start`, the sidebar's grid cell is only as tall as the nav, so the `lg:sticky` nav has no room to travel and unsticks immediately.

**Fix:** stretch the sidebar column to the row's full height so the sticky nav travels the whole scroll. Add `lg:self-stretch` to the sidebar wrapper `<div>` (the content column keeps `items-start`). The nav keeps `lg:sticky lg:top-[4.5rem]`. Apply in both `src/app/items/page.tsx` and `src/app/tramplers/page.tsx`. Verify no `overflow:hidden`/`overflow:auto` ancestor (layout, page wrappers) is clipping the sticky context; if found, address minimally. CSS-class change only.

## Section 3 — Order + label rarity/category selects

**Pure helper** in `src/lib/proposal-entity.ts` (or a small sibling), unit-tested:

```ts
export interface SelectOption { value: string; label: string }
/** Field-specific option set/order/labels for the correction-form selects.
 *  dbValues = the distinct existing values for the column (for open-ended fields). */
export function enumOptionsFor(type: string, field: string, dbValues: string[]): SelectOption[]
```
- `field === "rarity"` → `KNOWN_RARITY_NAMES` in tier order, `{value:name, label:name}`.
- `field === "category"` → canonical category slugs for `type` (`ITEM_CATEGORY_SLUGS` for `item`, `TRAMPLER_CATEGORY_SLUGS` for `tramplerPart`, env slugs for `envEntity`) in declaration order, `{value:slug, label:categoryLabel(slug)}`.
- otherwise → `dbValues` (already sorted by the existing logic) mapped to `{value, label:value}`.

`getFieldOptions` is replaced by **`getEnumOptions(type, field): Promise<SelectOption[]>`** which fetches the distinct DB values (existing dedupe/sort logic) and returns `enumOptionsFor(type, field, dbValues)`.

`EnumField`'s `options` prop changes from `string[]` to `SelectOption[]`: `<option key={o.value} value={o.value}>{o.label}</option>`. The blank `—` and trailing `Other…` options and the `__custom` text reveal are unchanged. The "known value" check uses `options.some(o => o.value === value)`.

`src/app/contribute/edit/page.tsx` calls `getEnumOptions` instead of `getFieldOptions`. (`getRecipeWorkbenches` and the recipe form's workbench select are unaffected — workbench stays a plain DB-derived list; `EnumField`'s new `SelectOption[]` prop there is fed `{value:w,label:w}`.)

## Section 4 — `[[slug]]` item links in descriptions

**Pure parser** `src/lib/description-links.ts`, unit-tested:
```ts
export type Segment = { type: "text"; value: string } | { type: "link"; slug: string; label: string };
export function parseDescription(text: string): Segment[]   // splits on [[slug]] / [[slug|label]]
export function collectSlugs(segments: Segment[]): string[]  // unique link slugs
```
- `[[iron-plate]]` → `{type:"link", slug:"iron-plate", label:"iron-plate"}` (label replaced by the item name at render when resolved).
- `[[iron-plate|reinforced plates]]` → `{type:"link", slug:"iron-plate", label:"reinforced plates"}`.
- Malformed/empty (`[[]]`) → treated as literal text.

**Query** in `src/lib/queries.ts`:
```ts
export async function getItemsBySlugs(slugs: string[]): Promise<Map<string, { slug: string; name: string; rarity: string | null }>>
```
Empty input → empty map (no query).

**`ItemTextLink`** (`src/components/ItemTextLink.tsx`): an inline `<Link href={`/items/${slug}`}>` styled with the app `link` class and `style={{ color: rarityColor(rarity) ?? undefined }}` (theme link color when no rarity). Renders the resolved item name when the link had no explicit label, else the explicit label.

**`DescriptionText`** (`src/components/DescriptionText.tsx`, **async** server component): splits the text into paragraphs first (`text.split(/\n+/).filter(Boolean)`, the existing rule), then `parseDescription` each paragraph into segments. Collects slugs across all paragraphs, batch-fetches once via `getItemsBySlugs`, then renders one `<p>` per paragraph. For each link segment: if its slug resolves, render `<ItemTextLink>` (name defaults to the resolved item name); otherwise render the label/slug as plain text. No referenced items → behaves exactly like today's plain-text rendering. (`parseDescription` therefore operates on a single paragraph's text; newlines never appear inside a segment.)

**`EntityDetail`** replaces its inline `paragraphs.map(<p>)` with `<DescriptionText text={description ?? ""} />` (renders nothing when empty). EntityDetail stays otherwise presentational; the async fetch lives inside `DescriptionText`.

**Authoring hint:** in `EditProposalForm`, show a one-line helper under the **description** field: *"Link an item with `[[item-slug]]`."* No item-picker UI (possible later).

---

## Testing

Follows the repo convention (pure logic unit-tested; DB/UI glue verified by build/lint):
- Unit: `parseDescription` (plain text, single link, labeled link, multiple links, adjacent text, malformed `[[]]`, no links); `collectSlugs` (dedupe); `enumOptionsFor` (rarity tier order; category canonical order + labels per type; passthrough for other fields).
- Build/lint/typecheck for: auth-gating wiring, sticky CSS, `EnumField`/`getEnumOptions` change, `DescriptionText`/`ItemTextLink`/`getItemsBySlugs`.
- Manual smoke: logged-out vs logged-in suggest links; sidebar stays put while scrolling a long list; rarity/category select order + labels + "Other…"; a description containing `[[slug]]`, `[[slug|label]]`, and a bad slug.

## Out of scope (YAGNI)

- Item-picker/insert UI for description links (type the syntax).
- Linking to non-item entities (tramplers/environment) from descriptions — link targets are items only.
- Markdown beyond the `[[…]]` token.
- Custom color-swatch dropdown for selects (native `<select>` only).
- `position:fixed` sidebar.
