# Disable buttons to WIP pages — design

TODO #12: "Disable buttons to currently WIP pages."

## Goal

Stop linking users into sections/categories that have no content yet. WIP destinations
should still be *visible* (so users know they're planned) but rendered **disabled**:
dimmed, non-interactive, `aria-disabled`, with a small "soon" badge. The placeholder pages
themselves stay reachable by direct URL — only the in-app buttons are disabled.

## WIP destinations

- **Placeholder sections** — `Tech Tree` (`/tech`) and `Tools` (`/tools`), both
  `kind: "placeholder"` "coming soon" pages.
- **NPCs environment category** — `/environment?category=npcs`, which has no source data.
  The other env categories (loot-containers, landmarks, game-modes) have data and stay live.

## Single source of truth (`src/lib/taxonomy.ts`)

- Sections: a section is WIP when `kind === "placeholder"`. Add:
  ```ts
  export function isWipSection(section: Section): boolean {
    return section.kind === "placeholder";
  }
  ```
- Categories: add an optional flag and set it on NPCs.
  ```ts
  export interface Category { slug: string; label: string; wip?: boolean }
  ```
  In the environment section's categories: `{ slug: "npcs", label: "NPCs", wip: true }`
  (others unchanged, implicitly `wip` falsey).

## Shared treatment (`src/components/WipBadge.tsx`)

A tiny presentational badge reused at every site:

```tsx
export function WipBadge() {
  return <span className="badge badge-ghost badge-xs uppercase tracking-wide">soon</span>;
}
```

Disabled entries are rendered as a non-interactive `<span>` (not a `<Link>`) carrying
`aria-disabled="true"`, dimmed text (`text-base-content/40`), `cursor-not-allowed`, and the
`WipBadge`. (Reusing the existing DaisyUI `badge` keeps styling consistent and axe-safe.)

## Render sites

1. **MainNav top bar (`src/components/MainNav.tsx`)** — in the `SECTIONS.map`, the
   non-dropdown branch currently renders `<Link href={...} className={linkCls}>{label}</Link>`.
   When `isWipSection(section)`, render instead a disabled span:
   ```tsx
   <span className={`${linkCls} text-base-content/40 cursor-not-allowed inline-flex items-center gap-1`} aria-disabled="true">
     {section.label} <WipBadge />
   </span>
   ```
   (Tech/Tools have no categories, so they always hit this branch.)

2. **MainNav Environment dropdown (`src/components/MainNav.tsx`)** — the dropdown maps env
   categories to `<Link href={`/${section.slug}?category=${c.slug}`} className={dropdownItemCls}>`.
   When `c.wip`, render a disabled span instead (same `dropdownItemCls` base + dimmed +
   `aria-disabled` + `WipBadge`), keeping the `CategoryIcon`.

3. **Home "Browse by section" cards (`src/app/page.tsx`)** — the `SECTIONS.map` renders each
   section as `<Link className="card bg-base-200">`. When `isWipSection(section)`, render a
   non-link `<div className="card bg-base-200 opacity-60 cursor-not-allowed" aria-disabled="true">`
   with the same body plus a `WipBadge` in the title row.

4. **Environment landing cards (`src/app/environment/page.tsx`)** — the category grid maps
   `section.categories` to clickable `<Link className="card ...">`. When `c.wip`, render a
   non-link dimmed `<div ... aria-disabled="true">` keeping the `CategoryIcon`, the label, and
   the existing count badge (which already reads "coming soon" when the count is 0).

## Testing

- **Vitest (`src/lib/taxonomy.test.ts`)**: `isWipSection` returns true for the `tech`/`tools`
  sections and false for `items`/`environment`/`tramplers`; the NPCs category has `wip === true`
  while loot-containers/landmarks/game-modes do not.
- **E2E (`tests/e2e/wiki.spec.ts`)**: in the primary nav, "Tech Tree" and "Tools" are **not**
  links (`getByRole("link", { name: ... })` count 0) and a disabled element with text "Tech
  Tree"/"soon" is present; opening the Environment dropdown, "NPCs" is not a link while a live
  category (e.g. "Loot Containers") is. The both-theme axe gate continues to guard a11y
  (`aria-disabled` spans, no empty links).

## Out of scope

- The placeholder pages (`/tech`, `/tools`, `/environment?category=npcs`) are unchanged and
  remain reachable by direct URL.
- No change to live sections/categories or the home hero category tags (all have data).
