# Trampler Parts Import — Design

**Date:** 2026-06-10
**TODO item:** "Import trampler parts from wiki" (TODO.md line 1)
**Status:** Approved, pending implementation plan

## Goal

Build a full **Tramplers** section in sand-wiki (parallel to Items and Environment),
populated from the game wiki's trampler component pages. The imported data must be
**tech-tree-ready** so a later TODO can build a tech tree on top of it without a re-import.

## Source data

The wiki (`sandgame.wiki`) has ~130 pages under `Category:Trampler Components` (its
subcategories `Crew Compartments` / `Driving Compartments` / `Reactors` are empty/structural
and are NOT used). Each page carries a consistent `{{Module}}` infobox:

```
{{Module
| name = KF-B "Hole" Middling Chassis
| image = KF-B "Hole" Middling Chassis.png
| dimensions = 4x3
| research = II(b). Middling Chassis {{Tag Tier2}}
| weight_capacity = 25000
| energy_consumption = 5
| cost 1 = 75      <- Crowns (currency)
| cost 2 = 200     <- Mechanical Parts   (item slug resource-metal-t1)
| cost 3 = 0       <- Pneumatic Parts    (item slug resource-metal-t2)
| cost 4 = 0       <- Computing Module   (item slug resource-metal-t3)
}}
<blockquote>flavor / description text</blockquote>
[[Category:Trampler Components]]
```

Field presence (from a sample of pages): `name`, `image`, `dimensions`, `research`,
`cost 1..4` are always present. `weight` and `health` on most. `energy_consumption`,
`rated_power`, `energy_capacity`, `crew_slots`, `weight_capacity`, `weight_compensation`,
`item_slots` are type-specific (per the `Template:Module` definition).

These components are **wiki-only** — they do NOT appear in the scraper's `data.json`
(which holds player items). So this mirrors the Environment pipeline (pure wiki import),
not the Items pipeline (scraper + wiki enrichment merge).

## Architecture (mirrors the Environment section end-to-end)

`import-tramplers.mjs` (wiki) -> `prisma/tramplers.json` -> `seed.ts` -> `TramplerPart` model
-> `queries.ts` -> `/tramplers` list + `/tramplers/[slug]` detail.

### 1. Prisma model — `TramplerPart`

```prisma
model TramplerPart {
  id          String  @id @default(cuid())
  slug        String  @unique
  name        String
  category    String   // functional group (see §3)
  description String?
  icon        String?
  sourceUrl   String?

  dimensions         String?  // "4x3"
  health             Int?
  weight             Int?
  weightCapacity     Int?
  weightCompensation Int?
  energyConsumption  Int?
  energyCapacity     Int?
  ratedPower         Int?
  crewSlots          Int?
  itemSlots          Int?

  // tech-tree linkage, parsed from `research = II(b). Middling Chassis {{Tag Tier2}}`
  researchNode String?  // "II(b)"
  researchName String?  // "Middling Chassis"
  researchTier Int?     // 2

  // build cost — JSON array referencing existing item slugs
  cost Json?   // [{ slug, name, amount }]  (Crowns / Mechanical Parts / Pneumatic Parts / Computing Module)

  @@index([category])
  @@index([researchTier])
}
```

**Decisions:**
- Dedicated model (not folded into `Item` or `EnvEntity`) — the module shape (dimensions,
  crew slots, multi-resource cost, research linkage) is distinct, and a separate model keeps
  Item/Env queries clean.
- `cost` as **JSON** (`[{slug, name, amount}]`), not a relational table. Only 4 fixed
  resources are ever referenced; JSON is simpler and still joinable by slug. (Relational
  `TramplerPartCost` was considered and rejected as over-engineered for this pass.)

**Tech-tree readiness:** `researchNode` + `researchName` + `researchTier` capture each part's
research entry; `cost` references real item slugs so the tree can compute unlock costs and
group parts by research node later.
**Known limit:** the infobox gives per-part research *labels*, not the *edges* (which node
unlocks which). That graph is not on these pages and would be sourced separately in the
tech-tree TODO. We store everything that is available now.

### 2. Importer — `prisma/import-tramplers.mjs`

One-off importer modeled on `import-env-content.mjs`:

- Fetch members of `Category:Trampler Components` via the MediaWiki API (`categorymembers`,
  ns 0, paginated — reuse the `members()` / `wikitext()` helpers' shape).
- Parse each `{{Module}}` infobox with a new helper `parseModule(wikitext)` added to
  `wiki-text.mjs` (returns a flat object of the fields above). Strip the `<blockquote>` as the
  description via the existing `stripWikiMarkup`.
- Parse `research` -> `{ node, name, tier }`:
  - `node` = leading token before the first `.` (e.g. `II(b)`), `name` = remainder text,
  - `tier` = integer from `{{Tag TierN}}`.
- Map `cost 1..4` -> `[{ slug, name, amount }]`, dropping zero-amount entries. Resolve names
  (Crowns, Mechanical Parts, Pneumatic Parts, Computing Module) to item slugs by reusing the
  `data.json` + `wiki-overrides.json` name->slug resolver from `import-env-content.mjs`.
  If a cost name does not resolve, keep `{ name, amount }` without a slug and log it.
- **Download module images**: for each `image` field, hit the `imageinfo` API for the original
  URL, download into `public/tramplers/`, store `/tramplers/<file>` in `icon`. (The env pipeline
  has no image downloader; this is a small new addition.) Skip + log on failure.
- Slug via the existing `titleToSlug`.
- Write `prisma/tramplers.json`, slug-keyed and sorted. Log counts: parts per category,
  any uncategorized (-> `structure`), and any unresolved cost names.

### 3. Categorization — `src/lib/taxonomy.ts`

Add the `tramplers` section's 9 functional categories and a deterministic
`tramplerCategoryForName(name)` with **ordered** keyword rules (specific before generic):

| Category    | Matches (case-insensitive, first match wins)            |
|-------------|---------------------------------------------------------|
| `chassis`   | Chassis                                                 |
| `reactors`  | Reactor (incl. Motor-Reactor)                           |
| `engines`   | Engine                                                  |
| `crew`      | Crew Cabin, Crew Module, Captain, Cabin                 |
| `driving`   | Steering Deck, Flybridge, Pilot Bridge, Wheelhouse      |
| `cargo`     | Cargo                                                   |
| `turrets`   | Turret Deck, Armor Plate, Embrasure, Battering Ram, casemate |
| `stations`  | Workbench, Workshop                                     |
| `structure` | fallback (Deck, Frame, Balcony, Stairs, Corridor, Vestibule, Entrance, …) |

Rule order must place specific keywords before generic ones (e.g. "Turret Deck" before
"Deck", "Crew Cabin" before "Cabin"). Add `isTramplerCategory(slug)` and the category labels.
Flip the `tramplers` section from `kind: "placeholder"` to `kind: "data"` with these
categories, and add accent colors to `CATEGORY_COLORS`.

### 4. Seed — `prisma/seed.ts`

Add, mirroring the existing env block:
- read `prisma/tramplers.json`,
- `await prisma.tramplerPart.deleteMany()` in the delete phase,
- a create loop validating `isTramplerCategory(category)` (warn + skip unknown),
- include the trampler count in the final summary log line.

### 5. UI — mirror Environment

- `src/lib/queries.ts`: `listTramplerParts(category?)`, `getTramplerPartBySlug(slug)`,
  `tramplerCategoryCounts()` — direct analogues of the env queries.
- `src/app/tramplers/page.tsx`: replace `SectionPlaceholder` with the category-grid +
  filtered-list layout from `environment/page.tsx` (reuse `CategoryIcon`, the card grid;
  a small `TramplerCard` analogous to `EnvCard`).
- `src/app/tramplers/[slug]/page.tsx`: detail page —
  - header + image,
  - a stat grid (`dl` like `StatBox`) for dimensions / health / weight / weight capacity /
    energy consumption / energy capacity / rated power / crew slots, rendering only present fields,
  - a **Research** line: `researchNode · researchName · Tier N`,
  - a **Build Cost** list: item icon + name + amount per cost entry (reuse `ItemIconLink`,
    linking resolved slugs to their item pages),
  - source link to the wiki page.

## Out of scope (this pass)

- Search autocomplete for trampler parts — deferred, consistent with env entities not being
  searchable yet (TODO #10 covers adding env to search; tramplers can join then).
- The tech-tree graph/edges — TODO "Tech Tree" (`tech` section).

## Testing

- Unit tests in `wiki-text.test.ts` (or a sibling) for `parseModule`, the `research` parser,
  and the `cost` mapping — following the existing `wiki-text.test.ts` style.
- `taxonomy.test.ts` cases for `tramplerCategoryForName` covering each category + the
  specific-before-generic ordering (e.g. "S.Trs Turret Deck" -> `turrets`, not `structure`).
- Importer + seed are exercised by running against the live wiki snapshot and checking the
  logged category/cost-resolution counts.

## Files touched

New:
- `prisma/import-tramplers.mjs`
- `prisma/tramplers.json` (generated)
- `public/tramplers/*.png` (downloaded)
- `src/app/tramplers/[slug]/page.tsx`
- `src/components/TramplerCard.tsx`

Modified:
- `prisma/schema.prisma` (add `TramplerPart` + migration)
- `prisma/seed.ts`
- `prisma/wiki-text.mjs` (add `parseModule` + research/cost parsing)
- `prisma/wiki-text.test.ts`
- `src/lib/taxonomy.ts` + `src/lib/taxonomy.test.ts`
- `src/lib/queries.ts`
- `src/app/tramplers/page.tsx`
