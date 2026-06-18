# Tech Tree enhancements — design

**Date:** 2026-06-14
**Worktree/branch:** `feat/tech-tree-enhance` (based on local `master` @ 5df9e78, which has the merged tech-tree page)
**Status:** Approved — ready for implementation plan
**Builds on:** `2026-06-14-tech-tree-page-design.md`

## Goal

Polish and connect the `/tech` page: match the site branding, replace the browser
`confirm()` with a styled modal (and codify the no-browser-dialog rule), make the canvas
pannable, surface each faction's free starting part, and add two-way jump links between the
tech tree and entity detail pages.

## Scope (6 items)

### 1. Logo matches the site

The tech-tree appbar currently renders a bespoke brand (orange "S" square + outdated
"SAND·WIKI"). Replace it with the **exact site wordmark** from `SiteHeader.tsx`:

```tsx
<Link href="/" aria-label="SAND HELP — home"
  className="group font-display text-xl font-bold tracking-wide text-foreground transition-colors hover:text-primary focus-visible:text-primary">
  SAND
  <span aria-hidden="true" className="mx-0.5 text-primary transition-colors group-hover:text-foreground group-focus-visible:text-foreground">·</span>
  HELP
</Link>
```

Remove the now-unused `.tt-brand`, `.tt-brand-mark`, `.tt-brand-name` rules from
`tech-tree.css` (the brand uses Tailwind/site classes now). The appbar keeps the
"Tech Tree" page-title pill.

### 2. Toolbar buttons use the shadcn Button

Replace the raw `<button className="btn btn-ghost btn-sm">` "Clear selection" and
"Reset progress" with the app's `@/components/ui/button` `<Button>` (`variant="ghost"` for
Clear, `variant="outline"` for Reset, `size="sm"`), matching site styling.

### 3. Styled confirm modal + no-browser-dialog rule

- New `src/components/ConfirmDialog.tsx` — a themed confirm dialog built on the Radix Dialog
  primitive (`@radix-ui/react-dialog`, already a dependency via `sheet.tsx`). Props:
  `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `onConfirm`,
  `destructive?`. Renders a centered overlay + panel using existing tokens (`--card-elevated`,
  `--border-strong`, etc.); confirm button uses `<Button variant={destructive ? "destructive" : "default"}>`.
- `TechTreeView` "Reset progress" opens this dialog instead of `window.confirm`. On confirm,
  reset to `tree.defaultUnlocked` and persist.
- **`instructions.md`:** add a Conventions rule — *Never use `window.alert` / `confirm` /
  `prompt`. Always use a styled in-app modal (e.g. `ConfirmDialog`).*

### 4. Pan / hand-grab

Make `.tt-viewport` pannable by pointer-drag on empty canvas:
- Default cursor on the viewport `grab`; while dragging, `grabbing`.
- `pointerdown` on the viewport (not on a `.tnode` or its status ring) records start
  `{x, y, scrollLeft, scrollTop}`; `pointermove` sets `scrollLeft/scrollTop` by the delta;
  `pointerup`/leave ends. Use pointer capture.
- A movement threshold (~4px) distinguishes a pan from a click so node-select and the
  status-ring toggle keep working. Dragging that begins on a node still pans the viewport;
  a click without drag selects.
- Keyboard scroll (native overflow) is unaffected.

### 5. Faction-root starting part (visible)

Each faction's free starting hull part — the `trampler-part` not unlocked by any node — shown
in its faction header as a link to that part's detail page (icon + name).

- **Mapping** (data-verified constant, e.g. in `transform.ts`):
  `godlewski → s-h-atm-fs-77b-l-small-chassis`, `kaiser → s-h-cargo-deck`,
  `landwehr → s-h-fortified-entrance-area`.
- `getTechTree()` resolves these slugs to `{ slug, name, icon, href }` and attaches a
  `rootPart` to the matching `TechFaction`. `TechFaction` gains `rootPart?: TechEntityRef`.
- The faction header (`.tt-faction`) renders the root part below the faction name: small icon
  + name, wrapped in a `<Link>` to `entityHref({ kind: "trampler-part", slug })`.
- If a slug doesn't resolve (defensive), the faction simply has no `rootPart` and the header
  renders as before.

### 6. Two-way jump links

**Shared types:** `TechEntityRef = { slug, name, icon, href }`. `href` is computed server-side
via the existing `entityHref` helper so the client needs no kind logic.

- **Tech tree → entity:** `TechUnlock` gains `href`. In the tooltip, each unlock name and the
  faction-root part render as `<Link>`s to their detail page. (Tooltip stays hover-shown;
  links are clickable while hovered.)
- **Entity → tech tree:** `TechTreeView` reads `?select=<nodeSlug>` via `useSearchParams` on
  mount: if present and valid, set it as the sole selected target (path highlights) and scroll
  it into view (center). Any item/trampler-part whose detail page is unlocked by a tech node
  gets a **"Show in tech tree"** link/button to `/tech?select=<nodeSlug>`.
  - New query `getUnlockingNode(entitySlug): Promise<{ slug: string } | null>` — the entity's
    `incomingLinks` where `role === "tech-unlocks"`, first source node (entities are typically
    unlocked by one node; first wins, deterministic by `sortOrder`).
  - `items/[slug]/page.tsx` and `tramplers/[slug]/page.tsx` call it and render the button
    (placed in the EntityDetail header actions area). When null, no button.

## Components / units

- `src/lib/tech-tree/types.ts` — add `TechEntityRef`; `TechUnlock` += `href`; `TechFaction` += `rootPart?`.
- `src/lib/tech-tree/transform.ts` — faction-root slug map (`FACTION_ROOT_PART`); `toTechTree`
  stays pure: it computes each unlock's `href` from the target's `{slug, kind}` via the existing
  pure `entityHref` helper, and builds each faction's `rootPart` ref from a `rootParts` argument
  (a `Record<slug, {name, icon, kind}>` the query passes in for the 3 root slugs).
- `src/lib/queries.ts` — `getTechTree()` selects each unlock target's `{slug, name, icon, kind}`,
  does one extra `findMany` for the 3 root-part slugs, and passes `rootParts` to `toTechTree`;
  add `getUnlockingNode(slug)`.
- `src/components/ConfirmDialog.tsx` — new.
- `src/components/tech-tree/TechTreeView.tsx` — logo, shadcn buttons, ConfirmDialog, pan
  handlers, `useSearchParams` select, unlock/root links.
- `src/components/tech-tree/tech-tree.css` — pan cursors; root-part styles; drop old brand rules.
- `src/app/items/[slug]/page.tsx`, `src/app/tramplers/[slug]/page.tsx` (+ `EntityDetail` if the
  button lives there) — "Show in tech tree" button.
- `instructions.md` — no-browser-dialog rule.

## Testing

- **Unit (Vitest):** faction-root map + `toTechTree` attaching `rootPart`/unlock `href`
  (with a stub resolver); `getUnlockingNode` shape via a pure mapper if extracted. Existing
  transform/layout tests must stay green.
- **Manual (run skill):** logo matches header; buttons styled; Reset opens the modal (no
  browser dialog anywhere); drag pans with grab cursor while node click/select still works;
  faction headers show the starting part linking out; `/tech?select=<slug>` selects + scrolls;
  unlock links navigate; detail-page "Show in tech tree" jumps back and selects.

## Out of scope

- Steam account progress sync (still Phase 2 of the prior spec).
- Editing the tree / changing tech data.
- Reworking the layout algorithm or cost model.
