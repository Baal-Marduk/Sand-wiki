# Wiki Revision — Consume Real Scraper Data — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design); pending written-spec review
**Audience:** the sand-wiki effort (branch `build/sand-wiki-impl`). This is a **handoff spec** — the
scraper side is frozen; this describes changes the wiki should make to consume the scraper's output.
**Related:**
- Scraper output + findings: `docs/superpowers/findings/2026-06-08-sand-bundle-schema.md`
- Scraper design: `docs/superpowers/specs/2026-06-08-sand-scraper-design.md`

## 1. Why

The wiki was designed around data that the game files do not contain. The `sand-scraper` tool now
produces a faithful dataset, but its shape differs from the wiki's current seed contract, and the
wiki's tech-tree feature has no data source. This spec revises the wiki's **data model, seed, and the
item/tech pages** to consume the real data.

## 2. The data the wiki must consume

The scraper emits a single `data.json` (`SEED_FILE`), shape:

```jsonc
{
  "meta": { "gameVersion": "unknown", "scrapedAt": "...", "sourceBundles": [...] },
  "items": [
    { "slug": "shotgun", "id": "item_shotgun", "name": "Shotgun",
      "type": "WEAPON", "isResource": false, "storageStack": 100000,
      "workbenchTier": null, "fromCatalog": true }
  ],
  "recipes": [
    { "slug": "old-jacket", "workbench": "Utility", "tier": 1, "craftTimeSeconds": 5.0,
      "inputs":  [{ "item": "<item slug>", "amount": 2 }],
      "outputs": [{ "item": "<item slug>", "amount": 1 }] }
  ]
}
```

Real volume: **123 items, 34 recipes**, 0 dangling references (every recipe `item` slug exists in
`items`). Recipes can have **multiple inputs and multiple outputs**, output `amount` may be > 1, and a
single item may be produced by more than one recipe. `type` has 19 distinct values (see §4).
`fromCatalog: false` items are recipe-referenced stubs (`type` null, `storageStack` null).

There is **no `techNodes`** key.

## 3. Data model (Prisma) — revised

Replace the recipe + tech models with a proper Recipe entity:

```prisma
model Item {
  id            String  @id @default(cuid())
  slug          String  @unique
  name          String
  description   String?            // not in game data; community/manual, nullable
  category      String             // mapped from scraper `type` (see §4)
  isResource    Boolean @default(false)
  storageStack  Int?               // from scraper; null for stubs
  workbenchTier Int?               // denormalized: lowest tier of recipes producing it (filterable)
  imageAlt      String?            // manual; no extracted assets

  producedBy    RecipeOutput[]
  usedIn        RecipeInput[]

  @@index([category])
  @@index([workbenchTier])
}

model Recipe {
  id               String  @id @default(cuid())
  slug             String  @unique
  workbench        String?           // e.g. "Utility", "Armament" (from recipe bundle name)
  tier             Int?              // workbench tier
  craftTimeSeconds Float?            // game value is a float (e.g. 2.0)
  inputs           RecipeInput[]
  outputs          RecipeOutput[]
}

model RecipeInput {
  id       String @id @default(cuid())
  recipeId String
  recipe   Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  itemId   String
  item     Item   @relation(fields: [itemId], references: [id], onDelete: Cascade)
  amount   Int
  @@index([itemId])
  @@index([recipeId])
}

model RecipeOutput {
  id       String @id @default(cuid())
  recipeId String
  recipe   Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  itemId   String
  item     Item   @relation(fields: [itemId], references: [id], onDelete: Cascade)
  amount   Int
  @@index([itemId])
  @@index([recipeId])
}
```

**Removed:** `Item.workbenchLevel`, `Item.craftTimeSeconds`, `Item.unlockConditions`,
`Item.unlockedById`/`unlockedBy`, and the entire `TechNode` / `TechCost` / `TechPrerequisite` family.
A Prisma migration drops those tables/columns and adds `Recipe` / `RecipeInput` / `RecipeOutput` plus
the new `Item` columns.

## 4. `type → category` mapping

Lives in the wiki seed (or `taxonomy.ts`), mapping the scraper's `type` to the wiki's existing item
categories (`weapons, guns, resources, attire, tools, medical, ammo, misc`). Approved defaults:

| game `type` | category | | game `type` | category |
|---|---|---|---|---|
| WEAPON, WEAPON_BELT | guns | | ARMOR, BACKPACK | attire |
| AMMO, TURRET_AMMO | ammo | | UTILITY_CONSUMABLE | tools |
| RESOURCE_T1, RESOURCE_T2, RESOURCE_T3 | resources | | FOOD | medical |
| ENERGY | resources | | KEY, MONEY, LARGE_VALUABLE, SMALL_VALUABLE | misc |
| ATTACK_CONSUMABLE, RAID_EXPLOSIVES | weapons | | *(stub / null type)* | misc |

- An unmapped/unknown `type` falls back to `misc` (and the seed should `console.warn` it, so new game
  types after a patch are visible rather than silently bucketed).
- **Optional (wiki taxonomy call):** introduce dedicated categories `explosives`, `consumables`,
  `valuables` instead of folding them into weapons/tools/misc. Not required for v1.

## 5. Seed rewrite (`prisma/seed.ts`)

Reads the scraper `data.json` (`SEED_FILE`, default to a committed snapshot). Order:
1. Clear in FK-safe order: `recipeInput`, `recipeOutput`, `recipe`, `item`.
2. Insert all `items`, applying the §4 mapping for `category`; copy `isResource`, `storageStack`,
   `workbenchTier`. (`description`/`imageAlt` left null unless a manual overlay is provided.)
3. Insert each `recipe` (slug, workbench, tier, craftTimeSeconds), then its `inputs`/`outputs` linking
   to items **by slug** (build a slug→id map after step 2).
4. No tech seeding.
5. Log counts (items, recipes, input/output links) and any unmapped-type warnings.

The seed must validate that every recipe `item` slug resolves (it will, by scraper construction);
fail loudly if not.

## 6. Pages

- **`/items` (list):** filter by `category` and by `workbenchTier`; search by name; sort. (Drop the
  old workbench-level/required-resource filters that assumed the previous model; "uses resource"
  can be re-expressed via `RecipeInput` if desired, optional.)
- **`/items/[slug]` (detail):** show item facts (category, isResource, storageStack, workbenchTier);
  **"Crafted by"** = every `Recipe` whose `outputs` include this item, each rendering its inputs
  (item + amount), outputs (item + amount, since recipes can yield multiples/by-products),
  `craftTimeSeconds`, and `workbench`/`tier`; **"Used in"** = recipes whose `inputs` include this item.
  Replaces the single `recipe` list.
- **`/tech`:** convert to a `placeholder` section (same pattern as `environment`/`tramplers`) stating
  the tech tree is not available from current game data. Remove the React-Flow graph, the table, and
  the cost calculator. Update `taxonomy.ts` `tech` entry from `kind: "link"` to `kind: "placeholder"`.
- **Tools / calculator:** the tech-tree cost calculator is removed. If `/tools` hosted only that,
  make it a placeholder; otherwise leave other tools intact.
- **About / data page:** note the dataset is scraped from a playtest build; display names are derived
  from internal ids; tech tree / contracts / loot are not yet available; `gameVersion` may be "unknown".

## 7. Testing (wiki side)

- Unit: the `type → category` mapping (including unknown → misc + warning) and any pure
  recipe-grouping helper for the detail page ("crafted by" / "used in").
- The seed runs against the real `data.json` without error and produces 123 items / 34 recipes.
- E2E/axe: items list filters by category/tier; an item detail page renders multiple "crafted by"
  recipes (pick an item produced by >1 recipe) and "used in"; `/tech` renders the placeholder.

## 8. Out of scope

- Changing the scraper. The mapping and grouping live wiki-side.
- Tech tree, delivery contracts, loot tables, equipment stats, real localized names — all absent from
  the data (see findings doc). Carried as documented gaps, not built.

## 9. Handoff / data delivery

The scraper writes `out/data.json`; a reviewed snapshot is copied into the wiki (e.g.
`sand-wiki/prisma/data.json`) and seeded via `SEED_FILE`. Re-run the scraper after each game patch and
re-seed; the output is stable-sorted for clean diffs.

## 10. Open items for the wiki effort

- Confirm or adjust the ⚠️ category mappings in §4, or expand the taxonomy (explosives/consumables/valuables).
- Decide whether to keep a "uses resource" filter (now via `RecipeInput`) on the items list.
- Decide the fate of `/tools` if it only hosted the tech calculator.
