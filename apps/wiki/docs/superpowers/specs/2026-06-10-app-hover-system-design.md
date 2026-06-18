# App-wide hover system — design

TODO #8: "add hover effect on links and tabs and interactive ui in app" — explicitly
**global** (app-wide + shared components), not section-scoped.

## Goal

A single, coherent hover/focus treatment applied to every interactive surface across the
app, centralized so new components inherit it automatically. Replace the current ad-hoc,
inconsistent per-component hovers with one source of truth. Treatment is **subtle &
consistent**: color/background/underline/brightness only — **no movement**.

## Current state (to normalize)

Hover handling today is scattered and inconsistent:
- Cards: `hover:bg-base-300 transition-colors` (`ItemCard`, `EnvCard`, `TramplerCard`, and the card grids on `src/app/page.tsx`, `src/app/environment/page.tsx`, `src/app/tramplers/page.tsx`).
- Row links: `hover:bg-base-200` (`ItemLinkList`, `CategoryQuickNav`).
- Nav links: `hover:text-primary` (`MainNav`).
- Tabs (`ItemTabs`): **no hover at all**.
- Clickable item icons (`ItemIconLink`): tooltip only, no affordance on the icon.
- `.link` (DaisyUI) used in ~4 places with default styling.

## Approach

Centralize hover behavior in `src/app/globals.css`, keyed off the classes components
already use plus three small shared marker classes. Then strip the bespoke inline hovers
so the global rules are the single driver. Every `:hover` is paired with `:focus-visible`
for keyboard accessibility (the axe e2e gate runs in both themes). Hover colors use the
existing DaisyUI theme CSS variables, so they are correct in both `desertnight` and
`desertday` automatically.

### 1. Global CSS (`src/app/globals.css`)

Add a dedicated section (after the theme blocks). Treatments:

| Surface | Selector | Hover + focus-visible treatment |
|---|---|---|
| Text links | `.link` | `color: var(--color-primary)`; underline retained |
| Nav links | `.nav-link` (new) | `color: var(--color-primary)` |
| Tabs | `.tab:not(.tab-active)` | `color: var(--color-base-content)` + `background-color: color-mix(in oklab, var(--color-base-200) 50%, transparent)` |
| Clickable cards | `a.card` | `background-color: var(--color-base-300)` |
| Row links | `.row-link` (new) | `background-color: var(--color-base-200)` |
| Clickable icons | `a:hover .item-sprite`, `.group:hover .item-sprite` (new marker on `ItemIcon`) | `filter: brightness(1.1)` |
| Selects | `.select:hover` | `border-color: var(--color-primary)` (affordance) |
| Buttons | `.btn` | leave to DaisyUI default (already has a hover) |

Shared transition on interactive surfaces:
`transition: color .15s, background-color .15s, border-color .15s, filter .15s, opacity .15s;`
applied to `a, .tab, .btn, .select, .item-sprite`.

Concrete CSS (illustrative — final lives in `globals.css`):

```css
@layer components {
  a, .tab, .btn, .select, .item-sprite {
    transition: color .15s, background-color .15s, border-color .15s, filter .15s, opacity .15s;
  }
  .link:hover, .link:focus-visible { color: var(--color-primary); }
  .nav-link:hover, .nav-link:focus-visible { color: var(--color-primary); }
  .tab:not(.tab-active):hover, .tab:not(.tab-active):focus-visible {
    color: var(--color-base-content);
    background-color: color-mix(in oklab, var(--color-base-200) 50%, transparent);
  }
  a.card:hover, a.card:focus-visible { background-color: var(--color-base-300); }
  .row-link:hover, .row-link:focus-visible { background-color: var(--color-base-200); }
  a:hover .item-sprite, .group:hover .item-sprite,
  a:focus-visible .item-sprite, .group:focus-within .item-sprite { filter: brightness(1.1); }
  .select:hover { border-color: var(--color-primary); }
}
```

**Reduced motion:** the treatment uses no transforms or position changes, so
`prefers-reduced-motion` requires no special handling (it governs motion, not color);
color/filter transitions are acceptable. This will be stated as a comment in the CSS.

### 2. Component normalization

- `src/components/ItemIcon.tsx` — add `item-sprite` to the className of both the `<img>` and the placeholder `<span>`. (No new prop; the marker is always present, but the brightness rule only fires inside a hovered `a`/`.group`, so static icons like the detail-page header are unaffected.)
- `src/components/ItemCard.tsx`, `EnvCard.tsx`, `TramplerCard.tsx` — remove `hover:bg-base-300 transition-colors` (now driven by `a.card`).
- `src/app/page.tsx`, `src/app/environment/page.tsx`, `src/app/tramplers/page.tsx` — remove `hover:bg-base-300 transition-colors` from card anchors. (Leave the home page's `hover:opacity-80` hero link as-is — it is not a card and is out of this vocabulary.)
- `src/components/ItemLinkList.tsx`, `CategoryQuickNav.tsx` — replace `hover:bg-base-200` with the `row-link` class.
- `src/components/MainNav.tsx` — replace the inline `hover:text-primary transition-colors` in `linkCls` with the `nav-link` class (keep layout classes). Leave the dropdown items' existing `hover:bg-base-300` as-is — that hover already works against the dropdown panel and switching it to `row-link` (base-200) risks making it too subtle.
- `src/components/ItemTabs.tsx` — no change needed (the `.tab` rule targets existing markup); confirm the non-active tab buttons pick up the hover.

No change to `SortableTable` header buttons (they are `<button>`, covered by the shared transition; their existing `hover:text-base-content` is compatible and may stay).

### 3. Testing

- CSS is not unit-testable. The existing `npm run test:e2e` **axe a11y gate runs in both themes** and guards focus-visible and contrast — the primary safety net.
- Add one light smoke test in `tests/e2e/wiki.spec.ts`: hover a primary-nav link and assert its computed `color` becomes the primary token; hover a non-active tab on an item page and assert its `background-color` changes from the un-hovered state. Kept minimal and tolerant (compare against the element's own pre-hover value) to avoid brittleness.

## Out of scope

- No motion/transform effects (deferred "Expressive" option).
- No changes to the rarity-tinted icon background behavior.
- The home hero `hover:opacity-80` link stays as-is.
