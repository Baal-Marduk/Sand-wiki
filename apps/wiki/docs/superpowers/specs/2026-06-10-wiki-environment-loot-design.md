# SAND Wiki — Environment section (Loot Containers pilot) design

Date: 2026-06-10

## Goal

Stand up the **Environment** section (currently a "coming soon" placeholder) as a real,
data-driven section, and populate its first category — **Loot Containers** — with content
imported from sandgame.wiki. The model and section support the other categories
(Landmarks, Game Modes, NPCs) for later; this pilot only fills Loot Containers.

## Context / findings (sandgame.wiki recon, 2026-06-10)

- Relevant categories that exist: **Loot Container (7)**, **Landmarks (15)**, **Gamemodes (2)**.
  There is **NO** NPCs / Enemies / Bosses / Outposts category — no source for NPCs.
- All these pages are **prose-only stubs** (50–150 words). Loot tables, where present, are
  near-empty placeholders (e.g. Weapon Crate lists only "Crowns 10–20"). So there is no
  structured data to scrape — only a short lead description per page.
- The 7 Loot Containers: Crate of Shells, Food Crate, Medical Cabinet, Parts Crate,
  Suspicious Pile of Sand, Valuables Safe, Weapon Crate.

## Decisions (from brainstorming)

- **New Prisma model `EnvEntity`** (not overloading `Item` — these have no recipes/rarity/stats).
- **One-off committed snapshot** importer → `prisma/env-content.json`, merged at seed.
- **NPCs** stay listed but show a "coming soon / no data yet" state (no source).
- **"Outposts" → renamed "Landmarks"** (the wiki's own term).
- **Descriptions imported mostly as-is from the wiki, with a per-page source-attribution link.**
- **Pilot = Loot Containers only.** Landmarks / Game Modes / NPCs categories exist in the
  section but are unpopulated → "coming soon" state on their category views.

---

## §1 — Data model

**Migration `add_env_entity`** — new model:
```prisma
model EnvEntity {
  id          String  @id @default(cuid())
  slug        String  @unique
  category    String
  name        String
  description String?
  sourceUrl   String?
  icon        String?
  @@index([category])
}
```
`category` ∈ `loot-containers | landmarks | game-modes | npcs` (validated at seed against the
environment section's category slugs). `description` is plain text (light markdown allowed but
not required). No relations to `Item` in this pilot.

---

## §2 — Data acquisition

**New `prisma/wiki-text.mjs`** — pure, unit-tested helper `stripWikiMarkup(wikitext): string`:
- Remove templates `{{…}}` (brace-matched, nested-safe — reuse the brace-matching approach
  from `wiki-parse.mjs`), `<tabber>`/`<blockquote>`/HTML tags, `[[File:…]]`/`[[Category:…]]`.
- Convert links: `[[Target|Label]]` → `Label`, `[[Target]]` → `Target`.
- Strip `'''`/`''` emphasis. Collapse blank lines/whitespace.
- Return the **lead section**: text before the first `==heading==`. Trim to a clean paragraph(s).

**New `prisma/import-env-content.mjs`** (committed one-off; reuses the MediaWiki API pattern
from `import-wiki-enrichment.mjs`):
1. `list=categorymembers` for `Category:Loot Container` (ns 0).
2. For each page: fetch `action=parse&prop=wikitext&redirects=1`; `stripWikiMarkup` → description.
3. `slug` = kebab-case of the page title (lowercase, non-alphanumeric → `-`, collapse).
4. Emit `prisma/env-content.json` sorted by slug:
   ```json
   { "weapon-crate": { "category": "loot-containers", "name": "Weapon Crate",
     "description": "…", "sourceUrl": "https://sandgame.wiki/index.php/Weapon_Crate" } }
   ```
5. Print summary (pages, chars per description, any empty descriptions).

**Test** `prisma/wiki-text.test.ts`: `stripWikiMarkup` over a fixture with a template, a
tabber, `[[Link|label]]`, bold, and a trailing `==Heading==` section — asserts clean lead text
with markup removed and the heading section dropped.

Expected output: 7 loot-container entries with short descriptions.

---

## §3 — Taxonomy & nav

In `src/lib/taxonomy.ts`:
- `environment` section: `kind: "placeholder"` → `kind: "data"`.
- Its categories → `[{loot-containers, "Loot Containers"}, {landmarks, "Landmarks"},
  {game-modes, "Game Modes"}, {npcs, "NPCs"}]` (rename `outposts`→`landmarks`).
- Add an exported helper `isEnvCategory(slug)` + `ENV_CATEGORIES` (mirroring the item-category
  helpers) for validation in pages/seed.
- Add accent colors for the four env category slugs to the existing `CATEGORY_COLORS` map in
  `taxonomy.ts` (so `categoryColor(slug)` returns a real color for nav dots + cards instead of
  the `misc` fallback). Pick distinct hexes consistent with the desert palette.

Effect: `MainNav` already renders a hover dropdown for `kind: "data"` sections with
`categories.length > 0`, so Environment gains a dropdown listing the four categories, each
linking to `/environment?category=<slug>` (same component, no MainNav change needed).

Update `taxonomy.test.ts`: environment section kind/categories; new helper.

---

## §4 — Queries

`src/lib/queries.ts`:
```ts
export async function listEnvEntities(category?: string) {
  return prisma.envEntity.findMany({
    where: category ? { category } : {},
    orderBy: { name: "asc" },
  });
}
export async function getEnvEntityBySlug(slug: string) {
  return prisma.envEntity.findUnique({ where: { slug } });
}
export async function envCategoryCounts(): Promise<Record<string, number>> {
  const rows = await prisma.envEntity.groupBy({ by: ["category"], _count: true });
  return Object.fromEntries(rows.map((r) => [r.category, r._count]));
}
```

---

## §5 — UI

**`src/components/EnvCard.tsx`** — a card for an env entity: icon placeholder (reuse `ItemIcon`
with no icon → glyph) + name, linking to `/environment/<slug>`. Mirrors `ItemCard`'s squared
style.

**`src/app/environment/page.tsx`** (replace the placeholder):
- Reads `?category=`. Validate via `isEnvCategory`.
- **No category:** landing — `h1 "Environment"` + a grid of the four category cards
  (`/environment?category=<slug>`), each with its color dot, label, and either a count
  (Loot Containers: 7) or a muted "coming soon" tag (the unpopulated ones).
- **`?category=loot-containers`:** `h1` + grid of `EnvCard` for `listEnvEntities("loot-containers")`.
- **`?category=` of an unpopulated category (landmarks/game-modes/npcs):** show the heading + a
  "coming soon — not available yet" notice (the `listEnvEntities` result is empty).

**`src/app/environment/[slug]/page.tsx`** (new): `getEnvEntityBySlug`; `notFound()` if missing.
Renders `h1 name`, the `description` as paragraphs, a category badge, and a
"Source: sandgame.wiki ↗" link (`sourceUrl`, `target=_blank rel="noopener noreferrer"`).
A "← Back to Environment" link.

A11y: source link has discernible text; category dots decorative; axe clean both themes.

---

## §6 — Seed

`prisma/seed.ts`: after items/recipes, load `env-content.json`, `deleteMany` on `envEntity`,
then create each entry (validate `category` via `isEnvCategory`, warn+skip unknown). Re-seed
required.

---

## Testing & verification

- **Unit (Vitest):** `stripWikiMarkup` (markup removal + lead-section); slug helper; updated
  `taxonomy.test.ts` (env section kind/categories, `isEnvCategory`).
- **Build / lint.**
- **e2e (Playwright):**
  - `/environment` shows "Loot Containers" with a count and the others as coming-soon.
  - `/environment?category=loot-containers` lists containers (e.g. a link to `/environment/weapon-crate`).
  - `/environment/weapon-crate` shows a description and a Source link to sandgame.wiki.
  - The old "environment shows coming-soon placeholder" e2e is replaced.
  - axe clean on `/environment` and an env detail page (dark + light).
- **Data:** run importer → spot-check `env-content.json` (7 entries, non-empty descriptions);
  re-seed; confirm `listEnvEntities("loot-containers")` returns 7.

## Risks / notes

- Content is thin/stub-quality and reflects the wiki's gaps; this is a scaffold to enrich later.
- Re-seed is destructive (Neon dev DB) — confirm/authorized per workflow.
- Verbatim prose is imported with attribution; it's a community fan wiki. Keep the source link.
- The `environment` nav entry becomes a dropdown; the e2e for the nav menu (Items) is unaffected.
- Tech/Tramplers/Tools remain `SectionPlaceholder`.
