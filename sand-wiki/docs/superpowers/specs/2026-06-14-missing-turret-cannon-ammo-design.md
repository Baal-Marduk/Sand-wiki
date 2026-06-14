# Missing turret/cannon ammo entries — design

**Date:** 2026-06-14
**Status:** approved-pending-review

## Problem

Comparing the game's `icon_ammo_*` icon files against the wiki's `AMMO`/`TURRET_AMMO`
entities surfaced three ammo variants that exist in-game but have no wiki entry:

| icon file | family |
|-----------|--------|
| `icon_ammo_shotgunTurret_smoke.png` | 70 mm shotgun turret |
| `icon_ammo_shotgunTurret_<interior>.png` | 70 mm shotgun turret (penetrating — exact suffix TBC) |
| `icon_ammo_smallCannon_lowRecoil.png` | 40 mm autocannon |

The third icon's filename is truncated in the source screenshot. Its literal suffix is
**authoritative** for the slug and PNG name and will be read off the file when the PNG is
copied in. Tentative gameplay reading: an armor-piercing / penetrating round.

We have **icons only** — no in-game name, description, or stats. Entries are created as
**stubs** (derived name + family-derived placeholder description); real text is filled in
later via the normal contributor edit flow.

## Constraints

- **Never reseed the live DB.** Reseeding silently reverts contributor field edits; only
  `curated:true` rows are protected from prune (and even those have identity fields
  overwritten on reseed). New rows must be inserted directly and marked `curated:true`.
- Caliber grouping is **runtime-derived**, not stored: [`ammoCaliber(name)`](../../../src/lib/ammo.ts)
  finds a token like `70 mm` / `40 mm` in the entity **name** and that makes the ammo
  interchangeable with the weapons/turrets of that family. **Therefore each new entry's
  name must contain its caliber token** — no manual `EntityLink` is needed; the ammo
  auto-appears in the correct family.
- `category` (`ammo`), `icon` path, and `rarity` (`Common`) are derived by the seed, not
  stored in `data.json`. The curated insert sets them explicitly.

## The three entries

`name` is the DB/display form (must carry the caliber token); `derivedName` mirrors the
`data.json` `name`. Placeholder descriptions reuse the family base text.

| slug | data.json id | name (DB) | derivedName | icon | class |
|------|--------------|-----------|-------------|------|-------|
| `shotgun-turret-ammo-smoke` | `item_shotgunTurretAmmo_smoke` | **Smoke 70 mm Shell** | Shotgun Turret Ammo Smoke | `/icons/icon_ammo_shotgunTurret_smoke.png` | Shotgun (70 mm) |
| `shotgun-turret-ammo-<suffix>` | `item_shotgunTurretAmmo_<suffix>` | **Penetrating 70 mm Shell** | Shotgun Turret Ammo Penetrating | `/icons/icon_ammo_shotgunTurret_<suffix>.png` | Shotgun (70 mm) |
| `small-cannon-ammo-low-recoil` | `item_smallCannonAmmo_lowRecoil` | **Low-Recoil 40 mm Shell** | Small Cannon Ammo Low Recoil | `/icons/icon_ammo_smallCannon_lowRecoil.png` | Autocannon (40 mm) |

Common DB-row fields: `kind:"item"`, `category:"ammo"`, `rarity:"Common"`,
`curated:true`, `lootCurated:true`.

Placeholder descriptions (replaceable later):
- 70 mm shells: *"Canister shot variant for 70 mm shotgun cannons."* (smoke) /
  *"Armor-piercing shell for 70 mm shotgun cannons."* (penetrating)
- 40 mm: *"A smaller-caliber cannon shell utilized by autocannons. Tuned for reduced recoil."*

> The exact suffix, slug, displayName, and description of the penetrating round are
> confirmed against the real icon filename when the PNG is copied in.

## Approach: data file + curated loader (mirrors `load-location-recipes.ts`)

Chosen over the proposal flow (new_page proposals are applied by hand, no Prisma adoption)
and over data.json-only (invisible on the live site until a forbidden reseed).

### Artifacts

1. **PNGs** → `sand-wiki/public/icons/icon_ammo_*.png` (3 files, supplied from the game).
2. **`icons.json`** → 3 entries mapping `item_*` id → `icons/icon_ammo_*.png`
   (fresh-seed parity only; the loader sets `icon` directly).
3. **`data.json`** → 3 `items` entries (`slug`, `id`, `name`, `displayName`, `description`,
   `type:"AMMO"`, `isResource:false`, `storageStack:100000`, `workbenchTier:null`,
   `fromCatalog:false`) so a future fresh seed reproduces them.
4. **`prisma/new-ammo.json`** + **`prisma/load-new-ammo.ts`** — a JSON data file and an
   idempotent upsert-by-slug loader (pattern: `load-location-recipes.ts`). Upsert sets all
   identity fields + `curated:true` + `lootCurated:true`. Safe to re-run.

### Data flow

```
new-ammo.json ──load-new-ammo.ts──▶ live Neon DB (curated Entity rows)
                                          │
data.json + icons.json + PNG ────────────┴──▶ fresh-seed parity (no reseed now)
```

### Execution order

1. Copy the 3 PNGs into `public/icons/`; read the real penetrating-round filename.
2. Finalize the penetrating entry's suffix/slug/displayName/description.
3. Add the 3 entries to `data.json` and `icons.json`.
4. Author `prisma/new-ammo.json` + `prisma/load-new-ammo.ts`.
5. Run the loader against the live DB (single, idempotent, non-pruning write).

## Error handling

- Loader fails loudly on duplicate slugs and (optionally) on a missing PNG for any entry.
- Loader is upsert-by-slug + idempotent: re-running re-asserts the curated rows without
  duplicating.
- No prune, no delete, no recipe/loot mutation — strictly additive.

## Verification

- Each new ammo page renders with its icon and appears under the correct weapon family
  (70 mm → shotgun turrets; 40 mm → autocannons) via `getAmmoByCaliber`.
- `vitest` stays green (esp. `ammo.test.ts`).
- Live site: navigate to a 70 mm / 40 mm weapon and confirm the new variants list as
  compatible ammo.

## Out of scope

- Real in-game names, descriptions, stats (added later via the edit/proposal flow).
- The `anti-reactor-gun` icon naming question (its `icon_ammo_`-prefixed icon vs its
  `WEAPON_BELT` modeling) — flagged separately, not part of this change.
- The two rocket-launcher ammo entries (already in the wiki; their icons use a different
  prefix).
