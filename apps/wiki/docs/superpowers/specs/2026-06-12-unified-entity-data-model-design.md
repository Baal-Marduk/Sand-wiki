# Unified Entity Data Model — Design

**Date:** 2026-06-12 (revised 2026-06-13)
**Status:** Design / analysis (no implementation yet)
**Branch context:** `feat/landmark-loot-tables`

> **Revision 2026-06-13:** generalized tabs into a single `EntityLink` row model with a fixed
> *role* catalog (Mode A), flattened loot tiers into a per-row `tier` column (retiring `LootTier`
> / `LootEntry`), and noted the interaction with the approved
> [landmark-loot-tables design](2026-06-12-landmark-loot-tables-design.md).

## Problem

The wiki has three parallel "entity" tables — `Item`, `EnvEntity`, `TramplerPart` — that
share an identity core and diverge in their stats and relations. The view layer is **already
unified** (`EntityDetail` shell + `ItemTabs`), but the data layer is not. This causes three
concrete pains (the ones driving this work):

1. **Fragmented Directus editing** — editors juggle three collections with overlapping fields.
2. **Per-page mapping boilerplate** — each `[slug]/page.tsx` hand-maps typed columns into the
   `stats` / `detailRows` / `tabs` shapes `EntityDetail` wants.
3. **Adding a new entity kind is costly** — a 4th type (vehicles, NPCs, …) means a new table,
   a new page, new queries, and new relation tables before it can craft / drop loot / be a cost.

Cross-entity querying (search, `[[slug]]` resolution) was explicitly **not** a pain point, so
the design optimizes for editor/dev ergonomics over query convenience.

## What each entity actually contributes

| Concern | Item | EnvEntity | TramplerPart |
|---|---|---|---|
| Identity (slug, name, description, category, icon, iconFile, sourceUrl) | ✓ | ✓ | ✓ |
| `rarity` | ✓ | — | — |
| Prominent **stats** grid | statType/Value, damage, magazine, ammoName… | — | health, weight, energy*, crewSlots… |
| **Detail** sidebar rows | stack, tier, value, trades | — | research node/name/tier |
| **Relations → tabs** | producedBy, usedIn, lootEntries, tramplerCosts | lootTiers | costEntries |

The render contract (`EntityDetail`) collapses all of this into four shapes: `icon`,
`stats: StatCell[]`, `detailRows: DetailRow[]`, `tabs: Tab[]`. That is the schema the views
actually want; the DB just doesn't speak it.

## Decision: hybrid model

- **Identity → one generic `Entity` table** (with a `kind` discriminator). This is the clear win
  and what cross-entity links/search already pretend exists.
- **Stats → typed, per-kind 1:1 tables** (`ItemStats`, `TramplerStats`). Keeps typed Directus
  field widgets, numeric validation, and `WHERE damage > 100`-style queries. Accepts that adding
  a *stat* still costs a small migration.
- **Tabs → one generic `EntityLink` row table with a fixed *role* catalog.** Every tab that is
  "a list of links to other entities carrying a few columns" — loot, build-cost, ammo, used-by,
  future "related" — becomes rows in a single table, discriminated by `role`. Any entity can have
  any subset of tabs (all, some, or none). Tab *rows* are data (free to add); tab *types* are code
  (a `role` + a renderer). **Recipes are the sole exception** and stay first-class — a recipe is a
  hyper-edge (many inputs + many outputs + shared craft metadata) that can't be shredded into
  independent rows.
- **All relations repoint at `Entity.id`**, so any kind can participate in crafting, loot, and
  costs with **zero new tables**.

This reflects two flexibility-vs-typing decisions, made the same way for both axes:

- **Stats: typed, not EAV.** Rejected fully-generic `Attribute` rows: they maximize "new kind is
  free" but go schemaless on stats (string values, no typed queries/sort, validation in app code,
  generic Directus repeaters instead of field widgets) — too much type-safety lost for a mapping
  that's only ~10 lines per page. A single wide STI table (~25 nullable columns, meaning by
  `category`) was rejected outright.
- **Tabs: fixed catalog (Mode A), not runtime-defined (Mode B).** Rejected CMS-style
  editor-defined tabs: they let editors invent tab types at runtime with zero code, but force a
  generic renderer (uniform tables) that loses the bespoke rendering this project deliberately
  builds — icon grids, the crowns sprite, rarity-ring sorting. New tab *types* are rare here and
  are exactly when a dev should be involved (to decide how the tab looks), so the fixed catalog is
  the better trade.

## Proposed schema

### Core

```prisma
model Entity {
  id          String  @id @default(dbgenerated("(gen_random_uuid())::text"))
  slug        String  @unique
  kind        String  // "item" | "environment" | "trampler-part" | …
  name        String
  description String?
  category    String
  rarity      String?
  icon        String?
  iconFile    String? @db.Uuid
  sourceUrl   String?

  // typed stat extensions (0..1 each, by kind)
  itemStats     ItemStats?
  tramplerStats TramplerStats?

  // recipes — the one first-class, hyper-edge relation (see Relations)
  producedBy   RecipeOutput[]
  usedIn       RecipeInput[]

  // every other tab — generic link rows, discriminated by `role`
  outgoingLinks EntityLink[]   @relation("LinkSource") // tabs shown ON this entity (loot, cost, ammo…)
  incomingLinks EntityLink[]   @relation("LinkTarget") // reverse: where this entity is dropped/used

  @@index([kind])
  @@index([category])
  @@index([rarity])
}
```

### Typed stat extensions (1:1, nullable per kind)

```prisma
model ItemStats {
  entityId       String @id
  entity         Entity @relation(fields: [entityId], references: [id], onDelete: Cascade)
  storageStack   Int?
  workbenchTier  Int?
  statType       String?
  statValue      Int?
  damage         Int?
  playerDamage   Int?
  tramplerDamage Int?
  splashDamage   Int?
  magazine       Int?
  ammoName       String?
}

model TramplerStats {
  entityId           String @id
  entity             Entity @relation(fields: [entityId], references: [id], onDelete: Cascade)
  dimensions         String?
  health             Int?
  weight             Int?
  weightCapacity     Int?
  weightCompensation Int?
  energyConsumption  Int?
  energyCapacity     Int?
  ratedPower         Int?
  crewSlots          Int?
  itemSlots          Int?
  researchNode       String?
  researchName       String?
  researchTier       Int?
}
```

`EnvEntity` had no stats, so it gets no extension table — it is simply an `Entity` with
`kind="environment"` plus its loot rows.

### Relations

**Recipes stay first-class** (a recipe is a hyper-edge: many inputs + many outputs + shared
craft metadata). Only the FK target changes from `Item` → `Entity`:

```prisma
model Recipe {
  id String @id …
  slug String @unique
  workbench String?
  tier Int?
  craftTimeSeconds Float?
  inputs  RecipeInput[]
  outputs RecipeOutput[]
}
model RecipeInput  { …; entityId String; entity Entity @relation(…); amount Int }
model RecipeOutput { …; entityId String; entity Entity @relation(…); amount Int }
```

**Everything else is one generic `EntityLink` table.** Build-cost, ammo, used-by, the flattened
loot list, and any future "related" tab are all the same shape — *source entity → target entity,
carrying a few columns, ordered, grouped by `role`*:

```prisma
model EntityLink {
  id        String  @id …
  sourceId  String              // the entity whose page shows this tab (the container, the part…)
  source    Entity  @relation("LinkSource", fields: [sourceId], references: [id], onDelete: Cascade)
  targetId  String?             // the linked entity (item OR container OR part); null = unresolved
  target    Entity? @relation("LinkTarget", fields: [targetId], references: [id], onDelete: SetNull)
  role      String              // "loot" | "cost" | "ammo" | "related" … (which tab; from the catalog)
  name      String              // display fallback when targetId is null
  amount    Int?                // cost / recipe-style quantity
  tier      String?             // loot drop tier — "Normal" | "Rare" | "Very Rare"
  value1    String?             // free-form loot columns (e.g. "10-20"), as today
  value2    String?
  value3    String?
  sortOrder Int
  @@index([sourceId, role])
  @@index([targetId])
}
```

**Loot flattens into this table** — `LootTier` and `LootEntry` are retired. The per-rarity *tabs*
become a single "Loot" tab whose rows carry a `tier` value (rendered as a badge / grouping), and
the old `LootEntry.itemId` / `containerId` split collapses into one `targetId → Entity` (a unified
`Entity` already covers both items and containers). The fixed per-tier column labels
(`col1Label…`) are dropped; the loot renderer owns the column headings.

**`TramplerPartCost` also folds in** (role `"cost"`, `amount` set). Its `itemId?` + `name`
fallback map directly onto `targetId?` + `name`.

#### Tabs: the fixed role catalog (Mode A)

A small, code-owned registry maps each `role` to a label + a renderer + which columns it uses:

| role | label | target kinds | columns used | renderer |
|---|---|---|---|---|
| `loot` | Loot | item, environment | `tier`, (`value1-3`) | icon grid + tier badge, rarity-sorted |
| `cost` | Build Cost | item | `amount` | icon list with amounts |
| `ammo` | Ammo | item | — | icon list |
| `used-by` | Used By | item | — | icon list |
| `related` | Related | any | — | icon list *(example future tab)* |

Adding a tab *type* = add a row to this registry + (optionally) a renderer. Putting a tab on an
entity = insert `EntityLink` rows — no code, no migration. Recipes (`Crafted by` / `Used in`) are
rendered from `Recipe` directly and slotted into the same `ItemTabs` alongside the link-derived
tabs, so the page sees a uniform `Tab[]`.

## How this resolves each pain

- **Directus de-fragments** — one `Entity` collection for all identity editing; `kind` filters
  the view. Stat extensions are 1:1 related collections shown only for the relevant kind.
- **Page boilerplate shrinks** — a single `getEntityBySlug(slug)` + a shared
  `entityToDetailProps()` mapper replaces three bespoke page bodies. Per-kind stat/detail mapping
  stays typed but lives in one `*-view.ts` per kind, selected by `kind`.
- **New kind is (almost) free** — a new `kind` reuses `Entity`, `Recipe`, and `EntityLink` with
  no new tables, and can immediately have any catalog tab. It only needs a stat extension table
  **if** it has prominent stats; many kinds (like `environment`) need none.
- **Loot editing is one flat tab** — the per-rarity tab juggling disappears; an editor adds loot
  rows with a `tier` dropdown in a single inline list on the owning entity.

## What we are explicitly trading away

- Adding a **stat** (not a kind) still needs a migration on the relevant extension table.
- A second join is needed to load stats (`Entity` + `ItemStats`). Acceptable: detail pages load
  one entity at a time; list pages can select only the columns they show.
- Adding a brand-new **tab type** (not a tab instance) needs a code change — a `role` entry +
  renderer. This is the deliberate Mode A trade; tab *instances* on entities stay pure data.
- `EntityLink.value1/2/3` and `tier` stay strings — no typed query/sort across loot columns
  (unchanged in spirit from today's `LootEntry`).

## Interaction with the approved landmark-loot-tables design

The [landmark-loot-tables design](2026-06-12-landmark-loot-tables-design.md) (approved, ready for
implementation) builds on the *current* `LootTier` / `LootEntry` tables — adding `containerId`,
`lootCurated`, and nested Directus editing. This redesign **changes that substrate**: loot moves
into `EntityLink`. Two paths, to be decided before either is built:

- **Ship landmark-loot first, migrate later** — implement it on `LootTier`/`LootEntry` as
  approved, then fold those into `EntityLink` as part of this migration. Lowest risk; some rework.
- **Supersede it** — implement landmark loot directly on the unified model. The three concerns
  carry forward intact: `containerId`→`targetId` (already unified), `lootCurated` becomes a flag on
  `Entity`, and the seed's loot-skip logic keys off `role="loot"` rows instead of `LootTier`.

Either way the *features* (container entries, curated-loot seed protection, friendly nested
editing) are preserved — only their substrate changes.

## Migration shape (high level, for later planning — not part of this design's approval)

1. Create `Entity` + `ItemStats` + `TramplerStats` + `EntityLink`; backfill from the existing
   tables (identity → `Entity`, stat columns → extension tables, `TramplerPartCost` → `EntityLink`
   role `"cost"`, `LootEntry` → `EntityLink` role `"loot"` with `tier` from its `LootTier`).
2. Repoint `RecipeInput/Output.itemId` to `entityId → Entity`.
3. Update seed/import scripts (`import-tramplers.mjs`, etc.) and queries to the unified shape.
4. Drop `Item` / `EnvEntity` / `TramplerPart` / `TramplerPartCost` / `LootTier` / `LootEntry`.

The Directus reconfiguration and the import-script rewrite are the largest pieces and should be
sized in the implementation plan.

## Open questions for implementation planning

- Resolve the landmark-loot sequencing above (ship-first vs supersede).
- Should the loot renderer still group rows visually by `tier`, or show one sorted grid with a
  per-icon tier badge? (Rendering-only; doesn't affect schema.)
- Do list/index pages need a denormalized stat or two on `Entity` (e.g. `workbenchTier`) to avoid
  the extension join when filtering catalogs?
