# 3D Map Assets

This folder serves static assets for the `/map` 3D location viewer route.

## What's Here

The `/map` viewer fetches assets from this location:

- `/map/manifest.json` — metadata for all baked locations (names, glb paths, item categories, object counts)
- `/map/spawns.json` — optional spawner→item loot tables (populated by the bake, enables loot tooltips)
- `/map/*.glb.gz` — per-location 3D models (gzipped GLB files), one per location

## Current Fixtures

`manifest.json` and `spawns.json` currently contain minimal placeholders so the viewer and its e2e smoke tests work without a real asset bake:

- One fake "Test POI" location with key `poi_Test`
- No actual `.glb.gz` files (the viewer will fail to load this location, as expected)

These fixtures are **overwritten** when real assets are baked and deployed.

## How to Produce Real Assets

Real 3D assets are baked by the [`sand3d`](../../sand3d) tool, which extracts and prepares 3D models from a local SAND game install. The tool is **not part of this repo**.

### Baking workflow:

1. Follow the sand3d README to set up and run its `extract.py` against your game install
2. The bake writes to `sand3d/viewer/assets/` containing:
   - `manifest.json`
   - `spawns.json`
   - `*.glb.gz` files (one per location)
3. Copy the **contents** of `sand3d/viewer/assets/` into this folder (`apps/wiki/public/map/`)

For exact sand3d invocation flags and setup, see the sand3d repository's README.

## Size and Storage

The complete GLB set is on the order of tens of MB. By default, these files are committed as plain files; if repository size becomes a concern, Git LFS can be configured for `apps/wiki/public/map/*.glb.gz` (not currently set up).

## Browser Compatibility

The viewer decompresses gzipped GLBs using the browser [`DecompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream) API. **Chrome and Edge support this; Firefox and Safari historically do not.** The page displays a friendly error message if the API is unavailable.

If broader browser support is needed, an alternative decompression library (e.g., pako) could replace `DecompressionStream` — this is deferred for now.
