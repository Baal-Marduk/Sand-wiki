# Category Icons + Loot Icon Display + Landmarks/Game Modes + instructions.md — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Swap category color-dots for monochrome react-icons; render loot as item icons+tooltips (no amount columns); populate Landmarks + Game Modes; start `instructions.md`.

**Architecture:** New `CategoryIcon` (react-icons/gi) replaces dots in 5 components. A shared `ItemIconLink` (extracted from recipe-cells) powers both recipe ingredients and loot grids. The env importer scrapes a category map (loot containers + landmarks + game modes). Loot item sprites come from a new `getItemIconMap` lookup on the crate page.

**Tech Stack:** Next.js 16, React 19, Prisma 6, Tailwind/DaisyUI, react-icons, Vitest, Playwright.

**Spec:** `sand-wiki/docs/superpowers/specs/2026-06-10-wiki-icons-landmarks-design.md`

**Commands:** from `d:/Documents/SandLabs`; app under `sand-wiki/`. `npm --prefix sand-wiki run {test,lint,build,test:e2e}`. Commit `git -C "d:/Documents/SandLabs"`. Branch `feat/wiki-icons-landmarks` (spec committed).

---

## File Structure
**Create:** `src/components/CategoryIcon.tsx`, `src/components/ItemIconLink.tsx`, `sand-wiki/instructions.md`.
**Modify:** `package.json` (react-icons), `src/components/{CategoryTag,CategoryQuickNav,MainNav,SearchBox,recipe-cells,LootTable,CrateDropList}.tsx`, `src/app/environment/page.tsx`, `src/app/environment/[slug]/page.tsx`, `src/lib/queries.ts`, `prisma/import-env-content.mjs`, `prisma/env-content.json`, `tests/e2e/wiki.spec.ts`.

---

## Task 1: react-icons + CategoryIcon, swap dots

- [ ] **Step 1: install** `npm --prefix sand-wiki i react-icons` → adds to dependencies.
- [ ] **Step 2: create `src/components/CategoryIcon.tsx`** (exact code from spec §1). After writing, verify imports resolve: `npx --prefix sand-wiki tsc --noEmit -p sand-wiki/tsconfig.json` — if any `react-icons/gi` name errors, replace with a close equivalent (e.g. `GiOpenChest`→`GiChest`, `GiFieldGun`→`GiCannon`, `GiOreMound`→`GiStoneStack`, `GiPerson`→`GiCharacter`) and re-check.
- [ ] **Step 3: swap dots → `<CategoryIcon slug=… />`** in each file, removing now-unused `categoryColor` imports:
  - `CategoryTag.tsx`: replace the dot `<span>` with `<CategoryIcon slug={slug} className="size-3.5" />`.
  - `CategoryQuickNav.tsx`: replace the dot with `<CategoryIcon slug={c.slug} className="size-4" />`.
  - `MainNav.tsx`: in the dropdown `<li>` map, replace the dot with `<CategoryIcon slug={c.slug} className="size-4" />`.
  - `SearchBox.tsx`: replace the option dot (`style={{ backgroundColor: categoryColor(f.category) }}`) with `<CategoryIcon slug={f.category} className="size-4" />` (works for both category and item rows — uses the row's category).
  - `environment/page.tsx`: replace the landing-card dot with `<CategoryIcon slug={c.slug} className="size-4" />`.
- [ ] **Step 4: build + lint** `npm --prefix sand-wiki run build && npm --prefix sand-wiki run lint` → success, no unused-var warnings.
- [ ] **Step 5: commit** `feat(wiki): replace category color dots with react-icons`.

---

## Task 2: ItemIconLink + loot icon grid + CrateDropList

**Files:** create `src/components/ItemIconLink.tsx`; modify `recipe-cells.tsx`, `LootTable.tsx`, `CrateDropList.tsx`, `queries.ts`, `environment/[slug]/page.tsx`.

- [ ] **Step 1: create `src/components/ItemIconLink.tsx`**
```tsx
import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

/** A single item shown as an icon with a hover/focus tooltip of its name, linked to the item
 *  page when a slug is known. Optional ×amount under it (recipes). Shared by recipes + loot. */
export function ItemIconLink({ slug, name, icon, amount }: { slug?: string; name: string; icon?: string | null; amount?: number }) {
  return (
    <div className="group relative flex flex-col items-center gap-0.5">
      {slug ? (
        <Link href={`/items/${slug}`} aria-label={name} className="block">
          <ItemIcon name={name} icon={icon} size="recipe" />
        </Link>
      ) : (
        <ItemIcon name={name} icon={icon} size="recipe" />
      )}
      {amount != null && <span className="text-xs text-base-content/60">×{amount}</span>}
      <span
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 whitespace-nowrap rounded-field border border-base-300 bg-base-100 px-2 py-1 text-xs text-base-content shadow-lg"
      >
        {name}
      </span>
    </div>
  );
}
```
(Note: when no `slug`, `ItemIcon` is non-decorative so it renders its own `alt`/`aria-label={name}`.)

- [ ] **Step 2: refactor `recipe-cells.tsx` `IngredientList`** to reuse it:
```tsx
import { ItemIconLink } from "@/components/ItemIconLink";
import type { RecipeCard, RecipeCardRow } from "@/lib/recipes";

export function IngredientList({ rows }: { rows: RecipeCardRow[] }) {
  if (rows.length === 0) return <span className="text-base-content/50">—</span>;
  return (
    <div className="flex flex-wrap gap-3">
      {rows.map((r, i) => (
        <ItemIconLink key={`${r.slug}-${i}`} slug={r.slug} name={r.name} icon={r.icon} amount={r.amount} />
      ))}
    </div>
  );
}
```
(Keep `WorkbenchBadge` unchanged. The recipe e2e — ingredient link has `aria-label` — must still pass.)

- [ ] **Step 3: `queries.ts`** — add an icon lookup:
```ts
export async function getItemIconMap(slugs: string[]): Promise<Record<string, string | null>> {
  if (slugs.length === 0) return {};
  const rows = await prisma.item.findMany({ where: { slug: { in: slugs } }, select: { slug: true, icon: true } });
  return Object.fromEntries(rows.map((r) => [r.slug, r.icon]));
}
```

- [ ] **Step 4: `LootTable.tsx`** → icon grid (drop columns/table):
```tsx
import { ItemIconLink } from "@/components/ItemIconLink";

export interface LootEntry { slug?: string; name: string; values: string[] }

export function LootTable({ entries, icons }: { entries: LootEntry[]; icons: Record<string, string | null> }) {
  if (entries.length === 0) return <p className="text-base-content/50">—</p>;
  return (
    <div className="flex flex-wrap gap-3">
      {entries.map((e, i) => (
        <ItemIconLink key={`${e.slug ?? e.name}-${i}`} slug={e.slug} name={e.name} icon={e.slug ? icons[e.slug] : null} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: crate `[slug]/page.tsx`** — fetch icons for all loot slugs, pass to `LootTable`:
```tsx
import { getEnvEntityBySlug, getItemIconMap } from "@/lib/queries";
// after computing `tiers`:
const lootSlugs = [...new Set(tiers.flatMap((t) => t.entries.map((e) => e.slug).filter(Boolean)))] as string[];
const icons = await getItemIconMap(lootSlugs);
// tab content:
const tabs: Tab[] = tiers.map((t) => ({
  id: t.tier.toLowerCase().replace(/\s+/g, "-"),
  label: t.tier,
  content: <LootTable entries={t.entries} icons={icons} />,
}));
```
(Remove the old `columns` usage; `LootShape` type drops `columns` reliance — keep it optional.)

- [ ] **Step 6: `CrateDropList.tsx`** — group by crate, drop Amount:
```tsx
import Link from "next/link";
import type { CrateDrop } from "@/lib/queries";

export function CrateDropList({ drops }: { drops: CrateDrop[] }) {
  const byCrate = new Map<string, { name: string; tiers: string[] }>();
  for (const d of drops) {
    const e = byCrate.get(d.crateSlug) ?? { name: d.crateName, tiers: [] };
    if (!e.tiers.includes(d.tier)) e.tiers.push(d.tier);
    byCrate.set(d.crateSlug, e);
  }
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>Crate</th><th>Tiers</th></tr></thead>
        <tbody>
          {[...byCrate.entries()].map(([slug, c]) => (
            <tr key={slug}>
              <td><Link href={`/environment/${slug}`} className="link">{c.name}</Link></td>
              <td className="whitespace-nowrap">{c.tiers.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7: build** → success. **Commit** `feat(wiki): loot as item icons+tooltips, drop amount columns`.

---

## Task 3: importer Landmarks + Game Modes

**Files:** modify `prisma/import-env-content.mjs`; regenerate `prisma/env-content.json`.

- [ ] **Step 1:** replace the single-category fetch with a category map (spec §3):
```js
const CATS = [
  { wiki: "Loot Container", slug: "loot-containers", loot: true },
  { wiki: "Landmarks", slug: "landmarks", loot: false },
  { wiki: "Gamemodes", slug: "game-modes", loot: false },
];
```
Loop categories; for each member build `out[titleToSlug(title)] = { category: cat.slug, name: title, description, sourceUrl }` and, only when `cat.loot`, attach `loot`. Keep the per-crate console summary; warn on slug collisions.
- [ ] **Step 2: run** `node sand-wiki/prisma/import-env-content.mjs`. Expect ~24 entities (7 loot + 15 landmarks + 2 game modes).
- [ ] **Step 3: spot-check** `env-content.json`: a landmark (`fort-arpad`) has `category:"landmarks"`, a description, sourceUrl; `storm-dive`/`voyage` have `category:"game-modes"`.
- [ ] **Step 4: commit** `feat(wiki): populate landmarks + game modes`.

---

## Task 4: `sand-wiki/instructions.md`

- [ ] **Step 1: write `sand-wiki/instructions.md`** with the sections from spec §4 (Overview, Data model, Data pipeline, Categories & rarity, UI conventions, and a `## Requirements / TODO (you specify here)` section with 2-3 starter bullets). Keep it concise and accurate to the current code.
- [ ] **Step 2: commit** `docs(wiki): start instructions.md`.

---

## Task 5: re-seed + e2e + full gate

**Files:** modify `tests/e2e/wiki.spec.ts`.

- [ ] **Step 1: re-seed** (DESTRUCTIVE, Neon dev DB — authorized). `npm --prefix sand-wiki run db:seed`. Spot-check: `envCategoryCounts()` → landmarks 15, game-modes 2, loot-containers 7.
- [ ] **Step 2: update/add e2e** in `wiki.spec.ts`:
  - Update `an unpopulated environment category shows coming soon` → use `npcs` (game-modes is now populated): `await page.goto("/environment?category=npcs")`.
  - Update `crate detail shows loot tier tabs with linked items`: keep the tab + `40mm Shell` link assertions; **add** `await expect(page.getByRole("columnheader", { name: /Shipwreck|Count/ })).toHaveCount(0);` (no amount columns).
  - Add:
```ts
test("landmarks and game modes are populated on the environment landing", async ({ page }) => {
  await page.goto("/environment");
  await page.getByRole("link", { name: /Landmarks/ }).click();
  await expect(page).toHaveURL(/category=landmarks/);
  await expect(page.getByRole("link", { name: "Fort Arpad" })).toBeVisible();
});

test("a game mode detail page shows its description", async ({ page }) => {
  await page.goto("/environment/storm-dive");
  await expect(page.getByRole("heading", { name: "Storm Dive" })).toBeVisible();
  await expect(page.getByRole("link", { name: /sandgame\.wiki/ })).toBeVisible();
});
```
  - (Optionally add `/environment/fort-arpad` to the a11y `pages` array.)
- [ ] **Step 3: full gate** (`:3000` stale-server caveat: build + `next start -p <other>` + throwaway `playwright.tmp.config.ts`): `npm --prefix sand-wiki run test`, `lint`, `build`, `test:e2e`. Green; axe clean on `/items`, `/environment`, a crate, an item, a landmark.
- [ ] **Step 4: commit** `test(wiki): icons + landmarks/game-modes e2e`.

---

## Self-Review notes (author)
- **Spec coverage:** §1→Task 1; §2→Task 2; §3→Task 3; §4→Task 4; verification→Task 5.
- **Type consistency:** `ItemIconLink {slug?,name,icon?,amount?}` used by recipe-cells (T2.2) + LootTable (T2.4). `LootTable` now takes `{entries,icons}` — crate page (T2.5) passes both. `CategoryIcon {slug,className?}` used in 5 files (T1). `getItemIconMap`/`CrateDrop` consistent.
- **Re-seed** required (T5), destructive/authorized.
- **react-icons name risk:** T1.2 verifies + lists fallbacks.
