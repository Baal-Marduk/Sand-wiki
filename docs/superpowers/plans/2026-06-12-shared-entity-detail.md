# Shared EntityDetail Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the item, trampler-part, and environment-entity leaf pages through one shared `EntityDetail` shell so they stay consistent and centered, with each page reduced to data-mapping.

**Architecture:** A presentational `EntityDetail` component owns the page skeleton (breadcrumb + Suggest top row, header with optional icon/badges/description/stat-grid, an adaptive body that shows a `ItemDetailsPanel` sidebar only when detail rows exist, and an optional source-link footer). Pure data-mapping helpers live in `src/lib`. The prominent stat grid is extracted to a shared `StatGrid`.

**Tech Stack:** Next.js 16 (App Router, React Server Components), TypeScript, Tailwind + DaisyUI, Prisma. Tests: Vitest (node env, `src/lib/**/*.test.ts` — pure logic only) and Playwright e2e (`tests/e2e/wiki.spec.ts` — rendered pages).

**Testing strategy:** This codebase unit-tests only pure logic in `src/lib` (Vitest is configured `environment: "node"`, include `src/**/*.test.ts`) and verifies rendered output with Playwright e2e. There is no React-component unit harness (no jsdom/RTL) and we will not introduce one. So: pure mapping logic is TDD'd in `src/lib`; presentational components and pages are verified with `tsc --noEmit`, `eslint`, the existing e2e suite (which already locks item/env detail behavior), and extended e2e assertions for the new normalized behaviors.

**Conventions used throughout:**
- Run typecheck: `node_modules/.bin/tsc --noEmit -p tsconfig.json` from `sand-wiki/`.
- Run lint: `node_modules/.bin/eslint <paths>` from `sand-wiki/`.
- Run unit tests: `node_modules/.bin/vitest run <file>` from `sand-wiki/`.
- All paths below are relative to `sand-wiki/`. Work happens on branch `feat/shared-entity-detail` (already created).

---

## Task 1: Extend `categoryLabel` to resolve environment category labels

**Why:** `CategoryTag` calls `categoryLabel(slug)`, which today only searches item + trampler categories and falls back to the raw slug. The environment header will use `CategoryTag`, so env slugs (e.g. `loot-containers`) must resolve to labels (`Loot Containers`).

**Files:**
- Modify: `src/lib/taxonomy.ts:72-78`
- Test: `src/lib/taxonomy.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/taxonomy.test.ts`:

```ts
import { categoryLabel } from "@/lib/taxonomy";

test("categoryLabel resolves environment category slugs", () => {
  expect(categoryLabel("loot-containers")).toBe("Loot Containers");
  expect(categoryLabel("game-modes")).toBe("Game Modes");
});

test("categoryLabel still resolves item and trampler slugs and falls back to the slug", () => {
  expect(categoryLabel("weapons")).toBe("Weapons");
  expect(categoryLabel("chassis")).toBe("Chassis");
  expect(categoryLabel("does-not-exist")).toBe("does-not-exist");
});
```

(If the file already imports `categoryLabel`, don't duplicate the import — add only the `test(...)` blocks.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/taxonomy.test.ts`
Expected: FAIL — `categoryLabel("loot-containers")` returns `"loot-containers"`, not `"Loot Containers"`.

- [ ] **Step 3: Implement — search all sections**

Replace `categoryLabel` in `src/lib/taxonomy.ts` (currently lines 72-78):

```ts
export function categoryLabel(slug: string): string {
  for (const section of SECTIONS) {
    const found = section.categories.find((c) => c.slug === slug);
    if (found) return found.label;
  }
  return slug;
}
```

(`SECTIONS` is defined earlier in the same file, so it is in scope.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run src/lib/taxonomy.test.ts`
Expected: PASS (all tests, including pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxonomy.ts src/lib/taxonomy.test.ts
git commit -m "feat(wiki): categoryLabel resolves env category labels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add shared `StatCell` type and the `trampler-view` mapping helpers

**Why:** The trampler page builds its stat grid and (newly) its Details-panel rows inline. Move that to a tested `lib/trampler-view.ts`, mirroring `lib/item-view.ts`. Also add the shared `StatCell` type used by `StatGrid`, `StatBox`, and trampler stats.

**Files:**
- Modify: `src/lib/item-view.ts:1-7` (add `StatCell`)
- Create: `src/lib/trampler-view.ts`
- Test: `src/lib/trampler-view.test.ts`

- [ ] **Step 1: Add the `StatCell` type to `item-view.ts`**

At the top of `src/lib/item-view.ts`, add a `ReactNode` type import and the `StatCell` interface (place it just below the existing `DetailRow` interface at line 7):

```ts
import type { ReactNode } from "react";

/** A cell in the prominent stat grid (StatGrid). */
export interface StatCell { label: string; value: ReactNode }
```

(Add the `import type { ReactNode } from "react";` line alongside the other imports at the top of the file. Do not remove existing imports.)

- [ ] **Step 2: Write the failing test**

Create `src/lib/trampler-view.test.ts`:

```ts
import { test, expect } from "vitest";
import { tramplerStatCells, tramplerDetailRows } from "@/lib/trampler-view";

const base = {
  dimensions: null, health: null, weight: null, weightCapacity: null,
  weightCompensation: null, energyConsumption: null, energyCapacity: null,
  ratedPower: null, crewSlots: null, itemSlots: null,
  researchNode: null, researchName: null, researchTier: null,
};

test("tramplerStatCells includes only the stats that have a value, in order", () => {
  const cells = tramplerStatCells({ ...base, dimensions: "4x6", health: 2400, crewSlots: 2 });
  expect(cells).toEqual([
    { label: "Dimensions", value: "4x6" },
    { label: "Health", value: 2400 },
    { label: "Crew Slots", value: 2 },
  ]);
});

test("tramplerStatCells keeps zero values (only null/empty are dropped)", () => {
  const cells = tramplerStatCells({ ...base, weight: 0, dimensions: "" });
  // weight 0 is kept; empty-string dimensions is dropped
  expect(cells).toEqual([{ label: "Weight", value: 0 }]);
});

test("tramplerDetailRows joins research node + name and adds a tier row", () => {
  const rows = tramplerDetailRows({ ...base, researchNode: "Hulls", researchName: "Steel Frame", researchTier: 3 });
  expect(rows).toEqual([
    { label: "Research", value: "Hulls. Steel Frame" },
    { label: "Research Tier", value: "3" },
  ]);
});

test("tramplerDetailRows omits rows with no data", () => {
  expect(tramplerDetailRows(base)).toEqual([]);
  expect(tramplerDetailRows({ ...base, researchTier: 0 })).toEqual([{ label: "Research Tier", value: "0" }]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/lib/trampler-view.test.ts`
Expected: FAIL — `Cannot find module '@/lib/trampler-view'`.

- [ ] **Step 4: Implement `trampler-view.ts`**

Create `src/lib/trampler-view.ts`:

```ts
import type { StatCell, DetailRow } from "@/lib/item-view";

/** The numeric/spec fields on a trampler part shown in the prominent stat grid. */
export interface TramplerStatFields {
  dimensions: string | null;
  health: number | null;
  weight: number | null;
  weightCapacity: number | null;
  weightCompensation: number | null;
  energyConsumption: number | null;
  energyCapacity: number | null;
  ratedPower: number | null;
  crewSlots: number | null;
  itemSlots: number | null;
}

/** Prominent stat-grid cells — only fields that have a value. Numeric 0 is kept;
 *  null and empty strings are dropped. Order is fixed. */
export function tramplerStatCells(part: TramplerStatFields): StatCell[] {
  const cells: StatCell[] = [];
  if (part.dimensions) cells.push({ label: "Dimensions", value: part.dimensions });
  if (part.health != null) cells.push({ label: "Health", value: part.health });
  if (part.weight != null) cells.push({ label: "Weight", value: part.weight });
  if (part.weightCapacity != null) cells.push({ label: "Weight Capacity", value: part.weightCapacity });
  if (part.weightCompensation != null) cells.push({ label: "Weight Compensation", value: part.weightCompensation });
  if (part.energyConsumption != null) cells.push({ label: "Energy Consumption", value: part.energyConsumption });
  if (part.energyCapacity != null) cells.push({ label: "Energy Capacity", value: part.energyCapacity });
  if (part.ratedPower != null) cells.push({ label: "Rated Power", value: part.ratedPower });
  if (part.crewSlots != null) cells.push({ label: "Crew Slots", value: part.crewSlots });
  if (part.itemSlots != null) cells.push({ label: "Item Slots", value: part.itemSlots });
  return cells;
}

/** The research fields on a trampler part shown in the Details sidebar. */
export interface TramplerResearchFields {
  researchNode: string | null;
  researchName: string | null;
  researchTier: number | null;
}

/** Details-panel rows for a trampler part: a joined Research row and a Research Tier row,
 *  each only when present. */
export function tramplerDetailRows(part: TramplerResearchFields): DetailRow[] {
  const rows: DetailRow[] = [];
  const research = [part.researchNode, part.researchName].filter(Boolean).join(". ");
  if (research) rows.push({ label: "Research", value: research });
  if (part.researchTier != null) rows.push({ label: "Research Tier", value: String(part.researchTier) });
  return rows;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run src/lib/trampler-view.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck and commit**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

```bash
git add src/lib/item-view.ts src/lib/trampler-view.ts src/lib/trampler-view.test.ts
git commit -m "feat(wiki): StatCell type + trampler-view mapping helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Extract `StatGrid` and refactor `StatBox` to use it

**Why:** The prominent stat-grid `<dl>` markup is duplicated between `StatBox` and the trampler page. Extract one presentational component.

**Files:**
- Create: `src/components/StatGrid.tsx`
- Modify: `src/components/StatBox.tsx`

- [ ] **Step 1: Create `StatGrid.tsx`**

Create `src/components/StatGrid.tsx`:

```tsx
import type { StatCell } from "@/lib/item-view";

/** Prominent grid of label/value stat cells. Renders nothing when empty. */
export function StatGrid({ cells }: { cells: StatCell[] }) {
  if (cells.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-base-300 rounded-box overflow-hidden">
      {cells.map((c) => (
        <div key={c.label} className="bg-base-200 px-3 py-2">
          <dt className="text-[0.65rem] uppercase tracking-wide text-base-content/60">{c.label}</dt>
          <dd className="font-medium">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 2: Refactor `StatBox.tsx` to build cells and delegate to `StatGrid`**

Replace the body of `src/components/StatBox.tsx` (keep the `ItemStatFields` interface unchanged) so it builds `StatCell[]` and returns `<StatGrid>`:

```tsx
import type { StatCell } from "@/lib/item-view";
import { StatGrid } from "@/components/StatGrid";

/** The flat wiki-stat columns on Item that StatBox renders. */
export interface ItemStatFields {
  statType: string | null;
  damage: number | null;
  playerDamage: number | null;
  tramplerDamage: number | null;
  splashDamage: number | null;
  magazine: number | null;
}

/** Prominent grid of wiki-sourced gameplay stats, shown under the detail header.
 *  Renders nothing when there are no displayable stats. */
export function StatBox({ item, typeLabel }: { item: ItemStatFields; typeLabel?: string }) {
  const cells: StatCell[] = [];
  if (item.damage != null) cells.push({ label: "Damage", value: item.damage });
  if (item.playerDamage != null) cells.push({ label: "Damage (Player)", value: item.playerDamage });
  if (item.tramplerDamage != null) cells.push({ label: "Damage (Trampler)", value: item.tramplerDamage });
  if (item.splashDamage != null) cells.push({ label: "Splash Damage", value: item.splashDamage });
  if (item.magazine != null) cells.push({ label: "Magazine", value: item.magazine });
  const typeValue = typeLabel ?? item.statType;
  if (typeValue) cells.push({ label: "Type", value: typeValue });
  return <StatGrid cells={cells} />;
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Run: `node_modules/.bin/eslint src/components/StatGrid.tsx src/components/StatBox.tsx`
Expected: both clean (no output).

- [ ] **Step 4: Commit**

```bash
git add src/components/StatGrid.tsx src/components/StatBox.tsx
git commit -m "refactor(wiki): extract StatGrid from StatBox

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Build the `EntityDetail` shell component

**Files:**
- Create: `src/components/EntityDetail.tsx`

- [ ] **Step 1: Create `EntityDetail.tsx`**

Create `src/components/EntityDetail.tsx`:

```tsx
import { Breadcrumb, type Crumb } from "@/components/Breadcrumb";
import { SuggestCorrectionLink } from "@/components/SuggestCorrectionLink";
import { ItemIcon } from "@/components/ItemIcon";
import { StatGrid } from "@/components/StatGrid";
import { ItemTabs, type Tab } from "@/components/ItemTabs";
import { ItemDetailsPanel } from "@/components/ItemDetailsPanel";
import type { StatCell, DetailRow } from "@/lib/item-view";

export interface EntityIcon {
  name: string;
  icon: string | null;
  rarity?: string | null;
  decorative?: boolean;
}

export interface EntityDetailProps {
  breadcrumb: Crumb[];
  suggest: { type: string; slug: string };
  icon?: EntityIcon;
  title: string;
  badges?: React.ReactNode;
  description?: string | null;
  stats?: StatCell[];
  detailRows?: DetailRow[];
  tabs?: Tab[];
  /** Shown in the main column when there are no tabs (e.g. the item "no data" message). */
  tabsEmptyFallback?: React.ReactNode;
  sourceUrl?: string | null;
}

/** Shared shell for item / trampler-part / environment-entity detail pages.
 *  Adaptive layout: a Details sidebar (and the wider max-width) appears only when
 *  `detailRows` are provided; otherwise a single centered column. */
export function EntityDetail({
  breadcrumb,
  suggest,
  icon,
  title,
  badges,
  description,
  stats,
  detailRows,
  tabs,
  tabsEmptyFallback,
  sourceUrl,
}: EntityDetailProps) {
  const hasSidebar = !!detailRows && detailRows.length > 0;
  const paragraphs = description ? description.split(/\n+/).filter(Boolean) : [];
  const main = tabs && tabs.length > 0 ? <ItemTabs tabs={tabs} /> : tabsEmptyFallback ?? null;

  return (
    <article className={`py-6 space-y-6 mx-auto ${hasSidebar ? "max-w-5xl" : "max-w-3xl"}`}>
      <div className="flex items-center justify-between gap-2">
        <Breadcrumb items={breadcrumb} />
        <SuggestCorrectionLink type={suggest.type} slug={suggest.slug} />
      </div>

      <header className="flex flex-wrap items-start gap-4">
        {icon && (
          <ItemIcon
            name={icon.name}
            icon={icon.icon}
            size="lg"
            rarity={icon.rarity ?? undefined}
            decorative={icon.decorative ?? false}
          />
        )}
        <div className="flex-1 min-w-[16rem] space-y-2">
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          {badges && <div className="flex flex-wrap gap-2">{badges}</div>}
          {paragraphs.map((p, i) => (
            <p key={i} className="text-base-content/80 max-w-prose">{p}</p>
          ))}
          {stats && stats.length > 0 && <StatGrid cells={stats} />}
        </div>
      </header>

      {hasSidebar ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px] items-start">
          <div className="min-w-0">{main}</div>
          <ItemDetailsPanel rows={detailRows!} />
        </div>
      ) : (
        main && <div className="min-w-0">{main}</div>
      )}

      {sourceUrl && (
        <p className="text-sm text-base-content/60">
          Source:{" "}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
            sandgame.wiki ↗
          </a>
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Run: `node_modules/.bin/eslint src/components/EntityDetail.tsx`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/EntityDetail.tsx
git commit -m "feat(wiki): EntityDetail shared detail shell

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Migrate the item page to `EntityDetail`

**Files:**
- Modify: `src/app/items/[slug]/page.tsx`

- [ ] **Step 1: Rewrite the render of `src/app/items/[slug]/page.tsx`**

Keep all data-fetching and the `tabs` / `detailRows` construction (lines through `const detailRows = itemDetailRows(...)`). Replace the imports of `Link`, `Breadcrumb`, `SuggestCorrectionLink`, `ItemDetailsPanel`, `CategoryTag`, `ItemIcon`, `StatBox`, `rarityColor`, `ItemTabs` usage as needed and replace the `return (...)` JSX. The new imports block at the top should be:

```tsx
import { notFound } from "next/navigation";
import { getItemBySlug, getCratesContaining, getAmmoByCaliber, getWeaponsByCaliber } from "@/lib/queries";
import { ammoCaliber, weaponCaliber, caliberLabel } from "@/lib/ammo";
import { classifyTrades } from "@/lib/trades";
import { availableTabs, itemDetailRows, type TabId } from "@/lib/item-view";
import { categoryLabel } from "@/lib/taxonomy";
import { rarityColor } from "@/lib/rarity";
import { EntityDetail } from "@/components/EntityDetail";
import { CategoryTag } from "@/components/CategoryTag";
import { StatBox } from "@/components/StatBox";
import { type Tab } from "@/components/ItemTabs";
import { CraftTable } from "@/components/CraftTable";
import { UsedInTable } from "@/components/UsedInTable";
import { CrateDropList } from "@/components/CrateDropList";
import { ItemLinkList } from "@/components/ItemLinkList";
```

(Removed imports: `Link`, `ItemIcon`, `ItemTabs`, `ItemDetailsPanel`, `SuggestCorrectionLink`. `StatBox` and `CategoryTag` are still used inside the composed `badges`/`stats` nodes. `ItemIcon` is no longer imported directly — `EntityDetail` renders the icon.)

Replace the entire `return (...)` block (currently the `<article>…</article>`) with:

```tsx
  return (
    <EntityDetail
      breadcrumb={[
        { label: "Items", href: "/items" },
        { label: categoryLabel(item.category), href: `/items?category=${item.category}` },
        { label: item.name },
      ]}
      suggest={{ type: "item", slug: item.slug }}
      icon={{ name: item.name, icon: item.icon, rarity: item.rarity }}
      title={item.name}
      badges={
        <>
          {item.rarity && (
            <span className="badge badge-outline gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: rarityColor(item.rarity) ?? "transparent" }}
                aria-hidden="true"
              />
              {item.rarity}
            </span>
          )}
          <CategoryTag slug={item.category} />
        </>
      }
      description={item.description}
      stats={statCells(item, isAmmo ? caliberLabel(caliber) ?? undefined : undefined)}
      detailRows={detailRows}
      tabs={tabs}
      tabsEmptyFallback={
        <p className="text-base-content/70">No crafting, usage, or trade data for this item.</p>
      }
    />
  );
```

`StatBox` currently returns a `<StatGrid>`. To feed `EntityDetail.stats` (a `StatCell[]`) we need the cells, not the rendered grid. Two acceptable options — use **Option A** (keep `StatBox` as the single source of stat cells by exporting a cell-builder):

In `src/components/StatBox.tsx`, export the cell-builder used by `StatBox` so the item page can reuse it:

```tsx
export function itemStatCells(item: ItemStatFields, typeLabel?: string): StatCell[] {
  const cells: StatCell[] = [];
  if (item.damage != null) cells.push({ label: "Damage", value: item.damage });
  if (item.playerDamage != null) cells.push({ label: "Damage (Player)", value: item.playerDamage });
  if (item.tramplerDamage != null) cells.push({ label: "Damage (Trampler)", value: item.tramplerDamage });
  if (item.splashDamage != null) cells.push({ label: "Splash Damage", value: item.splashDamage });
  if (item.magazine != null) cells.push({ label: "Magazine", value: item.magazine });
  const typeValue = typeLabel ?? item.statType;
  if (typeValue) cells.push({ label: "Type", value: typeValue });
  return cells;
}

export function StatBox({ item, typeLabel }: { item: ItemStatFields; typeLabel?: string }) {
  return <StatGrid cells={itemStatCells(item, typeLabel)} />;
}
```

Then in the item page, import and use it (replace the `statCells(...)` placeholder in the JSX above):

```tsx
import { itemStatCells } from "@/components/StatBox";
// ...
stats={itemStatCells(item, isAmmo ? caliberLabel(caliber) ?? undefined : undefined)}
```

(So the item page no longer imports the `StatBox` component itself — it imports `itemStatCells`. Update the import line accordingly: replace `import { StatBox } from "@/components/StatBox";` with `import { itemStatCells } from "@/components/StatBox";`.)

`item` passed to `itemStatCells` must satisfy `ItemStatFields` — `getItemBySlug` returns the full row, so `statType/damage/playerDamage/tramplerDamage/splashDamage/magazine` are present. If TypeScript complains about excess properties it will not (object is passed by reference, not a literal), so `itemStatCells(item, …)` typechecks.

- [ ] **Step 2: Typecheck and lint**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Run: `node_modules/.bin/eslint src/app/items/[slug]/page.tsx src/components/StatBox.tsx`
Expected: both clean. If `tsc` flags an unused import, remove it.

- [ ] **Step 3: Commit**

```bash
git add src/app/items/[slug]/page.tsx src/components/StatBox.tsx
git commit -m "refactor(wiki): item page renders via EntityDetail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Migrate the trampler-part page to `EntityDetail`

**Why:** Stats become the prominent grid (via `tramplerStatCells`), Research moves into the Details sidebar (via `tramplerDetailRows`), and Build Cost is the only tab.

**Files:**
- Modify: `src/app/tramplers/[slug]/page.tsx`

- [ ] **Step 1: Rewrite `src/app/tramplers/[slug]/page.tsx`**

Replace the whole file with:

```tsx
import { notFound } from "next/navigation";
import { getTramplerPartBySlug } from "@/lib/queries";
import { categoryLabel } from "@/lib/taxonomy";
import { tramplerStatCells, tramplerDetailRows } from "@/lib/trampler-view";
import { EntityDetail } from "@/components/EntityDetail";
import { CategoryTag } from "@/components/CategoryTag";
import { ItemIconLink } from "@/components/ItemIconLink";
import { type Tab } from "@/components/ItemTabs";

type Params = Promise<{ slug: string }>;

export default async function TramplerPartPage({ params }: { params: Params }) {
  const { slug } = await params;
  const part = await getTramplerPartBySlug(slug);
  if (!part) notFound();

  const cost = part.costEntries;

  const tabs: Tab[] = [];
  if (cost.length > 0) {
    tabs.push({
      id: "build-cost",
      label: "Build Cost",
      content: (
        <div className="flex flex-wrap gap-4">
          {cost.map((c) => (
            <ItemIconLink
              key={c.name}
              slug={c.item?.slug ?? undefined}
              name={c.name}
              icon={c.item?.icon ?? null}
              amount={c.amount}
              rarity={c.item?.rarity ?? null}
            />
          ))}
        </div>
      ),
    });
  }

  return (
    <EntityDetail
      breadcrumb={[
        { label: "Tramplers", href: "/tramplers" },
        { label: categoryLabel(part.category), href: `/tramplers?category=${part.category}` },
        { label: part.name },
      ]}
      suggest={{ type: "tramplerPart", slug }}
      icon={{ name: part.name, icon: part.icon, decorative: true }}
      title={part.name}
      badges={<CategoryTag slug={part.category} />}
      description={part.description}
      stats={tramplerStatCells(part)}
      detailRows={tramplerDetailRows(part)}
      tabs={tabs}
      sourceUrl={part.sourceUrl}
    />
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Run: `node_modules/.bin/eslint src/app/tramplers/[slug]/page.tsx`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/tramplers/[slug]/page.tsx
git commit -m "refactor(wiki): trampler page via EntityDetail; research to sidebar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Migrate the environment-entity page to `EntityDetail`

**Why:** Single-column (no detail rows), now gains a header icon + category badge.

**Files:**
- Modify: `src/app/environment/[slug]/page.tsx`

- [ ] **Step 1: Rewrite `src/app/environment/[slug]/page.tsx`**

Replace the whole file with:

```tsx
import { notFound } from "next/navigation";
import { getEnvEntityBySlug } from "@/lib/queries";
import { categoryLabel } from "@/lib/taxonomy";
import { byRarityThenName } from "@/lib/rarity";
import { EntityDetail } from "@/components/EntityDetail";
import { CategoryTag } from "@/components/CategoryTag";
import { LootTable } from "@/components/LootTable";
import { type Tab } from "@/components/ItemTabs";

type Params = Promise<{ slug: string }>;

export default async function EnvEntityPage({ params }: { params: Params }) {
  const { slug } = await params;
  const entity = await getEnvEntityBySlug(slug);
  if (!entity) notFound();

  const tabs: Tab[] = entity.lootTiers.map((t) => ({
    id: t.tier.toLowerCase().replace(/\s+/g, "-"),
    label: t.tier,
    content: (
      <LootTable
        entries={t.entries
          .map((e) => ({ slug: e.item?.slug ?? null, name: e.name, icon: e.item?.icon ?? null, rarity: e.item?.rarity ?? null }))
          .sort(byRarityThenName)}
      />
    ),
  }));

  return (
    <EntityDetail
      breadcrumb={[
        { label: "Environment", href: "/environment" },
        { label: categoryLabel(entity.category), href: `/environment?category=${entity.category}` },
        { label: entity.name },
      ]}
      suggest={{ type: "envEntity", slug }}
      icon={{ name: entity.name, icon: entity.icon, decorative: true }}
      title={entity.name}
      badges={<CategoryTag slug={entity.category} />}
      description={entity.description}
      tabs={tabs}
      sourceUrl={entity.sourceUrl}
    />
  );
}
```

Note: the old env page wrapped the loot tabs in a `<section>` with a `<h2>Loot</h2>` heading. Under the shared shell the tab labels (the loot tiers) are the headings, so the separate "Loot" `<h2>` is intentionally dropped. The loot tier tabs themselves are unchanged.

- [ ] **Step 2: Verify `entity.icon` exists on the query result**

`getEnvEntityBySlug` uses `findUnique` with no `select`, so all scalar columns (including `icon` and `category`) are returned. Confirm with typecheck (Step 3). If `tsc` reports `icon` does not exist on the entity type, the column is named differently — inspect `prisma/schema.prisma` for the `EnvEntity` model and use the correct field; do not invent one.

- [ ] **Step 3: Typecheck and lint**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Run: `node_modules/.bin/eslint src/app/environment/[slug]/page.tsx`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/environment/[slug]/page.tsx
git commit -m "refactor(wiki): environment page via EntityDetail; add icon + badge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Extend e2e assertions and run full verification

**Why:** Lock the new normalized behaviors and confirm no regressions across all three page types.

**Files:**
- Modify: `tests/e2e/wiki.spec.ts`

- [ ] **Step 1: Add e2e assertions for the normalized behaviors**

Append to `tests/e2e/wiki.spec.ts`:

```ts
test("environment detail now shows a category badge and a decorative icon", async ({ page }) => {
  await page.goto("/environment/weapon-crate");
  // Category badge resolves to a label (not the raw slug).
  await expect(page.getByText("Loot Containers")).toBeVisible();
  // A sprite image is present in the header.
  await expect(page.locator("article img").first()).toBeVisible();
});

test("detail articles are horizontally centered (mx-auto)", async ({ page }) => {
  for (const path of ["/items/c4-dynamite", "/environment/weapon-crate"]) {
    await page.goto(path);
    const centered = await page.locator("article").evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.marginLeft === "auto" || cs.marginInlineStart === "auto"
        ? true
        : Math.abs(el.getBoundingClientRect().left - (window.innerWidth - el.getBoundingClientRect().right)) < 2;
    });
    expect(centered, `article on ${path} should be centered`).toBe(true);
  }
});

test("trampler part page shows a prominent stat grid and Build Cost tab", async ({ page }) => {
  // Navigate from the tramplers landing to the first available part, so no slug is hard-coded.
  await page.goto("/tramplers");
  await page.locator('a[href^="/tramplers?category="]').first().click();
  const firstPart = page.locator('a[href^="/tramplers/"]').first();
  await expect(firstPart).toBeVisible();
  await firstPart.click();
  await expect(page).toHaveURL(/\/tramplers\/[^/]+$/);
  // Prominent stat grid is a <dl> in the header (present for parts that have stats).
  await expect(page.locator("article dl").first()).toBeVisible();
  // Suggest-a-correction sits in the top row.
  await expect(page.getByRole("link", { name: /Suggest a correction/i })).toBeVisible();
});
```

If the "trampler part page" test fails because the first category is empty (`a[href^="/tramplers/"]` not found), pick a populated category in the navigation step (e.g. `await page.goto("/tramplers?category=chassis")`) after confirming via the running app which trampler category has entries. Do not assert on a hard-coded part slug.

- [ ] **Step 2: Run the full unit + e2e + static gate**

From `sand-wiki/`:

```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json
node_modules/.bin/eslint src
node_modules/.bin/vitest run
npm run test:e2e
```

Expected:
- `tsc`: clean.
- `eslint src`: clean.
- `vitest run`: all suites pass (including `taxonomy` and the new `trampler-view`).
- `npm run test:e2e`: all Playwright tests pass — the pre-existing item/env detail tests (stat box, rarity badge, ammo/loot tabs, Details buy/sell rows, loot tier tabs, source links) still pass, plus the three new tests. (Requires the dev DB the e2e suite normally runs against.)

- [ ] **Step 3: Manual smoke check in the running app**

Run `npm run dev`, then load one of each and confirm visually:
- An item with stats + tabs (e.g. `/items/rifle-musket`): breadcrumb + Suggest on one top row, stat grid under header, Details sidebar on the right, article centered.
- A trampler part: stat grid prominent under the header, Research in the right Details sidebar, a single Build Cost tab, source link, article centered.
- An environment entity (e.g. `/environment/weapon-crate`): header icon + category badge, single centered column, loot tier tabs, source link.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/wiki.spec.ts
git commit -m "test(wiki): e2e for normalized detail pages (centering, env badge, trampler stats)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (for the planner)

- **Spec coverage:** EntityDetail shell (Task 4) ✓; adaptive sidebar + width/centering (Task 4) ✓; StatGrid extraction (Task 3) ✓; trampler stats prominent + research→sidebar + build-cost tab (Tasks 2, 6) ✓; env icon + category badge (Tasks 1, 7) ✓; per-page mapping table (Tasks 5-7) ✓; reuse of Breadcrumb/Suggest/ItemTabs/ItemDetailsPanel/ItemIcon (Task 4) ✓; verification via tsc/eslint/vitest/e2e (Task 8) ✓.
- **Type consistency:** `StatCell` defined in `item-view.ts` (Task 2), consumed by `StatGrid` (Task 3), `StatBox`/`itemStatCells` (Tasks 3, 5), `trampler-view` (Task 2), and `EntityDetail` (Task 4). `DetailRow` reused from `item-view.ts`. `Tab`/`Crumb` reused from existing components. `tramplerStatCells`/`tramplerDetailRows`/`itemStatCells`/`categoryLabel` names are used identically wherever referenced.
- **Open risk flagged in-task:** the trampler e2e navigation assumes a populated category (Task 8 Step 1 documents the fallback); env `icon` field name is verified by typecheck (Task 7 Step 2).
```
