# Design — stored "Ammo type" matching for weapons ↔ ammo

Date: 2026-06-16

## Problem

The Ammo tab (on a weapon/turret) and the "Used by" tab (on an ammo item) are not
editable. The relationship is **derived at runtime** from a caliber string parsed
out of item names by a regex (`ammoCaliber`), plus a hardcoded slug-override list
for turrets (`SLUG_CALIBER_OVERRIDES`). Two items pair when their derived caliber
strings are equal (`items/[slug]/page.tsx`, `getAmmoByCaliber` /
`getWeaponsByCaliber`).

This is fragile and hard to maintain:

- The regex breaks on any name format it does not anticipate.
- New turrets/launchers that carry no `ammoName` require a **code change**
  (a new `SLUG_CALIBER_OVERRIDES` entry) to pair correctly.
- A wrong pairing cannot be fixed through the existing "Suggest a correction"
  flow — it always needs a developer.

## Goal

Promote the caliber to an explicit **stored, editable field** and match on
equality. Weapons and ammo that share the same value appear on each other's
pages. Contributors can fix pairings via "Suggest a correction" with no code
change, and the regex / override list leave the runtime read path.

## Decisions (settled during brainstorming)

- **Match value = caliber family** (`"8x21 mm"`, `"12 GA"`, `"40 mm"`, `"Rocket"`),
  not the class label. The class label over-links: `12 GA` hand-shotgun ammo and
  `70 mm` shotgun turrets both map to the label "Shotgun" and would wrongly pair.
- **New dedicated column**, not a reuse of `statType`. `statType` already holds the
  weapon *archetype* ("Revolver", "Assault Rifle") shown as the "Type" stat — a
  finer granularity than caliber, and reusing it would both be semantically wrong
  (a revolver would never link to a pistol's shared ammo) and destroy that display
  value. The new field is labeled **"Ammo type"** in the editor; `statType` stays
  "Type" and is untouched.
- **Match is a shared scalar field compared by equality**, not an `EntityLink` /
  join table. A join would be N×M rows and would re-introduce reseed-wipe risk.
- **`ammoName` is kept** as a display/label field; it simply stops driving matching.

## Data model

Add one nullable column to `ItemStats`:

```prisma
model ItemStats {
  // …existing columns…
  ammoName  String?
  ammoType  String?   // NEW — caliber family; the weapon↔ammo match key
}
```

New Prisma migration adds the column (nullable, no default). `statType` and all
other columns are unchanged.

## Components

### 1. Resolver — `ammoTypeFor` (`src/lib/ammo.ts`)

A single helper that computes the stored value from an entity's identity, reusing
the existing parsing logic:

```ts
/** The caliber-family value to store for an item, or null if it has none.
 *  Ammo derives from its own name; weapons/artillery from ammoName or a slug override. */
export function ammoTypeFor(
  category: string,
  slug: string,
  name: string,
  ammoName: string | null | undefined,
): string | null {
  if (category === "ammo") return ammoCaliber(name);
  if (category === "weapons" || category === "artillery") return weaponCaliber(slug, ammoName);
  return null;
}
```

`ammoCaliber`, `weaponCaliber`, and `SLUG_CALIBER_OVERRIDES` remain but are now
**only** consumed by `ammoTypeFor` (seed + backfill). They leave the runtime read
path entirely.

### 2. Matching reads the stored field

- `src/app/items/[slug]/page.tsx`: replace
  `caliber = isAmmo ? ammoCaliber(item.name) : weaponCaliber(item.slug, stats?.ammoName)`
  with `const caliber = stats?.ammoType ?? null;`.
- `src/lib/queries.ts` — `getAmmoByCaliber(caliber)` and
  `getWeaponsByCaliber(caliber)`: push the comparison into the Prisma `where`
  (`itemStats: { is: { ammoType: caliber } }`) and drop the post-fetch
  `.filter(... === caliber)`. Both keep their existing category scoping
  (`category: "ammo"` vs `category: { in: ["weapons", "artillery"] }`), so equal
  `ammoType` only ever links across the two sides — never two unrelated items.

### 3. Display & filters

- Ammo "Type" stat: keep showing the class label, but derive it from the stored
  field — `caliberLabel(stats.ammoType)` (was `caliberLabel(caliber)` in
  `items/[slug]/page.tsx`). Weapon "Type" continues to show `statType`. No visible
  change for correctly-backfilled data.
- `/items` weapon-class filter (`src/lib/item-filter.ts`): derive the class from
  the stored `ammoType` (`caliberLabel(row.ammoType)`) instead of re-parsing via
  `itemClass(slug, name, ammoName)`. The filtered rows already carry `itemStats`;
  thread `ammoType` through to the filter input. `itemClass`/`itemClasses` either
  change to accept `ammoType` directly or are replaced at call sites by
  `caliberLabel(ammoType)`.

### 4. Editing — "Suggest a correction"

Add to `EDITABLE_FIELDS.item` in `src/lib/proposal-schema.ts`:

```ts
{ field: "ammoType", label: "Ammo type", type: "string" },
```

No change to `proposal-apply.ts`: `applyableUpdate` picks up any whitelisted field,
and `partitionUpdate` routes `ammoType` (not in `ENTITY_OWN_FIELDS`) to the
`itemStats` upsert automatically.

The correction form gains one line of help text near the field:
> "Weapons and ammo sharing the same Ammo type appear on each other's pages."

### 5. Backfill & seed-safety

**Seed path (dev / fresh DB).** In the seed item loop (`prisma/seed.ts`), where
`slug`, `name`, `category`, and `flat.ammoName` are all in scope, compute
`ammoType: ammoTypeFor(category, i.slug, i.name, flat.ammoName)` and include it in
the `stats` object written via upsert. The existing field-level **lock map**
(`buildLockMap` / `omitLocked`, `seed.ts:93`) then preserves any contributor edit
to `ammoType` across reseeds with no extra work — because `ammoType` is a
whitelisted edit field, an applied edit to it lands in the lock map automatically.

**Live DB.** A **one-time standalone backfill script** (e.g.
`prisma/backfill-ammo-type.mjs`) that:
- reads every item with `category` in `{ ammo, weapons, artillery }` plus its
  `slug`, `name`, and `itemStats.ammoName`;
- computes `ammoTypeFor(...)`;
- `UPDATE`s only `ItemStats.ammoType` (leaves every other column untouched).

This never reseeds and touches only the new column, so it cannot revert any
contributor field/rarity/loot edit — consistent with the hard never-reseed rule.
Existing pairings are preserved exactly because the backfill reuses the same
`weaponCaliber`/`ammoCaliber` logic that drives matching today.

### 6. Cleanup

`ammoCaliber`, `weaponCaliber`, `SLUG_CALIBER_OVERRIDES` retained but referenced
only by `ammoTypeFor`. `caliberLabel`, `CLASS_ORDER` retained for display/filter.
No turret override removal in this change.

## Testing

- **Unit:** `ammoTypeFor` for ammo (from name), weapons (from `ammoName`), turret
  slug override, and null categories. Update `src/lib/ammo.test.ts`.
- **Unit:** `getAmmoByCaliber` / `getWeaponsByCaliber` filter on `ammoType`
  (update `queries`-level tests if present, otherwise cover via the resolver +
  where-clause shape).
- **Unit:** `applyableUpdate("item", …)` routes `ammoType` into the `itemStats`
  partition (extend `proposal-apply.test.ts` / `proposal-diff.test.ts`).
- **E2e (Playwright):** after backfill, an ammo page's "Used by" tab lists the
  expected weapons and a weapon page's "Ammo" tab lists the expected ammo;
  editing "Ammo type" via Suggest-a-correction produces a pending proposal.

## Out of scope

- Removing the turret `SLUG_CALIBER_OVERRIDES` list (still used by the backfill).
- A dropdown/enum of known calibers in the editor — free string for now.
- Showing a weapon's own caliber as a stat (weapons keep `statType` display only).
- Any change to the `ammoName` display behavior.
