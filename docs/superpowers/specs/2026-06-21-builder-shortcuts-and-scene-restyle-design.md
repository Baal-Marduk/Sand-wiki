# Trampler Builder — keyboard remap + scene restyle

**Date:** 2026-06-21
**Status:** Approved (design validated via live prototype)
**Files:** `apps/wiki/src/components/builder/Builder.jsx`, `apps/wiki/src/components/builder/BuilderScene.jsx`

Two independent improvements to the Trampler Builder, brainstormed and validated
together:

1. A keyboard-shortcut remap (rotate → spacebar, R/F level nav, context-aware X).
2. A visual restyle of the 3D scene (desert-dusk sky gradient + dotted, gradient
   ground), validated against a live Canvas-2D prototype.

---

## Part A — Keyboard remap

Current bindings live in `Builder.jsx` (`down`/`up` handlers, lines ~313-337) plus
WASD/arrow panning in `BuilderScene.jsx` (`onPanKeyDown`). Keys are global, ignored
while a text field is focused. That global-but-not-in-fields model is kept.

### New bindings

| Key | Behavior |
|-----|----------|
| **Space** | Rotate the active ghost (if placing) or the selected piece. `preventDefault` so the page doesn't scroll. |
| **R** | Level **up** — same as the ▲ rail (clamp to top deck). |
| **F** | Level **down** — same as the ▼ rail (clamp to deck 1). |
| **X** | **Context delete** (see below). |
| Del / Backspace | Delete the selected piece (unchanged). |
| C | Copy selected (unchanged). |
| M | Mirror selected (unchanged). |
| Esc | Cancel active placement / deselect (unchanged). |
| WASD / arrows | Camera pan (unchanged, in `BuilderScene`). |

`R` is freed from rotate so it can drive level-up. The on-screen HUD legend in
`BuilderScene.jsx` and the contextual `tb-placing` hints + toolbar tooltips in
`Builder.jsx` are all updated to match.

### Context-aware X

X resolves in priority order:

1. **Placing a part** (`activePart` set, ghost not yet committed) → cancel the
   placement (clear `activePart`). "Clear the current selected one if not placed
   on the trampler."
2. **Pointer hovering a placed piece** → delete that hovered piece. "Delete the
   hovered piece" — you can remove a part by pointing at it and pressing X, no
   click required.
3. **Otherwise, a piece is selected** → delete the selected piece (today's
   behavior, kept as fallback).

This needs a new **hovered-piece** signal that the builder does not track today.

#### Hover tracking (new)

`BuilderScene` already raycasts placed meshes on click (`pickPlacement`). Add a
lightweight hover raycast on pointer-move (only when not dragging and not placing)
that finds the topmost placed mesh under the cursor and reports its `plId` up via a
new `onHoverPart(plId | null)` callback. `Builder.jsx` stores it in a ref
(`hoveredId`) so the global X handler can read the latest value without re-binding.

To make X's target visible, the hovered (but not selected) mesh gets a **subtle
outline/emissive tint** distinct from the green selection highlight — e.g. a dim
warm/white emissive so you can see what X will remove before pressing it. Hover
state must not trigger full rig rebuilds; it only adjusts material emissive on the
one mesh entering/leaving hover (mutate material in place, then `st.render()`).

Cursor over a placed piece switches to `pointer` to reinforce it's interactive.

### Edge cases

- Keys ignored when `e.target` is INPUT/TEXTAREA (existing guard reused).
- Space rotate respects the same validity check as the current `rotate()` (revert +
  flash on invalid rotation).
- R/F clamp at deck bounds (1..`LEVEL_LABELS.length`), same as the rail buttons.
- Read-only / view mode (`readOnly`) places no ghost and selects nothing; hover
  tracking and the edit keys stay inert there (guard on `readOnly`).

---

## Part B — Scene restyle (desert dusk)

Replaces the flat brown ground disc + solid `0x0d1320` clear color with an
atmospheric desert-dusk look. Validated live; palette locked below.

### Palette (locked)

| Token | Hex | Use |
|-------|-----|-----|
| sky top | `#161a30` | deep indigo overhead |
| sky mid | `#42385f` | dusk violet band |
| sky horizon | `#e8915a` | warm amber glow at horizon |
| ground near | `#b98854` | lit sand under the rig |
| ground far | `#5b4636` | shadowed sand toward the rim |
| dot | `#ffdd96` (warm gold) | grid dots; echoes the existing front-arrow accent |
| fog | recolor to `~#3a2f3f` / horizon tone | blend the fade-out into the sky |

### Sky

Add a large `BackSide` sphere (radius inside the camera far plane, e.g. ~300)
behind the rig, with a `ShaderMaterial` that ramps **sky top → mid → horizon** by
normalized world/view height. `fog: true` is irrelevant for the sky sphere (disable
fog on it so the gradient stays crisp); scene fog still applies to ground + rig. The
renderer clear color becomes moot but is set to the horizon tone as a fallback.

### Ground

Keep the existing `CircleGeometry` ground (and its dynamic `position.y` that drops
to meet the leg feet — that logic is preserved). Two visual additions:

1. **Radial gradient** — a `CanvasTexture` (radial: `ground near` center → `ground
   far` edge) used as the ground material `map`. Generated once at init.
2. **Dot grid** — a `THREE.Points` cloud at every cell corner across the ground
   extent, as a child positioned with the ground. Round sprite points (circular
   alpha mask via a small generated texture or a round-point shader), warm gold,
   with **distance fade** (per-vertex alpha falling off with radius from center, and
   size attenuation with depth) so far dots dissolve into the haze. The dots are
   ambient atmosphere covering the whole plane — independent from, and visually
   lighter than, the functional blue chassis cell-outline grid drawn per active
   level (that stays as-is).

### Horizon haze + fog

Recolor `scene.fog` from `0x0d1320` to the dusk horizon tone so the ground/rig
fade blends into the amber horizon rather than cutting to navy. The sky sphere's
horizon stop provides the bright band; fog does the atmospheric blend. Keep the
existing fog near/far (90/220) as a starting point; tune if the rig fades too early.

### Lighting

Lighting is already warm-key + cool-fill (`dir` warm, `dir2` cool, hemisphere). No
structural change; only verify the sand reads well against the new sky and adjust
`toneMappingExposure` slightly if needed. The `RoomEnvironment` IBL stays.

### Thumbnail capture

`captureRef` renders a fixed-angle frame for gallery thumbnails. The new sky +
ground will now appear in thumbnails too — acceptable and an improvement; verify a
captured thumbnail still reads well and stays under the 400KB webp cap.

---

## Out of scope

- No change to placement/validation logic, manifest, cost, sockets, or share codes.
- No change to camera controls beyond the cursor/hover affordance.
- No new assets shipped (sky + ground generated procedurally in-scene, matching the
  existing asset-free `RoomEnvironment` approach).

## Verification

- Keys: rotate on Space (ghost + selected), R/F move levels and clamp; X cancels a
  pending placement, deletes a hovered piece, and falls back to deleting the
  selected piece; Del/Backspace/C/M/Esc unchanged; no key fires while typing in the
  name field or modal inputs; Space doesn't scroll the page.
- Hover: pointing at a placed piece shows the hover outline and `pointer` cursor;
  leaving clears it; hovering never rebuilds the rig.
- Scene: gradient sky visible on orbit; ground shows radial gradient + fading dot
  grid; horizon blends via fog; rig still sits grounded on its legs; thumbnail
  capture still works.
