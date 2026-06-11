# Directus: flatten tables + integration — Design

**Date:** 2026-06-11
**TODO item:** #13 "Flattening tables for directus and integration" (enables #14 backoffice)

## Goal

Replace the three JSON blob columns (`Item.stats`, `EnvEntity.loot`, `TramplerPart.cost`)
with flat relational tables so Directus — running locally in Docker against the same Neon
dev Postgres — becomes a usable admin backoffice. Prisma stays the app's read layer.
Re-seeds stop destroying manual edits.

## Decisions made

| Question | Decision |
|---|---|
| Directus role | Admin UI on the shared Neon DB; Prisma remains the app's data access layer |
| Hosting (this phase) | Local Docker only (`docker-compose.yml` in `sand-wiki/`) |
| Seed vs admin edits | Rewrite seed to upsert-by-slug; stable row IDs across re-seeds |
| Flattening strategy | Pragmatic flat: nullable columns + child tables; loot uses fixed `col1–3` / `value1–3` (max 3 columns verified across all data) |

## 1. Schema changes (one Prisma migration)

### `Item` — drop `stats Json`, add nullable columns

- `statType String?` — e.g. "Single-Shot Rifle", "Raw Materials" (source key `type`)
- `statValue Int?` (source `value`), `damage Int?`, `playerDamage Int?` (`pDamage`),
  `tramplerDamage Int?` (`tDamage`), `splashDamage Int?` (`sDamage`), `magazine Int?`
  — all source values verified integer
- `ammoItemId String?` → self-relation `ammoItem Item? @relation("ItemAmmo")`,
  reverse `ammoForWeapons Item[]`; keep `ammoName String?` as display fallback when
  the slug doesn't resolve to an item

### `EnvEntity` — drop `loot Json`, add two tables

```prisma
model LootTier {
  id          String  @id @default(cuid())
  envEntityId String
  envEntity   EnvEntity @relation(fields: [envEntityId], references: [id], onDelete: Cascade)
  tier        String   // "Normal" | "Rare" | "Very Rare"
  col1Label   String
  col2Label   String?
  col3Label   String?
  sortOrder   Int
  entries     LootEntry[]
  @@unique([envEntityId, tier])
}

model LootEntry {
  id         String  @id @default(cuid())
  lootTierId String
  lootTier   LootTier @relation(fields: [lootTierId], references: [id], onDelete: Cascade)
  itemId     String?  // FK to Item; null when no slug match
  item       Item?    @relation(fields: [itemId], references: [id])
  name       String   // display fallback
  value1     String   // values stay strings, e.g. "10-20"
  value2     String?
  value3     String?
  sortOrder  Int
}
```

Data fact: across all of `env-content.json` only 3 column layouts exist
(`[Shipwreck Amount, Landmark Amount]`, `[Lesser, Normal, Greater]`, `[Count, Chance]`),
max 3 columns — `col1–3`/`value1–3` covers everything.

### `TramplerPart` — drop `cost Json`, add

```prisma
model TramplerPartCost {
  id        String  @id @default(cuid())
  partId    String
  part      TramplerPart @relation(fields: [partId], references: [id], onDelete: Cascade)
  itemId    String?  // null for Crowns (currency, not an item)
  item      Item?    @relation(fields: [itemId], references: [id])
  name      String
  amount    Int
  sortOrder Int
}
```

`Item` gains reverse relations: `lootEntries LootEntry[]`, `costEntries TramplerPartCost[]`,
`ammoForWeapons Item[]`.

## 2. Seed rewrite: upsert-by-slug

- `Item`, `Recipe`, `EnvEntity`, `TramplerPart` are upserted keyed on `slug` — row IDs
  stay stable across re-seeds so Directus revisions/relations survive.
- Fully scraper-owned child rows (`RecipeInput`/`RecipeOutput`, `LootTier`/`LootEntry`,
  `TramplerPartCost`) are deleted and recreated per parent on each seed.
- Update payloads omit fields the source has no value for: an admin-written description
  survives re-seed when the scraper has none; where the scraper has a value, it wins.
  (Formal overrides come with the corrections workflow, TODO #15–16.)
- Rows whose slug disappears from the scrape snapshot are pruned, with a log line
  listing what was removed.
- Importers and committed JSON snapshots are untouched — same pipeline, new seed shape.

## 3. App integration (read paths)

- `StatBox` / item detail read the flat columns; the weapon→ammo link and ammo's
  "Used by" tab use the `ammoItem`/`ammoForWeapons` relation instead of JSON
  `ammoSlug` lookups.
- Environment detail loot tabs query `lootTiers { entries { item } }` ordered by
  `sortOrder`; trampler parts read `costEntries { item }`.
- No intended UI behavior change — same rendered output, relational source.

## 4. Directus setup (local Docker)

- `sand-wiki/docker-compose.yml`: Directus image, `DB_CLIENT=pg`, connection string to
  the Neon dev DB from env, admin credentials via env. No secrets committed.
- Commit a Directus **schema snapshot** (collections/relations config) plus an npm
  script to apply it, so the backoffice configuration is reproducible.
- **Known risk — Prisma drift:** Directus creates `directus_*` system tables, and
  `prisma migrate dev` drift detection would flag them (and may prompt a destructive
  reset). Mitigation to verify during implementation: `DB_SEARCH_PATH=directus,public`
  so system tables land in a separate `directus` Postgres schema Prisma never
  introspects. Fallback if unsupported: run Directus against a dedicated Neon branch.

## 5. Testing

- Pure unit tests for the new seed transform functions (stats→columns,
  loot→tier/entry rows, cost→rows).
- Update `prisma/loot-resolution.test.ts` to the new shape.
- Existing e2e suite must pass (item stats, loot tabs, trampler costs, axe in both
  themes).
- Manual verification: re-seed twice, confirm row IDs stable; edit a field in
  Directus, re-seed, confirm survival per the rules above.

## Scope boundaries

**In:** migration, seed rewrite, app read-path updates, docker-compose, Directus schema
snapshot, documentation updates in `instructions.md`.
**Out:** production Directus hosting, auth/roles beyond default admin, Steam-based
corrections workflow (TODO #15–16), tips/votes (TODO #17).
