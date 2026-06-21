# Trampler `.wbt` export (Download for in-game use)

**Date:** 2026-06-21
**Status:** approved (design), implementation pending

## Goal

Let a builder user download their trampler as a `.wbt` file the game can load, mirroring
the existing import path ([wbtImport.js](../../../apps/wiki/src/components/builder/wbtImport.js)).
Fully client-side; nothing uploaded.

## Background / findings

The game's `.wbt` is `gzip( XOR(6-byte key, reset every 0xA000) ( Newtonsoft BSON ) )`.
A real save (decoded from `tmp/57805ed9-…wbt`) is a BSON document:

```
{
  textureSize:    int32 = 512
  textureRawData: binary  (512*512*4 = 1048576 B, RGBA32 icon)
  walker: {
    Id: "0", UniqueId: <guid>, Version: 1,
    Chassis:      { Id:0, EpbId, CellCoordinate:{x,y,z}, DecorationsInfo:null,
                    Rotation:double, CompartmentHash:<md5>, DefinitionHash:<md5> }
    Compartments: [ { Id:0, EpbId, CellCoordinate:{x,y,z},
                      DecorationsInfo: null | { Sockets:[ {Key:{x,y,z},
                        Value:[ {Key:int, Value:{state:int,count:int}} ] } ] },
                      Rotation:double, CompartmentHash:<md5>, DefinitionHash:<md5> } ]
  }
  format: int32 = 4
  iconVersion: int32 = 5
  firstNameIndex: int32, secondNameIndex: int32   // procedural name
  creationTime: datetime
  name: null
}
```

A **byte-exact BSON round-trip** (decode → re-encode) was proven against the sample, so the
encoder mechanics are solid. EpbId = `walker_<partId>_epb`. Builder cell coords are relative
to the chassis origin; the game stores absolute coords offset by the chassis `CellCoordinate`
(import subtracts it). Rotation = `rot * 90` (double).

Two fields can't be reproduced from `parts_v2.json`:
- `CompartmentHash` / `DefinitionHash` — per-part-**definition** MD5s (identical across instances
  of the same EpbId), unknown algorithm; not MD5 of EpbId/name/cells.
- `DecorationsInfo.Sockets` — per-instance socket connection state.

## Approach (chosen: "Minimal + test in-game")

Emit a faithful structure, defaulting the two unreproducible fields, and validate by loading
in-game:
- `DecorationsInfo: null` for every compartment (game falls back to default connections; the
  chassis already uses null).
- Hashes: look up an **EpbId→{compartmentHash, definitionHash}** table **harvested from the
  provided sample** (covers the parts in it); blank `""` for parts not in the table.
- Icon: generated 512×512 RGBA from the front-facing capture.

If the game rejects blank hashes or null decorations, fall back to harvesting more saves
(table grows) or reverse-engineering the hash. This is logged for the user to test.

## Components

1. **`apps/wiki/src/components/builder/wbtExport.js`** — pure encoder, the inverse of
   `wbtImport.js`:
   - `bsonEncode(node)` — BSON writer for the types used (double/string/doc/array/binary/
     bool/datetime/null/int32/int64). Verified by a round-trip unit test.
   - `xorEncode(bytes)` — reuses the symmetric XOR (shared constant with import).
   - `gzip(bytes)` — `CompressionStream('gzip')` (browser native).
   - `stateToWbt(state, { icon, hashes, makeName })` → `Uint8Array` (the `.wbt` bytes).
     Builds the `walker` doc from `state.chassisId` + `state.placements`, adds the top-level
     fields, encodes, XORs, gzips.

2. **`apps/wiki/src/components/builder/data/part_wbt_hashes.json`** — harvested
   `{ partId: { c: "<compartmentHash>", d: "<definitionHash>" } }` from the sample. Generated
   by a small `tmp/` script; only the JSON is committed.

3. **Icon capture** — extend `BuilderScene` with an `iconRef` (alongside `captureRef`) that
   renders the same front-facing, fully-opaque, helpers-hidden frame at 512×512 and returns a
   `Uint8Array` of RGBA pixels. Capture logic shared with the thumbnail path (DRY).

4. **Download button** — top bar in `Builder.jsx`, next to "Load .wbt save":
   `⭳ Download .wbt`. Handler: get icon from `iconRef`, `stateToWbt(...)`, `Blob` →
   anchor download. Filename from `state.name` (sanitised) or `trampler-<short>.wbt`.

## Testing

- **Unit (vitest):** round-trip — decode (import) ∘ encode (export) on a constructed state is
  stable; and the BSON writer reproduces the sample's decoded bytes exactly (fixture-free:
  assert encode(parse(x)) === x logic ported into the test where feasible, else assert the
  structural round-trip of a small synthetic doc).
- **Manual / in-game (user):** download a build, drop it in the saves folder, load it in the
  game. Confirms whether blank hashes / null decorations are accepted. This is the gate that
  the "minimal" approach depends on.

## Out of scope (YAGNI for v1)

- Full `DecorationsInfo` socket-state reconstruction from `conns`.
- Complete 126-part hash table / hash algorithm reverse-engineering (only if the in-game test
  fails).
- Procedural-name fidelity (use fixed/derived name indices).
