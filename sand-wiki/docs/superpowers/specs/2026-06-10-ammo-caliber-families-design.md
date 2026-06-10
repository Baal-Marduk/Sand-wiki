# Design — caliber-based ammo families

Date: 2026-06-10

## Problem

Ammo↔weapon links are currently exact-slug: a weapon's `stats.ammoSlug` points at one
ammo item, and the tabs match on that single slug. That misses two things the game's
data implies:

1. **Variants of one caliber are interchangeable.** `11x54 mm Ammo` and `11x54 mm AP
   Ammo` both fit the Petros rifles, but only the base round is linked, so the AP
   round's page shows no weapons.
2. **Artillery has no ammo link at all.** Every artillery item is a
   `game-packed-…-turret-…-container` with no `ammoName`/`ammoSlug`/`type`, so turrets
   can't show an Ammo tab even though the 40/70/80 mm shells exist as ammo items.

We want matching by a **caliber family** so all same-caliber variants are interchangeable,
artillery gets an Ammo tab, and each ammo shows a precise class label.

## Data (verified against the dev DB)

Caliber families and their members:

| Caliber  | Label      | Ammo items (names)                                                                                  |
|----------|------------|------------------------------------------------------------------------------------------------------|
| 8x21 mm  | Pistol     | 8x21 mm Ammo, …FMJ, …HV, …Incendiary, …Toxic                                                          |
| 9x42 mm  | Rifle      | 9x42 mm Ammo, …FMJ, …HV, …Incendiary, …Toxic                                                          |
| 11x54 mm | Sniper     | 11x54 mm Ammo, 11x54 mm AP Ammo                                                                       |
| 12 GA    | Shotgun    | 12 GA Ammo, …Buckshot (HE), …Dragon's Breath, …Heavy Buckshot, …Shotgun Slug, …Toxic                  |
| 40 mm    | Autocannon | 40 mm Shell, Long-Range 40 mm Shell                                                                   |
| 70 mm    | Shotgun    | 70 mm Shell, 70 mm Shotgun Cannon Slug                                                                |
| 80 mm    | Naval      | 80 mm Shell, High Velocity 80 mm Shell                                                                |
| Rocket   | Rocket     | Armor-Piercing Rocket, High-Explosive Rocket                                                          |

Weapon/artillery side:

- **Small arms** carry `stats.ammoName` (e.g. `"11x54 mm Ammo"`) → caliber derivable from the name.
- **Artillery turrets** carry no ammo fields, but their **slug prefix** is reliable
  (names like "Experimental 80mm Cannon Kit" / "2x70 mm Twin …" are not):
  - `game-packed-auto-turret*` → 40 mm (Autocannon)
  - `game-packed-shotgun-turret*` → 70 mm (Shotgun)
  - `game-packed-turret*` → 80 mm (Naval) — includes the rail-gun and double-barrel variants
- **Rocket launcher** (`rocket-launcher*`, no `ammoName`) → Rocket.

No schema or seed change: families are derived at runtime.

## Components

### 1. `src/lib/ammo.ts` (new, pure, unit-tested)

- `ammoCaliber(name: string): string | null` — extract the family token from an **ammo**
  name. Match order matters:
  1. `/\b\d+x\d+\s?mm\b/i` → e.g. `"11x54 mm"` (tried first so `11x54 mm` does not degrade
     to `54 mm`)
  2. `/\b\d+\s?GA\b/i` → `"12 GA"`
  3. `/\b\d+\s?mm\b/i` → `"40 mm"`
  4. `/rocket/i` → `"Rocket"`
  5. else `null`
  Returned tokens are normalised to a single space (e.g. `"40 mm"`, `"11x54 mm"`).
- `SLUG_CALIBER_OVERRIDES: { prefix: string; caliber: string }[]` — ordered, most-specific
  first: `game-packed-auto-turret`→`40 mm`, `game-packed-shotgun-turret`→`70 mm`,
  `game-packed-turret`→`80 mm`, `rocket-launcher`→`Rocket`.
- `weaponCaliber(slug: string, ammoName?: string | null): string | null` — if `ammoName`
  is set, return `ammoCaliber(ammoName)`; else return the first matching override prefix's
  caliber, else `null`.
- `caliberLabel(caliber: string | null): string | null` — map:
  `8x21 mm:Pistol, 9x42 mm:Rifle, 11x54 mm:Sniper, 12 GA:Shotgun, 40 mm:Autocannon,
  70 mm:Shotgun, 80 mm:Naval, Rocket:Rocket`. Unknown/`null` → `null`.

### 2. Queries (`src/lib/queries.ts`)

The relevant dataset is tiny, so filter in application code rather than in SQL:

- `getAmmoByCaliber(caliber: string): Promise<LinkListItem[]>` — fetch all
  `category: "ammo"` items (`slug,name,icon`), keep those whose `ammoCaliber(name) ===
  caliber`, ordered by name.
- `getWeaponsByCaliber(caliber: string): Promise<LinkListItem[]>` — fetch all
  `category in ["weapons","artillery"]` items (`slug,name,icon,stats`), keep those whose
  `weaponCaliber(slug, stats?.ammoName) === caliber`, ordered by name.

Both return `LinkListItem` (`{ slug, name, icon }`) for `ItemLinkList`.

### 3. Page wiring (`src/app/items/[slug]/page.tsx`)

Replaces the current exact-slug `getWeaponsUsingAmmo` / single-ammo logic.

- Compute the page item's caliber:
  - `item.category === "ammo"` → `ammoCaliber(item.name)`
  - otherwise → `weaponCaliber(item.slug, stats?.ammoName)`
- **Ammo tab** (non-ammo items with a caliber, i.e. weapons + artillery): push
  `{ id: "ammo", label: "Ammo", content: <ItemLinkList items={await getAmmoByCaliber(cal)} /> }`
  when the list is non-empty. This is what gives artillery an Ammo tab.
- **Used by tab** (ammo items with a caliber): push
  `{ id: "used-by", label: "Used by", content: <ItemLinkList items={await getWeaponsByCaliber(cal)} /> }`
  when non-empty.
- Tab order unchanged: …Buy · Sell · **Ammo**/**Used by** · Loot.
- Remove `getWeaponsUsingAmmo` (and its `AmmoUser` type) — superseded by the caliber queries.

### 4. StatBox type label (`src/components/StatBox.tsx`, page)

- Add optional prop `typeLabel?: string`. The Type cell shows `typeLabel ?? stats.type`
  (so weapons keep `stats.type` like "Single-Shot Rifle"; ammo shows the family label).
- The page passes `typeLabel={caliberLabel(ammoCaliber(item.name))}` only when
  `item.category === "ammo"`.

## Testing

**Unit (`src/lib/ammo.test.ts`):**
- `ammoCaliber`: `"11x54 mm AP Ammo"`→`"11x54 mm"` (not `"54 mm"`), `"8x21 mm Ammo"`→`"8x21 mm"`,
  `"12 GA Toxic Ammo"`→`"12 GA"`, `"Long-Range 40 mm Shell"`→`"40 mm"`,
  `"High-Explosive Rocket"`→`"Rocket"`, unmatched → `null`.
- `weaponCaliber`: `("rifle-musket", "9x42 mm Ammo")`→`"9x42 mm"`;
  `("game-packed-auto-turret-t1-container", null)`→`"40 mm"`;
  `("game-packed-shotgun-turret-t1-container", null)`→`"70 mm"`;
  `("game-packed-turret-t4-rail-gun-container", null)`→`"80 mm"`;
  `("c4-dynamite", null)`→`null`.
- `caliberLabel`: `"11x54 mm"`→`"Sniper"`, `"40 mm"`→`"Autocannon"`, `"80 mm"`→`"Naval"`,
  `"12 GA"`→`"Shotgun"`, `null`→`null`.

**e2e (`tests/e2e/wiki.spec.ts`):**
- AP variant `/items/sniper-rifle-ammo-high-penetration`: "Used by" tab lists a Petros
  rifle (e.g. link to `/items/sniper-rifle`), proving variant↔gun matching.
- A turret `/items/game-packed-turret-t1-container`: "Ammo" tab lists `80 mm Shell`.
- An ammo page's StatBox shows the class label (e.g. `sniper-rifle-ammo` → "Sniper").
- Update the existing weapon Ammo-tab and Used-by tests to the caliber behaviour (the
  rifle's Ammo tab now lists all 9x42 mm variants; pistol-ammo Used by still lists its guns).

## Out of scope

- No DB schema or seed change.
- No change to the coin sprite, recipe/loot tabs, or icon sizing.
- Rocket-launcher↔rockets is included via the slug override for consistency; trivial to
  drop if unwanted.
