# Loot Ingestion Pipeline — Design

**Date:** 2026-06-17
**Branch:** `feat/loot-ingestion-pipeline`
**Status:** Approved design, pending implementation plan

## Goal

Make it easy to re-ingest datamined loot data into the sand-wiki on every game
update, with the scrape as the authoritative source of truth, and render the
richer loot data (drop chance, voyage/storm quantities) on the site. Build the
loot pipeline end-to-end now, with conventions deliberately designed so adding
the next dataset (items, recipes, tech) is copy-adapt, not redesign.

## Decisions (from brainstorming)

1. **Scope:** Loot containers now; conventions built for reuse later.
2. **Reconciliation:** Apply scraped data authoritatively — do **not** preserve
   live-DB contributor edits. The DB is disposable/rebuildable.
3. **Corrections home:** Version-controlled override files applied at *convert*
   time (in `sek/`), so the canonical artifact landing in `sand-wiki` is already
   corrected and the DB is fully replayable from git.
4. **Workflow:** One command loads to **dev** first; a separate explicit command
   promotes to **prod**.
5. **Repo boundary (approach A):** SEK converters write a committed canonical
   JSON into `sand-wiki/prisma/`; a wiki-side TS loader applies it. The git diff
   of the artifact is the per-update review surface.
6. **UI:** In scope. The loot table must render chance + voyage/storm + the storm
   bonus. Visual design done via the frontend-design skill during implementation.

This supersedes the prior "never reseed live DB / preserve curated" posture **for
loot**: that rule existed because reseeding wiped contributor edits. Once
corrections live in version control, a full overwrite is safe. See Transition.

## Architecture & data flow

```
GAME UPDATE
  │
  ├─ ① EXTRACT (existing, sek/, Python — UPDATE_PIPELINE.md)
  │     refresh gamefiles copy → run extractors
  │     → sek/.../site/src/data/loot_sources.json  (+ items.json)
  │
  ├─ ② CONVERT + CORRECT (sek/, Python)   ← build_container_loot.py
  │     loot_sources.json + items.json
  │       + datamine/overrides/loot-overrides.json   (committed corrections)
  │     → CANONICAL artifact: sand-wiki/prisma/loot-containers.json  (committed)
  │
  └─ ③ LOAD (sand-wiki/, TypeScript)   ← prisma/load-loot-containers.ts
        reads prisma/loot-containers.json
        → full-overwrite the 12 container entities + their loot EntityLinks
          in the target DB (idempotent, re-runnable)
```

Two boundary rules:
- **Corrections applied at stage ②, in `sek/`.** The hard-coded `ALIAS` /
  `KNOWN_LIVE_SLUGS` in `build_container_loot.py` move into a committed
  `overrides/loot-overrides.json`. The wiki loader is a pure applier.
- **Canonical artifact committed in `sand-wiki/prisma/`** (alongside
  `env-content.json`, `key-progression.json`). Its diff is the review surface.

## Components

### ② `build_container_loot.py` (exists, to extend)
- Inputs: `loot_sources.json`, `items.json`, `overrides/loot-overrides.json`.
- Effort-union merge (low/mid/high → Tier 1/2/3); mob-type sections kept; storm
  bonus computed. (Already implemented.)
- Replace inline `ALIAS`/`KNOWN_LIVE_SLUGS` with the override file.
- Output: write to `../../sand-wiki/prisma/loot-containers.json` with a `meta`
  header `{ source, gameBuild, containers }`.

### Override file — `sek/.../datamine/overrides/loot-overrides.json` (new)
```jsonc
{
  "itemSlugAliases": {
    "item_medkit": "med-kit",
    "item_weirdCoral": "resource-weird-coral",
    "game_coinCrownPile_10": "coin-crown",
    "game_ValuablePiles01_mobDrop": "small-valuables",
    "item_rifleMusketClip": "repeater-rifle-quick-reload"
  },
  "knownLiveSlugs": ["resource-weird-coral"],
  "containerOverrides": {}        // future per-container name/icon fixes
}
```

### Canonical artifact — `sand-wiki/prisma/loot-containers.json` (new, committed)
```jsonc
{
  "meta": { "source": "loot_sources.json", "gameBuild": "<tag>", "containers": 12 },
  "containers": {
    "weapons-crate": {
      "name": "Weapons Crate", "icon": "containers/weapons_crate.png",
      "category": "loot-containers",
      "tiers": [ { "tier": "Tier 1", "rollSets": 4, "loot": [
        { "slug": "resource-scrapped-ammo", "name": "Resource Scrapped Ammo",
          "chance": 100, "voyage": "15-40", "storm": "20-55",
          "stormBonus": 1.36, "moreInStorm": true } ] } ]
    }
  }
}
```

### ③ Loader — `sand-wiki/prisma/load-loot-containers.ts` (new)
Models `load-key-progression.ts`. Behavior:
- Resolve every `slug` to an Entity id up front; **fail loud** on any missing
  non-null slug (catches items a new build adds before they exist in the wiki).
- **Upsert** the container entities (`kind:"environment"`,
  `category:"loot-containers"`, name + icon) — full overwrite, no lock-map /
  `lootCurated` checks.
- **Delete + recreate** each container's `role:"loot"` EntityLinks:
  `tier`→tier label, `targetId`→item, `value1`→chance, `value2`→voyage,
  `value3`→storm, `sortOrder`→tier rank × 1000 + entry order.
- **Prune** `loot-containers` entities absent from the artifact (full sync).
- Touches only `loot-containers` entities + their loot links. Idempotent.
- Prints a summary: upserted / links created / pruned.

### Workflow / npm scripts
- `loot:build` → run the Python converter, write `prisma/loot-containers.json`.
- `loot:update` → `loot:build` + load against **dev** (`DATABASE_URL`).
- `loot:promote` → load against **prod**, gated by an explicit
  `LOOT_TARGET=prod` / `--prod` reading a separate prod URL var, so it cannot
  fire by accident.

## UI update (in scope)

Functional requirements; visuals via the frontend-design skill at implementation.
- **Data plumbing:** extend `LinkRow` (`src/lib/entity-links.ts`) and
  `lootEntryView` (`src/lib/loot.ts`) to carry `value1/2/3`; derive
  `stormBonus`/`moreInStorm` in the view layer (`s_avg / v_avg`).
- **Container view** (`src/app/environment/[slug]/page.tsx` +
  `src/components/LootTable.tsx`): replace the icon-only grid with a per-tier
  table — item (icon + name + rarity), **chance %**, **voyage qty**,
  **storm qty**, storm-bonus visually flagged; `rollSets` shown as tier context.
- **Reverse view** (`src/components/CrateDropList.tsx`, item pages): optionally
  surface chance/amount next to "which crates drop this".
- **Tier ordering:** generalize the hard-coded `TIER_ORDER`
  (`Normal/Rare/Very Rare`) so `Tier 1/2/3`, `Melee mob`, `Drops` sort sensibly.
- **Backward compatible:** scraped envs with only `value1` still render;
  chance/voyage/storm simply empty.

## Extensibility conventions (the reusable template)

Each future dataset is a `build_X.py` → `prisma/X.json` → `load-X.ts` triple:
- converter in `sek/` merges scrape + a committed `overrides/X-overrides.json`;
- canonical artifact committed in `sand-wiki/prisma/` with a `meta` header;
- full-overwrite, fail-loud, idempotent loader scoped to that dataset;
- `X:build` / `X:update` (dev) / `X:promote` (prod) npm scripts.

## Testing

- **Python:** unit test the converter merge — effort-union, storm-bonus math,
  override application.
- **Loader:** vitest (cf. `loot-resolution.test.ts`) — slug resolution,
  full-overwrite idempotency, prune, fail-loud on missing slug.
- **UI:** render test for the loot table — chance/voyage/storm present,
  storm-bonus flag, empty-value fallback.

## Transition / one-time concerns

- **Capture existing live-DB edits before first prod promote.** Any valuable
  applied contributor edits on loot containers should be exported (recoverable
  from the `Proposal` table) into `overrides/loot-overrides.json` first, since
  the loader will overwrite loot for all containers.
- The contributor/suggestion system is **left in place** but out of the loot
  loader's path; whether to retire it more broadly is a later decision.
- Verify all 12 container slugs and their loot item slugs exist in the target DB
  (dev currently resolves 100% incl. the `resource-weird-coral` allowlist).

## Out of scope

- Other datasets (items, recipes, tech) — only the conventions are established.
- Retiring the contributor/Proposal subsystem.
- Automatic prod application without the dev review step.
```
