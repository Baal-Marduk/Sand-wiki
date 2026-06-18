# Design — "Used by" tab on ammunition

Date: 2026-06-10

## Problem

Gun and artillery items already record their ammunition as `stats.ammoSlug` /
`stats.ammoName` (JSON on `Item`), and the item detail page links forward from a
gun to its ammo. There is no reverse view: an ammunition page does not tell you
which weapons fire it. We want a **"Used by"** tab on ammunition pages listing
the guns/artillery that use that ammo type.

A second, related request — rendering the gun-side "Ammo" stat as an icon +
tooltip instead of a text link — is **deferred**; this spec only captures it as a
TODO in `instructions.md`.

## Data

No schema change. The relationship is already present: a weapon/artillery item's
`stats.ammoSlug` holds the slug of its ammo item. "Weapons that use ammo X" is
therefore every item whose `stats.ammoSlug == X.slug`.

Postgres JSON path filtering via Prisma:

```ts
where: { stats: { path: ["ammoSlug"], equals: ammoSlug } }
```

For a non-ammo item this returns nothing, so the tab naturally only appears on
ammo pages (and any other item that some weapon points at, which is correct by
definition).

## Components

### 1. Query — `getWeaponsUsingAmmo(ammoSlug)` (`src/lib/queries.ts`)

- `prisma.item.findMany({ where: { stats: { path: ["ammoSlug"], equals: ammoSlug } }, select: { slug, name, icon, category }, orderBy: { name: "asc" } })`.
- Returns `{ slug, name, icon, category }[]` (empty when nothing references it).

### 2. Component — `AmmoUsedByGrid` (`src/components/AmmoUsedByGrid.tsx`)

- Props: `items: { slug, name, icon, category }[]`.
- Renders a `flex flex-wrap` grid of `ItemIconLink` (icon, hover/focus name
  tooltip, links to `/items/<slug>`); no `×amount`.
- Mirrors the existing loot icon grid in look and behavior.

### 3. Wire-up — `src/app/items/[slug]/page.tsx`

- After loading the item, call `getWeaponsUsingAmmo(item.slug)`.
- When the result is non-empty, push a tab
  `{ id: "used-by", label: "Used by", content: <AmmoUsedByGrid items={…} /> }`,
  using the same manual-push pattern already used for the Loot tab.
- Placed immediately **before** the Loot tab. Resulting order:
  Crafted by · Used in · Buy · Sell · **Used by** · Loot.

### 4. Type — `src/lib/item-view.ts`

- Add `"used-by"` to the `TabId` union. (`availableTabs` stays trades-only;
  this tab is pushed manually like Loot.)

## Task 1 (deferred) — documentation only

Add a line to the **Requirements / TODO** section of `instructions.md`: on
weapon/artillery detail pages, render the `StatBox` "Ammo" stat as an
icon + tooltip (`ItemIconLink`) rather than the current plain text link. Not
implemented in this change.

## Testing

- Verify against the dev DB that at least one ammo item has weapons referencing
  it (so the assertions exercise a populated tab).
- e2e (Playwright, following the existing icon-grid e2e): load that ammo page,
  open the "Used by" tab, assert it lists weapon icons that link back to the
  weapon pages, and that axe passes in both themes.

## Out of scope

- No schema change / no join table — the link lives in `stats`.
- No change to how guns display their ammo (that is the deferred task 1).
