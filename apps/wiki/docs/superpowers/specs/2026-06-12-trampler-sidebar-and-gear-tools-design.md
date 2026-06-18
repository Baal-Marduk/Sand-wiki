# Trampler category sidebar + Player Gear tools

**Date:** 2026-06-12
**Status:** Approved design

Two independent features:

1. A category sidebar on the trampler part-list view, reusing the items-page pattern.
2. Five wiki-authored Player Gear items (Binoculars, Flashlight, Multitool, Map, Flare Gun) added to the `tools` item category, with descriptions sourced from `sandgame.wiki` and icons from the scraped sprite set.

---

## Part 1 — Trampler category sidebar

### Problem

The items page ([src/app/items/page.tsx](../../../src/app/items/page.tsx)) shows a persistent category switcher ([CategoryQuickNav](../../../src/components/CategoryQuickNav.tsx)) — a sticky vertical list on `lg+`, a horizontal scroll row of chips below `lg`, with active-state highlighting and per-category icons.

The tramplers page ([src/app/tramplers/page.tsx](../../../src/app/tramplers/page.tsx)) has no such nav. It is two-level: a landing grid of category cards (with counts), then a flat grid of parts once a category is chosen (`?category=X`). From the part list there is no way to switch categories except using the browser back button.

### Design

Generalize `CategoryQuickNav` and reuse it on the trampler part-list view.

**`CategoryQuickNav` change (backward compatible):**
- Add a `basePath` prop, default `"/items"`. The internal `href` builder uses `basePath` instead of the hardcoded `/items`.
- Keep the existing `query`/`sort` props; they remain items-specific and simply aren't passed by the tramplers caller.
- No change to markup, styling, or the items-page call site (the default keeps it working).

**Tramplers page change:**
- The **landing view** (no `category`) is unchanged — the card grid stays as the section entry point.
- The **part-list view** (`category` set) wraps its content in the same responsive two-column layout the items page uses: `grid gap-6 lg:grid-cols-[1fr_220px] items-start`, parts grid in `order-2 lg:order-1`, `CategoryQuickNav` in `order-1 lg:order-2`.
- The sidebar is rendered with `categories={TRAMPLER_CATEGORIES}`, `current={category}`, `basePath="/tramplers"`.
- The "Coming soon — no entries yet" empty-state alert stays, but now sits inside the content column so the sidebar is still present on empty categories.

`CategoryIcon` already renders trampler-category slugs (the landing cards use it today), so icons require no new work.

### Testing

- Unit/integration: existing tests for the items page must stay green (regression guard on the `basePath` default).
- Manual: visit `/tramplers?category=chassis`; confirm the sidebar lists all trampler categories, highlights the active one, links preserve no stray params, and the layout collapses to chips on narrow viewports.

---

## Part 2 — Player Gear tools

### Problem

The user wants five handheld gear items — Binoculars, Flashlight, Multitool, Map, Flare Gun — in the wiki's `tools` item category, each with a description and an icon. None exist as items today. The descriptions are to come from the game wiki.

### Source mapping (confirmed against sandgame.wiki)

All five live in the wiki's `Player Gear` category. Two use different internal names than the user's:

| User's name | Wiki page | Sprite (in sand-scraper `out/icons/`) | slug | id |
|---|---|---|---|---|
| Binoculars | `Binoculars` | `icon_item_binocular.png` | `binoculars` | `item_binocular` |
| Flashlight | `Lamp` | `icon_flashlight_on.png` | `flashlight` | `item_lamp` |
| Multitool | `Repair Tool` | `icon_multiTool.png` | `multitool` | `item_multiTool` |
| Map | `Map` | `icon_tool_map.png` | `map` | `item_map` |
| Flare Gun | `Flare Gun` | `icon_tool_flaregun.png` | `flare-gun` | `item_flareGun` |

Display names use the user's terms (Flashlight, Multitool), not the wiki internal names.

### Descriptions

Cleaned prose bodies from each wiki page — `[[wikilinks]]` flattened to plain text, `{{templates}}`, `[[File:…]]` captions, and `[[Category:…]]` tags removed, and the Flare Gun's incomplete "(Insert colors here)" sentence dropped. Final text to seed:

- **Binoculars:** "The Binoculars are one of the pieces of Player Gear carried by all explorers of Sophie. They can be used to see across far distances and are useful for scouting out locations as well as keeping a lookout for other players and Tramplers."
- **Flashlight:** "The Lamp is one of the pieces of Player Gear carried by all explorers of Sophie. It can be toggled on and off by clicking on the item inside the player's inventory. When on, the lamp provides limited illumination in front of the player, which can be useful during the night when visibility is poor. Note: other players are able to see the illumination provided by your lamp, so keep an eye on your surroundings."
- **Multitool:** "The Repair Tool, or Multitool, is one of the pieces of Player Gear carried by all explorers of Sophie. It can be used in or out of battle to quickly repair damage to doors, compartments, pipes, and hatches on your Trampler."
- **Map:** "The Map is one of the pieces of Player Gear carried by all explorers of Sophie; Tramplers also come equipped with a map mounted to the central steering column of the steering deck. The map takes the form of old nautical charts from back when Sophie still had liquid water on its surface. As this is no longer the case, maps now contain little useful information beyond the locations of Landmarks such as ports and military forts — the rest is out of date, shrouded in a fog of war. As the player traverses the dried-up sea floors of Sophie they slowly fill in the chart to reflect the land's new topography, and updates are reflected across both the player's personal map and the map of any Trampler they own. Because landmarks and terrain are randomly generated for each lobby, any progress filling in a map is lost upon extraction; every expedition begins with a fresh map obscured by fog of war, except for the player's immediate surroundings at spawn."
- **Flare Gun:** "The Flare Gun is one of the pieces of Player Gear carried by all explorers of Sophie. It is able to shoot colored flares high into the sky, where they burst into a colored cloud depending on the flare that is loaded. Flares deal no damage and do not burst unless shot upwards, although they leave a smaller smoke trail of their color in their wake regardless of how they are fired. Flares are useful for signaling to teammates and other Tramplers."

### Data storage — `prisma/gear.json`

The seed ([prisma/seed.ts](../../../prisma/seed.ts)) treats `data.json` as the canonical scraped snapshot: it prunes any `Item` whose slug is not in `data.items` and asserts `prisma.item.count() === data.items.length`. Hand-authored items therefore cannot live in a side file unless the seed is taught to merge them.

Introduce `prisma/gear.json` — a new wiki-authored item source mirroring the env-content / tramplers content-file pattern. Shape per entry matches the fields seed.ts reads off a scraped item:

```jsonc
[
  {
    "slug": "binoculars",
    "id": "item_binocular",
    "name": "Binoculars",
    "description": "…",
    "type": null,
    "isResource": false,
    "storageStack": null,
    "workbenchTier": null,
    "fromCatalog": false
  }
  // … flashlight, multitool, map, flare-gun
]
```

**seed.ts change:** read `gear.json`, concatenate it onto `data.items` into a single `items` list used by (a) the upsert loop, (b) the prune `notIn` set, and (c) the count assertion. The merged list is the single source of truth for the rest of the seed — one concat near the top, then `data.items` references become the merged list. Guard against a gear slug colliding with a scraped slug (throw on duplicate).

This keeps wiki-authored gear isolated from scraped data, survives a scraper re-run that overwrites `data.json`, and preserves both seed guards.

### Category — `CATEGORY_OVERRIDES`

The gear items have `type: null`, so `categoryForItem` would map them to `misc`. Add all five slugs to `CATEGORY_OVERRIDES` in [src/lib/taxonomy.ts](../../../src/lib/taxonomy.ts) → `"tools"`, the documented mechanism for items the type mapping gets wrong. They then list under `/items?category=tools` and each gets a `/items/[slug]` detail page automatically.

### Icons

- Copy the five sprites from the sand-scraper worktree `out/icons/` into `public/icons/`:
  `icon_item_binocular.png`, `icon_flashlight_on.png`, `icon_multiTool.png`, `icon_tool_map.png`, `icon_tool_flaregun.png`.
- Add `id → path` entries to [prisma/icons.json](../../../prisma/icons.json) (keyed by item `id`, value `icons/<file>.png`), so seed's `iconFor(id)` resolves them to `/icons/<file>.png` exactly like every other item icon.

No rarity is added (Player Gear carries no rarity infobox); the seed default applies.

### Testing

- `seed-transform` / seed unit tests stay green; add coverage for the gear-merge (merged count, duplicate-slug throw) if a natural seam exists.
- Manual: run the seed against the dev DB, then visit `/items?category=tools` — confirm all five appear with icons; open each detail page and confirm the description renders.

---

## Out of scope

- The top-level **Tools** section stays a placeholder (these are inventory items, not the retired tech-tree calculator).
- No flare-color sub-items, recipes, or stats for the gear (none on the wiki).
- No sidebar on the trampler **landing** view — only the part-list view.
