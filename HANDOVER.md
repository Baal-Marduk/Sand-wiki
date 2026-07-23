# Handover — loot sets, and what is still wrong

Branch `loot-sets`. Written 2026-07-23, after a session that started as "why is the rocket
launcher rarer than the wiki says" and turned into finding that the loot model was
misrepresented at nearly every layer.

Read `packages/datamine/UPDATE_PIPELINE.md` for how data is regenerated — and read item 5
below first, because that document is incomplete.

---

## The model (verified against the binary, not inferred)

`LootSetupDataComponent.RollEntry` @ `0x4A1A960` in `GameAssembly.dll`:

```
total = Sum(fromEntries, e => e.Chance)
if (randomWeight < 0) randomWeight = Random.RandomRangeInt(0, total)
acc = 0; foreach (e) { acc += e.Chance; if (acc >= randomWeight) return e; }
```

and `class LootItemData { string itemBlueprint; int countMin; int countMax; }` — **no
per-item chance field**.

So: a container holds a weighted pool, opening it picks **exactly one** entry, and the game
grants **every** item in that entry's table. `chance` is a **weight**, not a percentage.
A container's contents are one *set*; the union of all its sets is not a thing a player
ever receives. `RollEntry` has zero client callers — the roll happens server-side; the
client only ships the data.

Everything below follows from that.

---

## 1. Sets are still collapsed in three places

Fixed this branch: the container path (`build_loot_sources.py` emits `variants[]` with real
per-set weights and counts), the lockbox path (`build_lockbox_loot.py` now emits `sets`),
and the map popup's direct-click view.

**Still collapsed — each shows a union as if it were contents:**

- **The wiki environment page.** `apps/wiki/src/app/environment/[slug]/page.tsx` still
  renders only the per-item rollup (`role:"loot"`). The `role:"loot-set"` rows exist in
  `packages/data/generated/links.json` and nothing reads them. This is the biggest visible
  gap: the map tells the truth, the wiki page does not.
- **The map's "Can become" rows.** `MapViewer.tsx` rewires the direct-click path but
  spawner *members* still render `SPAWNS[s.bp].loot` — the flat baked list, no
  probabilities. Members carry a `bp`, so it is the same `lootSetsForBlueprint(s.bp)` call.
- **Enemy / mob drops.** The tables are literally named `mobLoot_<mob>_setN`, so they are
  sets, but `build_loot_sources.py` assigns them **equal weights by assumption** (`approx:
  true`) and `build_enemies.py` emits `chance: null` because it has no real weights.
  Nobody has checked whether real weights exist in the source. Until someone does, those
  percentages are honest-but-unknown at best.

## 2. One fabrication is still standing

Removed this branch: the pile's invented T1/T2 split (a regex on the *table name* that
renormalised each half and erased the real 500:100 weighting — rocket launcher read 18.2%,
it is 4.88%), and the cross-entity pooling that normalised ironclad 40/70/80 mm as a single
12-entry roll instead of three separate ones.

**Still there:** `build_container_loot.py` unions the low/mid/high effort entities into one
"Tier N" group and takes `chance = max` across them. Three distinct roll pools presented as
one distribution. It is deliberate (players cannot tell the variants apart by looking), it
is documented in the code, and the *sets* view keeps them separate — but the per-item
column for a crate is not any single container's real probability. Decide whether that is
acceptable or whether the page should split by effort.

## 3. The map extractor's loot table should die

**This is the note that matters most for the other repo.**

There are three independent loot pipelines that do not know about each other:

| pipeline | source | output |
|---|---|---|
| containers | `epb_assets_all` + `conf_worldLootTables{Voyage,Storm}Config` | `sek-out/container_loot.json` |
| locked boxes | `conf_worldContractsConfig._lockedBoxLootData` | `sek-out/lockbox_loot.json` |
| **map bake** | **sand-map-extractor, separate repo** | **`public/map/spawns.json` `loot[]`** |

Each re-derives loot its own way, and each shipped its own copy of the same bug. The map's
baked `loot[]` is the worst of the three: a flat union with **no probabilities at all**
(`game_buriedTreasure` bakes 52 rows for a container that yields 5–6 items).

As of this branch the wiki now serves **61 of the 68** blueprints that have baked loot. The
remaining 7 are only on the baked list because they are in `excludeContainers` — see item 4.

**sand-map-extractor should stop baking loot entirely.** The map should get loot from the
wiki's data, which is the only place the real set structure exists. What the bake must keep:
geometry (`*.glb.gz`), and in `spawns.json` the object labels, `cat`, the spawner members
(`m`), and above all the **blueprint id** (`o.userData.b`) — that id is the only join
between the two projects, via `apps/wiki/src/components/map/containerBlueprints.json`.

More broadly: this repo has no knowledge of your other tooling except through that JSON.
That is the entire integration surface, and it currently carries the wrong data.

## 4. Page existence and map data are the same switch — they must not be

`excludeContainers` decides which containers get a wiki page and appear in the site-wide
search. That is what it is for and it should stay.

But it is applied in `build_container_loot.py` and `transform/loot.ts` at the point where
**loot links are produced**, and links require their source entity to exist. So:

```
excluded → no entity → no links → the map goes blind
```

Hiding something from search should not stop it being clickable on a map it is standing on.
Today Aurogen Crystal, both Naval Mines and Mob Drops fall in this hole.

**Design reasoned through but not implemented:**

- Split the artifact by consumer. Wiki pages keep reading `links.json`, gated by exclusion,
  unchanged. The map reads a new **blueprint-keyed artifact covering every container,
  exclusion-independent** — emitted by the same generator so the two cannot drift.
- Put it at `apps/wiki/public/map-loot.json`, **not** under `public/map/` — that folder is
  overwritten wholesale by extractor bakes.
- Shape: `{ "<blueprint>": { slug, setSize:[lo,hi], always:[…], sets:[…] } }`.
  `always` is needed for the Ironclad Box, whose Alloy Steel is granted *on top of* the
  rolled set; folding it into `sets` would misrepresent it as an alternative.
- Do not bake `href`/`icon` — resolve them client-side from the entity store, which is
  already in the map's client bundle. Baking them only adds a staleness class.
- Fold `containerBlueprints.json` into it and delete that file.
- Move the `if dm_slug in EXCLUDE: continue` in `build_container_loot.py` (currently line
  ~90) down to the *write* of `container_loot.json`, so sets are built for everything.
- Excluded containers then show loot with a plain-text title (no page to link to);
  `routeFor` already degrades that way.

Open question left deliberately: whether to keep the baked-loot fallback for a blueprint the
wiki does not know. It only fires if a bake ships a container before the wiki re-mines.
Keeping it lets the flat-union display silently reappear.

## 5. The scaffolding

- **Two diverged copies of the datamine scripts.** `packages/datamine/scripts/` and
  `apps/wiki/datamine/scripts/` differ. **Only `packages/datamine` reaches the site**
  (`sek-out` → `transform/` → `packages/data/generated` → `@sandlabs/data`). The
  `apps/wiki` copy feeds `prisma/loot-containers.json` → Postgres, which `queries.ts` does
  not read for loot. Fix loot in the wrong tree and nothing changes. This cost real time.
- **`UPDATE_PIPELINE.md` omits 7 of 28 scripts**, including the entire lockbox chain
  (`extract_lockbox_loot.py`, `build_lockbox_loot.py`) plus world-spawns, location-loot and
  crafting-recipes. Follow it literally after a game patch and that data silently keeps the
  previous build's values while everything else moves. Now worse than before, because the
  lockbox chain is on the live path as of this branch.
- **CRLF.** Most datamine scripts open output in text mode, so on Windows they rewrite every
  line of the committed `sek-out/*.json`. That destroys the `git diff sek-out/loot_tables.json`
  per-build review the update doc explicitly relies on, and trips the pre-commit CRLF guard.
  Fixed in the four scripts touched here (`newline="\n"`); roughly fourteen others still do it.
- **Item extraction is incomplete.** Items are enumerated as a union of four partial sources
  (`item_defs` ∪ localization ∪ loot ∪ recipes) and the transform emits a standing
  `reports/missing-from-datamine.json`. There is no single authoritative item list.
- **`containerSlugMap` is hand-maintained** and cannot be derived — it reconciles datamined
  names against slugs the wiki already uses. Not an exclusion; it only disappears if wiki
  entities are renamed to match, which is a content decision.

## 6. Two data curiosities

- **Aurogen Crystal is an item, not a container.** `game_aurogenCrystal0-4` have zero
  entries and one mandatory table giving `item_crystalHandles` ×1 — "Raw Aurogen Crystal".
  It hands you one copy of itself. Clicking it should link to the item like any other
  pickup; a chances/sets popup is meaningless for it.
- **Militia Box is a ghost.** Three definitions pointing at `militiaLoot_lootBox_*` tables
  that do not exist in this build (the 70 mm one points at the 80 mm tables — looks like a
  copy-paste slip, but moot). No wiki page, no world placement. Its `excludeContainers`
  entry is redundant: `is_live()` drops it on evidence.

## 7. Correction to the record

Commit `1f9807d` claims the locked boxes "have no sets to show". **That is wrong.** It was
concluded from the *built* artifact (`sek-out/lockbox_loot.json`, which stores per-item
chances) rather than the source; `build_lockbox_loot.py`'s own docstring says "then one
random set within (containerType, tier)". The Military Box has 23 sets. Corrected in
`5d704e2`, which is where the real numbers are.

Related: an item count was briefly derived as `Σ P(item)`. That is a valid expectation, but
the wrong instrument for a count — it returns 3.5 for something that is always 3 or 4, and
cannot distinguish "always 4" from "sometimes 2, sometimes 6". Counts are now counted off
the sets: Military 4–5, Utility 3–4, Valuables 1–4, the pile 5–6.

## 8. Not verified

- The map popup has not been looked at in a browser. `MapViewer.tsx` is `@ts-nocheck`, and
  the tests cover the data layer only, so the markup changes are unexercised.
- Set labels use raw tier indices (`T0`/`T1`). The lockbox builder's docstring calls them
  "S + A"; that mapping was not confirmed, so indices were used rather than guessed names.
- `apps/wiki/src/lib/taxonomy.test.ts` fails on `master` and on this branch — it does not
  expect the `"map"` section that `taxonomy.ts` already ships. Pre-existing, unrelated.
