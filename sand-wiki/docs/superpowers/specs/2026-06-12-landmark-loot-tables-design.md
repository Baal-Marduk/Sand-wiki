# Landmark Loot Tables: Container Entries, Friendly Directus Editing & Seed Protection

**Date:** 2026-06-12
**Status:** Approved — ready for implementation plan

## Problem

The user wants **loot tables for landmarks** whose entries can be **containers as well as items** (e.g. the Dreadnaught landmark drops crates + items). Two blockers:

1. **Loot entries can only reference items.** `LootEntry` has `itemId` (+ `name` fallback) but no way to point at a container (another `EnvEntity`).
2. **Editing loot in Directus is unusable.** `LootTier` and `LootEntry` are exposed as flat, disconnected collections with no nested editing — to add a row you open the `LootEntry` collection directly and pick a parent from a `lootTierId` dropdown showing only `"Normal"`/`"Rare"` with **no entity context** (every entity has a "Normal" tier), then type into unlabeled `value1/2/3`/`name`/`sortOrder` fields.

A third concern surfaces because landmark loot is **hand-authored**: the seed (`prisma/seed.ts`) **deletes and recreates** all loot tiers for any entity it processes, so curated loot would be wiped on the next import.

## Decisions (from brainstorming)

- **Combined** feature: container-capable loot entries + friendly Directus editing + seed protection.
- Seed protection: a flag marks entities whose loot is hand-curated; the seed **skips** recreating their loot. **Loot-scoped** — scalar fields (name/description) still refresh from the wiki.
- Keep the existing **icon-grid** loot display (no amounts/columns rendering); just add container links.

## Relevant current state

- **Model** (`prisma/schema.prisma`): `LootTier { id, envEntityId, envEntity, tier, col1Label, col2Label?, col3Label?, sortOrder, entries: LootEntry[] }`; `LootEntry { id, lootTierId, lootTier, itemId?, item?, name, value1?, value2?, value3?, sortOrder }`. No `@@map` — Directus sees PascalCase table/camelCase column names.
- **Directus** schema is a committed snapshot (`directus/snapshots/snapshot.yaml`, applied via `npm run directus:apply`, Directus 11.17.4). Loot collections have **no O2M alias fields** and **no relations entries** for the loot FKs; `name`/`value1-3`/`sortOrder` have no field meta. By contrast `Recipe` **does** have `inputs`/`outputs` O2M alias fields with full `relations:` entries — the working pattern to mirror.
- **Rendering:** `src/app/environment/[slug]/page.tsx` maps `entity.lootTiers` into tabs (renders for **every** env category, landmarks included) → `LootTable` (`src/components/LootTable.tsx`) renders a flat icon grid via `ItemIconLink` (`/items/[slug]` href; bare icon when no slug). It already ignores `value1-3`/labels. Query: `getEnvEntityBySlug` in `src/lib/queries.ts` includes `lootTiers → entries → item{slug,icon,rarity}`.
- **Seed:** `prisma/seed.ts` reads `prisma/env-content.json`, upserts each `EnvEntity`, then **deletes all `LootTier` for that entity and recreates** tiers+entries. `env-content.json` loot entries carry `slug?`+`name`+`values[]` (items only; never containers).
- `getCratesContaining(itemSlug)` (item→containers reverse lookup) filters `item.slug` + `category: "loot-containers"`; container-typed entries simply won't match it — no change required.

---

## Section 1 — Schema: container-capable loot entries

`prisma/schema.prisma`:
- `LootEntry` gains `containerId String?` and `container EnvEntity? @relation("LootEntryContainer", fields: [containerId], references: [id], onDelete: SetNull)`.
- `EnvEntity` gains the back-relation `droppedInLoot LootEntry[] @relation("LootEntryContainer")` (required for Prisma to compile; distinct from the existing `lootTiers` relation).
- Optional `@@index([containerId])` on `LootEntry` (consistent with the existing `@@index([itemId])`).

An entry is **one of**: item (`itemId`), container (`containerId`), or plain `name` — mutually exclusive **by convention**, not DB-enforced (mirrors the current item/name pattern). `name` is always present (display fallback). `onDelete: SetNull` preserves `name` if the linked item/container is deleted.

One Prisma migration adds the nullable column + FK + index. `npx prisma generate` refreshes the client.

## Section 2 — Seed protection (`lootCurated`)

`EnvEntity` gains `lootCurated Boolean @default(false)` (same migration).

`prisma/seed.ts`: before the existing per-entity loot **delete-and-recreate**, read the entity's current `lootCurated` from the DB; if `true`, **skip** the loot wipe/recreate for that entity (its Directus-authored loot is preserved). The entity's scalar upsert (name/description/icon/sourceUrl) still runs as today, and must **not** write `lootCurated` (so a re-seed never resets the flag — `@default(false)` applies on create only; the update payload omits it). Entities absent from `env-content.json` are never touched by the seed regardless.

## Section 3 — Friendly Directus editing (snapshot config only)

Edit `directus/snapshots/snapshot.yaml`, then `npm run directus:apply`. **No application code.** Mirror the existing `Recipe.inputs/outputs` configuration:

1. **Nested inline editing (O2M):**
   - Add a `relations:` entry for `LootTier.envEntityId → EnvEntity` with `meta.one_field: lootTiers`, and an **alias field** `lootTiers` on `EnvEntity` (`special: [o2m]`, `interface: list-o2m`, sorted by `LootTier.sortOrder`).
   - Add a `relations:` entry for `LootEntry.lootTierId → LootTier` with `meta.one_field: entries`, and an **alias field** `entries` on `LootTier` (`special: [o2m]`, `interface: list-o2m`, sorted by `LootEntry.sortOrder`).
   - Result: open an `EnvEntity` (landmark) → edit its tiers inline → expand a tier → add/reorder entry rows in place, with full context.
2. **Container field:** add `LootEntry.container` (M2O) as `select-dropdown-m2o`, `display: related-values` template `{{name}}`, with a `relations:` entry `LootEntry.containerId → EnvEntity`. Add notes on `itemId`/`container`/`name`: "An entry links **either** an item **or** a container, or just shows the typed name."
3. **Sort handles:** set `sortOrder` as the O2M sort field for both alias fields (drag-to-reorder), and hide/`readonly` the raw `sortOrder` number field.
4. **Labels/notes/display:** notes on `name` ("Display label; defaults to the item/container name"), `value1-3` ("Optional amount string, e.g. '10-20' — used by container loot; landmark loot can leave blank"); `display_template` `{{tier}}` on `LootTier` and `{{name}}` on `LootEntry`.
5. **Seed-protection toggle:** expose `EnvEntity.lootCurated` as a `boolean` interface with note: *"On = the importer won't overwrite this entity's loot table (set this for hand-authored landmark loot)."*

Note: the snapshot must register the new `container` M2O and `lootCurated` fields and the loot O2M relations that Directus does not currently track. (`directus:snapshot` can regenerate after manual Studio setup, or the YAML is edited directly — the implementation plan will specify exact YAML mirroring the `Recipe` entries.)

## Section 4 — App rendering of container entries

- `getEnvEntityBySlug` (`src/lib/queries.ts`): add `container: { select: { slug: true, name: true, icon: true } }` alongside `item` in the entries include.
- `LootEntryView` (`src/components/LootTable.tsx`) and the page projection in `environment/[slug]/page.tsx`: carry a computed link target. Per entry, derive `href`: item → `/items/[item.slug]`, else container → `/environment/[container.slug]`, else `null`; and `icon`/`name`/`rarity` from whichever ref is set (falling back to `name`).
- `ItemIconLink` (`src/components/ItemIconLink.tsx`): add an optional `href?: string`; link precedence `href ?? (slug ? `/items/${slug}` : none)`. `LootTable` passes the computed `href`. **Recipe/other usages keep passing `slug` and are unaffected.**
- Container entries thus render in the icon grid linking to the container's `/environment` page; sort still uses `byRarityThenName` (containers have null rarity → sort last).

---

## Testing

Repo convention (pure logic unit-tested; DB/CMS/UI verified by build/lint + manual):
- Unit: the per-entry **href/projection** logic — extract a small pure helper `lootEntryView(entry)` (or `lootEntryHref`) mapping `{item?,container?,name}` → `{ name, icon, rarity, href }`, and test item / container / name-only / precedence (item wins if both somehow set). 
- Migration: `npx prisma migrate dev` applies cleanly; `npx prisma generate`; `npx tsc --noEmit`.
- Seed: dry reasoning + a guarded run — verify a `lootCurated: true` entity's loot is preserved across a re-seed (manual/scripted check).
- Directus: `npm run directus:apply` against a running instance; manually confirm nested loot editing, the container picker, drag-reorder, and the `lootCurated` toggle.
- App: `npm run build`; manual — a landmark with a loot tier containing an item, a container, and a name-only entry renders the icon grid with correct links.

## Out of scope (YAGNI)

- Rendering amounts / column labels in loot tables (stays icon-grid).
- A reverse "which landmarks drop this container" lookup.
- DB-enforced item-xor-container exclusivity (convention only).
- Importing container loot from the wiki scrape (`env-content.json` stays item-only; landmark/container loot is authored in Directus).
- Auto-setting `lootCurated` — the editor toggles it manually.
