# Tech-tree data layer — design

**Date:** 2026-06-13
**Branch:** `feat/tech-tree-data` (off `master`, isolated from the in-flight `feat/ui-redesign`)
**Status:** approved design, pre-implementation

## Goal

Capture the in-game Trampler research/tech tree as structured data so a later feature can
(1) reproduce the tree visually and (2) compute the **total cost to reach any node**. This
spec covers the **data layer only** — schema, ingestion, and verification. No UI, no API/query
helpers, no calculator code.

## Source material

Two screenshots provided by the user:

- **Image 1** — category-grouped view (5099×9607). Rows = in-game categories (Tools, Cabins,
  Stairs, Engines, Chassis, Cannons, Decks, Cargo, Small Arms Armor, Turret Decks, Steering,
  Workshop, Entrances). Tiny text; used mainly to assign each node a **category** and to fill
  gaps image 2 can't resolve.
- **Image 2** — faction/tier view (15309×5092, more legible). Three horizontal bands = the three
  research factions, four columns = tiers I–IV. This is the **master source** for faction,
  tier, research-point cost, prerequisite edges, and research-material ("+box") costs.

Faction ↔ lane-letter mapping confirmed from image 2:

| Lane | Faction | Rep number shown |
|------|---------|------------------|
| (a)  | Godlewski's Expedition | 5 |
| (b)  | Kaiser's Friends | 13 |
| (c)  | K.K. Landwehr | 4 |

> The `5/13/4` numbers are faction-level (likely reputation level); their exact meaning is
> flagged for user verification and stored as faction metadata, not per node.

### Extraction is OCR + user verification

Per decision: I OCR the images into a **draft** plus a **review doc**; the user verifies/corrects
before anything is committed to the database. Numbers and edges I cannot read confidently are
explicitly flagged rather than guessed.

## What already exists (do not rebuild)

- **Unified `Entity` model** (`kind` ∈ `item | environment | trampler-part`) with per-kind stats
  sub-tables (`ItemStats`, `TramplerStats`) and a flexible `EntityLink` join (`role`, `name`,
  `amount`, `tier`, `value1..3`, `sortOrder`).
- **120 trampler parts** in `prisma/tramplers.json`; 98 carry wiki-derived
  `researchNode` (e.g. `II(b)`), `researchName`, `researchTier`.
- **Build cost** is already persisted as `EntityLink role:"cost"` rows per entity
  (`targetId` = resource entity, or `null` for Crowns; `name`, `amount`, `sortOrder`).
  Existing scraper-owned link roles: `"loot"`, `"cost"`.
- Items (`kind:"item"`) such as Energy Rod, MedKit, grenades exist as entities — though some
  referenced by the tree may be missing.

> Known conflict: the wiki-authored lane letters in `tramplers.json` disagree with image 2 for
> several nodes (e.g. "Wooden Decks"/"Cargo Deck" are tagged `(a)` but are in-game Kaiser `(b)`).
> **Images win.** Every conflict is surfaced in the review doc.

## Data model (chosen: Approach 1 — Entity + stats + links)

A tech node is a first-class object because **the node, not the item, is the unit of unlock cost**
(e.g. "Wooden Decks (multiple)" unlocks 7 parts for one research cost; edges connect nodes).

### Schema change (one migration)

New kind-specific stats sub-table, mirroring `ItemStats`/`TramplerStats`:

```prisma
model TechNodeStats {
  entityId     String  @id
  entity       Entity  @relation(fields: [entityId], references: [id], onDelete: Cascade)
  faction      String  // "godlewski" | "kaiser" | "landwehr"
  tier         Int     // 1–4
  researchCost Int?    // research points to unlock the node
  sortOrder    Int?    // within-tier display ordering (for later layout)

  @@index([faction])
  @@index([tier])
}
```

Add the back-relation `techNodeStats TechNodeStats?` to `Entity`. A node is
`Entity(kind:"tech-node")`; `Entity.category` holds the image-1 category. Faction display names
and the rep numbers live as a constant in `src/lib/taxonomy.ts` (faction-level), not in the DB.

### New `EntityLink` roles

| role | source → target | extra fields | meaning |
|------|-----------------|--------------|---------|
| `tech-unlocks` | node → part/item | `sortOrder` | entities the node grants |
| `tech-prereq` | node → prerequisite node | `sortOrder` | the connector edges = the cost graph |
| `tech-research-cost` | node → item | `amount` | "+box" research-material cost to unlock |

Research **points** are the scalar `TechNodeStats.researchCost`. "Total cost to reach X" (built
later) = transitive closure over `tech-prereq`, summing `researchCost` (and optionally aggregating
`tech-research-cost` items and per-part build costs).

### Node identity

Slug = `tech-<faction>-t<tier>-<kebab-name>`, e.g. `tech-godlewski-t1-crew-room`.

## Workflow

1. **Extract** → draft `prisma/tech-tree.json`, node-keyed:
   ```jsonc
   "tech-godlewski-t1-crew-room": {
     "slug": "tech-godlewski-t1-crew-room",
     "name": "Crew Room",
     "faction": "godlewski",
     "tier": 1,
     "category": "Cabins",
     "researchCost": 700,
     "sortOrder": 1,
     "unlocks": ["medkit"],                 // resolved part/item slugs (best-effort)
     "unlocksRaw": ["MedKit"],              // verbatim names as read, for review
     "prereqs": ["tech-godlewski-t1-..."],  // prerequisite node slugs
     "researchCostItems": [{ "slug": "...", "name": "...", "amount": 2 }],
     "buildCostGaps": []                    // parts whose role:"cost" links are empty
   }
   ```
2. **Review doc** → `prisma/tech-tree-REVIEW.md` listing, for user sign-off:
   - every low-confidence number (research cost, amounts) with the image region it came from,
   - every node whose faction/lane/tier **conflicts** with existing `tramplers.json`,
   - every `unlocksRaw` name with **no matching** item/part entity (the "missing items"),
   - ambiguous unlock matches (same-named nodes across tiers/factions) for confirmation.
   Unlock→entity matching is **best-effort by name**; ambiguous/unmatched go to this list.
3. **Ingest** (after user verification) — a seeding step following the `import-tramplers` pattern
   (JSON → upsert): create/upsert `tech-node` entities + `TechNodeStats`, and recreate the three
   link roles (scraper-owned → delete + recreate, matching existing seed convention). Also **fill
   missing `role:"cost"` build-cost links** on parts/items where empty, from verified image data.

## Reconciliation policy

Existing `TramplerStats.researchNode/researchName/researchTier` are left untouched (harmless
denormalized hints). The new tech-node graph is the source of truth. Conflicts are not silently
overwritten — they are reported in the review doc for the user's call.

## Verification

- `prisma validate` passes; the migration applies cleanly to the dev DB.
- Ingest assertion: every `tech-prereq` and `tech-unlocks` target resolves to an existing entity;
  no orphan edges; no node missing `faction`/`tier`.
- Report counts (nodes, edges, unlocks, filled build-cost links) and diff them against the
  review doc totals.

## Out of scope

- Tech-tree UI / visual graph (overlaps in-flight `feat/ui-redesign`).
- API routes, query helpers, the cost calculator implementation.
- Directus collection configuration for the new stats table (handled separately if/when needed).
- A faction lookup table (faction metadata stays a code constant for now).

## Risks

- **OCR accuracy** — mitigated by the verify-before-commit gate and explicit low-confidence flags.
- **Edge completeness** — connector lines in image 1 are faint; image 2 is the primary edge
  source and gaps are flagged rather than invented.
- **Missing item entities** — surfaced in the review doc; the user adds them (or confirms the
  node grants a part already present) before ingest links resolve.
