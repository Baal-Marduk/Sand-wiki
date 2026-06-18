# SAND Wiki — Loot container contents (tiers + items) design

Date: 2026-06-10

## Goal

Scrape each Loot Container's **loot table** from sandgame.wiki and surface it: on the crate
detail page as **tier tabs** (Normal / Rare / Very Rare) listing the contained items with
icons (linked to item pages); and on each item's detail page as a new **"Loot" tab** linking
back to the crates (and tiers) that drop it.

## Context / findings (sandgame.wiki recon, 2026-06-10)

- Loot tables live in the `==Loot Table==` section as a `<tabber>` of tier tabs whose labels
  embed the crate name (e.g. `Normal Crate of Shells=`, `Rare Crate of Shells=`).
- Each tier is a `wikitable`. **Column headers vary per crate**: Crate of Shells uses
  `Shipwreck Amount` / `Landmark Amount`; Weapon Crate uses `Count` / `Chance`. Rows use
  `rowspan` ("One of either:") and `colspan` cells, so position-based cell parsing is fragile.
- Items appear as `{{Icon|<key>|3=<Display Name>|4=right}}`; amounts are bolded `'''…'''` cells.
- Coverage (recon): Crate of Shells, Food Crate, Parts Crate, Valuables Safe — populated;
  Medical Cabinet — sparse (Optic Lenses); Weapon Crate — only a Crowns placeholder;
  Suspicious Pile of Sand — no loot table.
- **17 of 19** distinct loot item names match existing items by normalized name (+ the existing
  `wiki-overrides.json`, e.g. Coral Chunks → resource-coral-piece). Misses (Pneumatic
  Components, etc.) render as plain text without an icon/link.

## Decisions (from brainstorming)

- Tier labels normalized to **Normal / Rare / Very Rare** (crate name stripped).
- **Loot tab on all item types** that appear in any crate (not only weapons).
- Columns captured **dynamically** (whatever headers the tier table has) and rendered as-is,
  because they differ between crates.
- Robust extraction: items via `{{Icon|…|3=Name}}`; the bolded `'''…'''` cells that follow an
  item icon are its column values (ignores rowspan grouping text). Avoids brittle full-table parsing.

---

## §1 — Loot parser

**Add to `prisma/wiki-text.mjs`** a pure, unit-tested `parseLootTable(wikitext, crateName)`:

1. Slice the `==Loot Table==` section (from the heading to the next same-or-higher heading or EOF).
   If absent → return `[]`.
2. Strip `<tabber>`/`</tabber>`; split into tier chunks on the tabber separator `\n|-|\n`.
   Each chunk begins `Label=` (the first chunk's label follows `<tabber>` directly).
3. Per chunk: `tier = label.replace(crateName, "").trim()` → e.g. "Normal"; ignore a chunk whose
   tier ends up empty/unknown.
4. **Columns:** collect header cells (lines starting with `!`), take the text after the last `|`
   in each (strips `style=…|`/`colspan=…|`), trim; drop the one equal to "Item". Result e.g.
   `["Shipwreck Amount","Landmark Amount"]` or `["Count","Chance"]`.
5. **Entries:** scan the chunk for `{{Icon|…|3=<Name>}}` occurrences in order. For each item,
   collect the bolded values `'''(.+?)'''` that appear after it and before the next item icon →
   `values: string[]`. Entry = `{ name, values }`.
6. Return `[{ tier, columns, entries }]` ordered Normal → Rare → Very Rare (known order; unknown
   tiers appended).

Signature: `parseLootTable(wikitext: string, crateName: string): { tier: string; columns: string[]; entries: { name: string; values: string[] }[] }[]`.

**Test** `wiki-text.test.ts`: a fixture mirroring the real Crate of Shells Normal tier — asserts
tier "Normal", columns `["Shipwreck Amount","Landmark Amount"]`, and entries for 40mm/70mm/80mm
Shell + Fabric Scraps each with values `["10-20","10-20"]`. Plus a no-loot-table case → `[]`.

---

## §2 — Importer + schema

**`prisma/import-env-content.mjs`:** for each loot container also compute
`loot = { tiers: parseLootTable(wt, title).map(t => ({ ...t, entries: t.entries.map(resolve) })) }`,
where `resolve` adds `slug` via the same normalized-name index + `wiki-overrides.json` used for
items (entry shape `{ slug?: string, name, values }`). Omit `loot` when there are no tiers.
Re-emit `prisma/env-content.json` (now with `loot` on populated crates).

**Migration `add_env_loot`:** add `loot Json?` to `EnvEntity`.

Stored shape:
```json
"loot": { "tiers": [
  { "tier": "Normal", "columns": ["Shipwreck Amount","Landmark Amount"],
    "entries": [ { "slug": "small-cannon-ammo", "name": "40mm Shell", "values": ["10-20","10-20"] } ] }
] }
```

**Seed:** store `loot` (cast `as Prisma.InputJsonValue`) alongside the other EnvEntity fields.

---

## §3 — Queries

`src/lib/queries.ts`:
- `getEnvEntityBySlug` already returns the full row incl. `loot`.
- New `getCratesContaining(itemSlug)`: load all env entities that have `loot` (`where: { loot: { not: Prisma.JsonNull } }` — or load loot-bearing crates and filter in JS, since there are ≤7), and return
  `{ crateSlug, crateName, tier, values, columns }[]` for every tier-entry whose `slug === itemSlug`.

---

## §4 — Crate detail UI (tier tabs)

`src/app/environment/[slug]/page.tsx`: when `entity.loot?.tiers?.length`, render the existing
`ItemTabs` client component with one tab per tier (label = tier name). Each tab body is a new
**`LootTable`** component:
- `src/components/LootTable.tsx` — props `{ columns: string[]; entries: { slug?: string; name: string; values: string[] }[] }`.
- Renders a `<table>`: header `Item` + the dynamic `columns`. Each row: an `ItemIcon`
  (size `recipe`, linked to `/items/<slug>` with `aria-label={name}` when `slug` present; plain
  icon + name text when not) + the item name, then one cell per value.
- Reuses the recipe-cell icon pattern; no rarity tint (keep neutral in tables).

Crates with no loot (Suspicious Pile of Sand) render description only (no tabs). The description
stays above the tabs.

---

## §5 — Item detail "Loot" tab

- `src/lib/item-view.ts`: add `"loot"` to the `TabId` union (so the tab id is typed). Leave
  `availableTabs(trades)` unchanged — it stays trade-driven.
- `src/app/items/[slug]/page.tsx`: call `getCratesContaining(item.slug)`; build the tabs from
  `availableTabs(trades)` as today, then **append** a `{ id: "loot", label: "Loot", content: <CrateDropList …> }`
  tab when the drops array is non-empty. Final order: Crafted by → Used in → Buy → Sell → **Loot**.
- `src/components/CrateDropList.tsx` — props `{ drops: { crateSlug; crateName; tier; values; columns }[] }`.
  A table: **Crate** (link to `/environment/<crateSlug>`) · **Tier** · **Amount** (join `values`
  with a separator, or show under the crate's column labels compactly, e.g. `10-20 / 10-20`).

---

## §6 — Verification

- **Unit (Vitest):** `parseLootTable` (real Crate-of-Shells fixture: tiers, dynamic columns,
  entries+values; rowspan "One of either:" ignored; no-table → []). Existing `wiki-text` +
  taxonomy tests still pass.
- **Build / lint.**
- **e2e (Playwright):**
  - `/environment/crate-of-shells` shows tier tabs (Normal/Rare/Very Rare) and, in a tab, a
    linked loot item (e.g. a link to `/items/small-cannon-ammo` "40mm Shell").
  - `/items/small-cannon-ammo` shows a **Loot** tab linking to `/environment/crate-of-shells`.
  - axe clean on a crate detail + the item page (both themes).
- **Data:** run importer → spot-check `env-content.json` loot for `crate-of-shells`
  (3 tiers, shells resolved to slugs); re-seed; `getCratesContaining("small-cannon-ammo")` non-empty.

## Risks / notes

- Loot tables are community-authored and uneven (Weapon Crate ≈ Crowns only; Suspicious Pile
  empty). The importer captures what exists; gaps are expected.
- The bolded-value heuristic assumes amounts are the only bolded cells in a tier table — true in
  the observed data; if a future page bolds other text, values could over-collect (acceptable,
  low risk; the parser test guards the known shape).
- Re-seed is destructive (Neon dev DB) — authorized per workflow.
- `ItemTabs` is reused for the crate page (already a client component with proper ARIA tablist).
