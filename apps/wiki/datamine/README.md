# datamine — loot ingestion chain

Self-contained scripts that turn SAND's datamined loot into the wiki's canonical
loot artifact (`prisma/loot-containers.json`), which `prisma/load-loot-containers.ts`
then loads into the database. The scrape is authoritative; corrections live in
`overrides/loot-overrides.json`, never in the DB.

## Layout

```
datamine/
  scripts/
    dump_bundle_json.py        # generic: dump a Unity bundle's MonoBehaviour typetrees -> json
    odin_parser.py             # Odin-serialized blob decoder (dependency of extract_loot_spawners)
    extract_loot_spawners.py   # EPB loot spawners (table ids + chances) -> extracted/json/entity_loot.json
    build_loot_sources.py      # entity_loot + loot tables -> data/loot_sources.json
    build_container_loot.py    # loot_sources + items + overrides -> ../prisma/loot-containers.json
    test_build_container_loot.py
  overrides/loot-overrides.json  # item-id aliases, container slug remap, exclusions, names
  data/                          # committed convert INPUTS (so convert->load runs without re-extraction)
    loot_sources.json
    items.json
  extracted/                     # gitignored: intermediate extraction output
  gamefiles/                     # gitignored: a COPY of the game's Sand_Data (never the live install)
```

## Two halves

### 1. Convert -> load (runnable from this repo, no game files)
The committed `data/loot_sources.json` + `data/items.json` are the inputs, so you can
regenerate the artifact and load it any time:

```bash
# from sand-wiki/
npm run loot:build          # python datamine/scripts/build_container_loot.py -> prisma/loot-containers.json
npm run loot:update         # loot:build + load whatever DATABASE_URL points at (use the DEV branch)
LOOT_TARGET=prod npm run loot:promote   # apply to the prod DATABASE_URL
```

`build_container_loot.py` also reads `prisma/data.json` (the wiki item snapshot) to
resolve item slugs. It is path-robust (resolves everything relative to its own
location), so the working directory doesn't matter.

### 2. Re-extract from a new game build (needs game files + UnityPy)
Only needed when a new SAND build changes the loot. Requires:
- `pip install -r datamine/requirements.txt` (UnityPy)
- a COPY of the game's `Sand_Data` under `datamine/gamefiles/` (never mine the live
  install), or set `$GAMEFILES` to an external `.../StandaloneWindows64` dir.
- the loot-table bundles dumped to `extracted/json/loottables_voyage.json` and
  `loottables_storm.json` via `dump_bundle_json.py <bundle> <out>` (these are a
  separate bundle dump — see the SEK datamine `UPDATE_PIPELINE.md` for the bundle
  names; they are NOT produced by `extract_loot_spawners.py`).

```bash
# from sand-wiki/datamine/
python scripts/dump_bundle_json.py <loottables_bundle> extracted/json/loottables_voyage.json
python scripts/dump_bundle_json.py <loottables_bundle> extracted/json/loottables_storm.json
python scripts/extract_loot_spawners.py     # -> extracted/json/entity_loot.json
python scripts/build_loot_sources.py        # -> data/loot_sources.json
# then commit data/loot_sources.json and run `npm run loot:build`
```

## Tests
`python -m pytest datamine/scripts` — runs `build_container_loot.py` against the
committed inputs and asserts the artifact shape (8 reconciled containers, aliases
applied, effort collapsed to Tier 1/2/3, storm-bonus fields present).

## Weapon / ammo / armor stats

Source: SEK `site/src/data/weapon_stats.json` + `site/src/data/turret_stats.json` (built
datamine outputs) → copied to `datamine/data/` (committed snapshots). Both feed the same
`weapons:build` → `prisma/weapon-stats.json` artifact.

Pipeline (mirrors loot containers):
1. `npm run weapons:build` — reshape snapshot → `prisma/weapon-stats.json` (slug-keyed; commit it).
2. `npm run db:load-weapon-stats` — update `ItemStats` for matched items. Seed-safe,
   prod-safe, idempotent; respects contributor edits. Run the dev branch first.

Run order: because `seed.ts` also writes these `ItemStats` columns, run
`db:load-weapon-stats` AFTER any `db:seed`. Datamine is authoritative over the wiki
scrape; contributor edits still win.

Turret stats (fireRate, projectileVelocity, clipSize→magazine, penetrates, reloadSeconds)
are imported for the 6 turret items. Not imported: magazine/ammoType for player weapons
(absent from weapon_stats.json), recoil/spread, and turret extras (barrels, autoRefill,
spreadIdleMax, fireInterval, family/tier).
