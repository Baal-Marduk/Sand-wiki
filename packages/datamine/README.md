# @sandlabs/datamine

Vendored SAND datamining pipeline (from SEK, `Sitting-in-a-towel/sand-expedition-kit`)
plus the wiki-specific transform (Plan 2). Regenerates `packages/data/generated/*.json`
for a new game build.

- `scripts/` — vendored SEK Python (extract → build → art), repointed to our paths.
- `sek-out/` — committed SEK-shape datasets (the transform's input).
- `extracted/`, `gamefiles/` — gitignored; populated by extraction on a machine with a
  game-files copy. NEVER mine the live install — copy `Sand_Data` + `GameAssembly.dll` here.
- See `UPDATE_PIPELINE.md` for the per-release run.
