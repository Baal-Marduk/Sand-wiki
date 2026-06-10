# Loot Container Contents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Scrape each loot container's tiered loot table, store it on `EnvEntity`, show it as tier tabs on the crate page, and add a reverse "Loot" tab on item pages.

**Architecture:** A pure `parseLootTable(wikitext, crateName)` in `prisma/wiki-text.mjs` (tabber tiers → dynamic columns + item rows via `{{Icon|…|3=Name}}` + bold values). The env importer resolves entry names → item slugs and writes `loot` into `env-content.json`; a migration adds `EnvEntity.loot Json?`; seed stores it. Crate detail renders tier tabs (reuse `ItemTabs`) with a new `LootTable`; item detail gets a "Loot" tab (`CrateDropList`) via `getCratesContaining`.

**Tech Stack:** Next.js 16, React 19, Prisma 6, Tailwind/DaisyUI, Vitest, Playwright, Node.

**Spec:** `sand-wiki/docs/superpowers/specs/2026-06-10-wiki-loot-tables-design.md`

**Commands:** from `d:/Documents/SandLabs`; app under `sand-wiki/`. `npm --prefix sand-wiki run {test,lint,build,test:e2e}`. Commit `git -C "d:/Documents/SandLabs"`. Branch `feat/wiki-loot-tables` (spec committed).

**Real markup (Crate of Shells, Normal tier):**
```
===Loot Table===
<tabber>Normal Crate of Shells=
{| class="wikitable sortable mw-collapsible" ...
|-
! ... colspan="2" |Item
! ... |Shipwreck Amount
! ... |Landmark Amount
|-
| rowspan="3" | One of either:
|{{Icon|40mmShell|3=40mm Shell|4=right}}
|'''10-20'''
|'''10-20'''
|-
|{{Icon|Item 70m shell|3=70mm Shell|4=right}}
|'''10-20'''
|'''10-20'''
...
|-|
Rare Crate of Shells=
{| ...
```

---

## File Structure
**Modify:** `prisma/wiki-text.mjs` (+ `wiki-text.test.ts`), `prisma/import-env-content.mjs`, `prisma/env-content.json`, `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/queries.ts`, `src/lib/item-view.ts`, `src/app/environment/[slug]/page.tsx`, `src/app/items/[slug]/page.tsx`, `tests/e2e/wiki.spec.ts`.
**Create:** `src/components/LootTable.tsx`, `src/components/CrateDropList.tsx`.

---

## Task 1: `parseLootTable` (TDD)

**Files:** modify `prisma/wiki-text.mjs`, `prisma/wiki-text.test.ts`.

- [ ] **Step 1: failing test** — append to `wiki-text.test.ts`:

```ts
import { parseLootTable } from "./wiki-text.mjs";

const LOOT = `Intro prose.
===Loot Table===
<tabber>Normal Crate of Shells=
{| class="wikitable sortable"
|-
! colspan="2" |Item
! class="unsortable" |Shipwreck Amount
! class="unsortable" |Landmark Amount
|-
| rowspan="3" | One of either:
|{{Icon|40mmShell|3=40mm Shell|4=right}}
|'''10-20'''
|'''10-20'''
|-
|{{Icon|Item 70m shell|3=70mm Shell|4=right}}
|'''10-20'''
|'''10-20'''
|-
| colspan="2" | {{Icon|FabricScraps|3=Fabric Scraps|4=right}}
|'''5'''
|'''5'''
|}
|-|
Rare Crate of Shells=
{| class="wikitable"
|-
! colspan="2" |Item
! |Count
|-
| {{Icon|Crowns|4=right}}
|'''100'''
|}
</tabber>`;

describe("parseLootTable", () => {
  it("parses tabber tiers with dynamic columns and item rows", () => {
    const tiers = parseLootTable(LOOT, "Crate of Shells");
    expect(tiers.map((t) => t.tier)).toEqual(["Normal", "Rare"]);
    const normal = tiers[0];
    expect(normal.columns).toEqual(["Shipwreck Amount", "Landmark Amount"]);
    expect(normal.entries).toEqual([
      { name: "40mm Shell", values: ["10-20", "10-20"] },
      { name: "70mm Shell", values: ["10-20", "10-20"] },
      { name: "Fabric Scraps", values: ["5", "5"] },
    ]);
    // Icon without 3= falls back to its key (Crowns)
    expect(tiers[1].columns).toEqual(["Count"]);
    expect(tiers[1].entries).toEqual([{ name: "Crowns", values: ["100"] }]);
  });

  it("returns [] when there is no loot table", () => {
    expect(parseLootTable("Just prose, no table.", "X")).toEqual([]);
  });
});
```

- [ ] **Step 2: run, verify fail.** `npm --prefix sand-wiki run test -- prisma/wiki-text.test.ts`

- [ ] **Step 3: implement** — append to `prisma/wiki-text.mjs`:

```js
const TIER_ORDER = ["Normal", "Rare", "Very Rare"];

/** Extract item rows from a single tier chunk: each {{Icon|…}} with the bold values
 *  that follow it (before the next icon) as its column values. */
function lootEntriesFromChunk(chunk) {
  const re = /\{\{Icon\|([\s\S]*?)\}\}/g;
  const icons = [];
  let m;
  while ((m = re.exec(chunk))) {
    const parts = m[1].split("|");
    let name = null;
    for (const p of parts.slice(1)) {
      const mm = p.match(/^\s*3\s*=\s*([\s\S]+)$/);
      if (mm) name = mm[1].trim();
    }
    if (!name) name = (parts[0] || "").trim();
    icons.push({ name, start: m.index, end: re.lastIndex });
  }
  const entries = [];
  for (let i = 0; i < icons.length; i++) {
    const segEnd = i + 1 < icons.length ? icons[i + 1].start : chunk.length;
    const seg = chunk.slice(icons[i].end, segEnd);
    const values = [...seg.matchAll(/'''([^']+?)'''/g)].map((x) => x[1].trim());
    entries.push({ name: icons[i].name, values });
  }
  return entries;
}

/** Column header labels of a tier chunk (text after the last "|" on each "!" cell), minus "Item". */
function lootColumns(chunk) {
  const cols = [];
  for (const line of chunk.split("\n")) {
    if (!line.startsWith("!")) continue;
    for (const cell of line.split("!!")) {
      const c = cell.replace(/^!+/, "");
      const pipe = c.lastIndexOf("|");
      const label = (pipe >= 0 ? c.slice(pipe + 1) : c).trim();
      if (label && label.toLowerCase() !== "item") cols.push(label);
    }
  }
  return cols;
}

/** Parse the ==Loot Table== tabber into tiers with dynamic columns + item entries. */
export function parseLootTable(wikitext, crateName) {
  if (!wikitext) return [];
  const idx = wikitext.search(/==+\s*Loot Table/i);
  if (idx < 0) return [];
  const tb = wikitext.slice(idx).match(/<tabber>([\s\S]*?)<\/tabber>/i);
  if (!tb) return [];
  const chunks = tb[1].split(/\n\|-\|\n/);
  const tiers = [];
  for (const chunk of chunks) {
    const labelMatch = chunk.match(/^\s*([^\n=]+?)=/);
    if (!labelMatch) continue;
    const tier = labelMatch[1].replace(crateName, "").trim();
    if (!tier) continue;
    tiers.push({ tier, columns: lootColumns(chunk), entries: lootEntriesFromChunk(chunk) });
  }
  tiers.sort((a, b) => {
    const ia = TIER_ORDER.indexOf(a.tier), ib = TIER_ORDER.indexOf(b.tier);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return tiers;
}
```

- [ ] **Step 4: run, verify pass. Step 5: commit** `feat(wiki): parse loot container tier tables`.

---

## Task 2: importer loot + re-scrape

**Files:** modify `prisma/import-env-content.mjs`; regenerate `prisma/env-content.json`.

- [ ] **Step 1:** in `import-env-content.mjs`, import `parseLootTable`; build a name→slug index from `data.json` (reuse the normalization from `import-wiki-enrichment.mjs`: `norm = (s)=>s.toLowerCase().replace(/[^a-z0-9]/g,"")`) plus the existing `wiki-overrides.json`. Add a `resolveSlug(name)` returning the slug or undefined. For each loot container, after computing `description`, compute:
```js
const tiers = parseLootTable(wt, title).map((t) => ({
  tier: t.tier,
  columns: t.columns,
  entries: t.entries.map((e) => {
    const slug = resolveSlug(e.name);
    return slug ? { slug, name: e.name, values: e.values } : { name: e.name, values: e.values };
  }),
}));
out[slug] = { ...out[slug], ...(tiers.length ? { loot: { tiers } } : {}) };
```
(Build the base `out[slug]` object first, then attach `loot`.)

- [ ] **Step 2: run** `node sand-wiki/prisma/import-env-content.mjs`. Print also a one-line loot summary per crate (tiers count, entries count, unresolved entry names).
- [ ] **Step 3: spot-check** `env-content.json`: `crate-of-shells.loot.tiers` has 3 tiers; an entry `{ slug: "small-cannon-ammo", name: "40mm Shell", values: [...] }`.
- [ ] **Step 4: commit** `prisma/import-env-content.mjs` + `env-content.json` → `feat(wiki): scrape loot container contents`.

---

## Task 3: `EnvEntity.loot` migration + seed

**Files:** modify `prisma/schema.prisma`, `prisma/seed.ts`. Migration `add_env_loot`.

- [ ] **Step 1:** add `loot Json?` to `model EnvEntity` (after `icon`).
- [ ] **Step 2:** `npx --prefix sand-wiki prisma migrate dev --name add_env_loot`. (EPERM on engine DLL while a dev server holds it is non-fatal — the client JS/types still write and the same-version engine works; verify with a quick `envEntity` query.)
- [ ] **Step 3:** in `seed.ts`, extend the `EnvContent` interface with `loot?: unknown` and pass `loot: (e.loot ?? undefined) as Prisma.InputJsonValue | undefined` into `prisma.envEntity.create`. (`Prisma` is already imported.)
- [ ] **Step 4: typecheck** `npx --prefix sand-wiki tsc --noEmit -p sand-wiki/tsconfig.json` → clean. **Commit** `feat(wiki): add EnvEntity.loot + seed`.

---

## Task 4: `getCratesContaining` query

**Files:** modify `src/lib/queries.ts`.

- [ ] **Step 1:** add (place near the other env queries):
```ts
export interface CrateDrop { crateSlug: string; crateName: string; tier: string; columns: string[]; values: string[] }

/** Crates (+ tier/amounts) whose loot tables contain the given item slug. */
export async function getCratesContaining(itemSlug: string): Promise<CrateDrop[]> {
  const crates = await prisma.envEntity.findMany({
    where: { category: "loot-containers" },
    select: { slug: true, name: true, loot: true },
  });
  const drops: CrateDrop[] = [];
  for (const c of crates) {
    const tiers = (c.loot as { tiers?: { tier: string; columns: string[]; entries: { slug?: string; values: string[] }[] }[] } | null)?.tiers ?? [];
    for (const t of tiers) {
      for (const e of t.entries) {
        if (e.slug === itemSlug) drops.push({ crateSlug: c.slug, crateName: c.name, tier: t.tier, columns: t.columns, values: e.values });
      }
    }
  }
  return drops;
}
```
- [ ] **Step 2: typecheck** → clean. **Commit** `feat(wiki): getCratesContaining query`.

---

## Task 5: crate tier tabs + `LootTable`

**Files:** create `src/components/LootTable.tsx`; modify `src/app/environment/[slug]/page.tsx`.

- [ ] **Step 1: `LootTable.tsx`**
```tsx
import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

export interface LootEntry { slug?: string; name: string; values: string[] }

export function LootTable({ columns, entries }: { columns: string[]; entries: LootEntry[] }) {
  return (
    <table className="table">
      <thead>
        <tr><th>Item</th>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={`${e.slug ?? e.name}-${i}`}>
            <td>
              <span className="inline-flex items-center gap-2">
                <ItemIcon name={e.name} size="recipe" decorative />
                {e.slug ? <Link href={`/items/${e.slug}`} className="link">{e.name}</Link> : <span>{e.name}</span>}
              </span>
            </td>
            {columns.map((c, ci) => <td key={c} className="whitespace-nowrap">{e.values[ci] ?? "—"}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: crate detail** — in `environment/[slug]/page.tsx`, read `entity.loot`; when it has tiers, render `ItemTabs` below the description:
```tsx
import { ItemTabs, type Tab } from "@/components/ItemTabs";
import { LootTable } from "@/components/LootTable";
// ...
const loot = entity.loot as { tiers?: { tier: string; columns: string[]; entries: { slug?: string; name: string; values: string[] }[] }[] } | null;
const tabs: Tab[] = (loot?.tiers ?? []).map((t) => ({
  id: t.tier.toLowerCase().replace(/\s+/g, "-"),
  label: t.tier,
  content: <LootTable columns={t.columns} entries={t.entries} />,
}));
```
Render `{tabs.length > 0 && <ItemTabs tabs={tabs} />}` after the description paragraphs (before/after the Source link — place before Source). `ItemTabs` is `"use client"` and ARIA-correct; importing it into this server component is fine (it becomes a client island).

- [ ] **Step 3: build** → success. **Commit** `feat(wiki): loot tier tabs on crate detail`.

---

## Task 6: item "Loot" tab + `CrateDropList`

**Files:** create `src/components/CrateDropList.tsx`; modify `src/lib/item-view.ts`, `src/app/items/[slug]/page.tsx`.

- [ ] **Step 1: `item-view.ts`** — add `"loot"` to the `TabId` union: `export type TabId = "crafted-by" | "used-in" | "buy" | "sell" | "loot";`. No other change.

- [ ] **Step 2: `CrateDropList.tsx`**
```tsx
import Link from "next/link";
import type { CrateDrop } from "@/lib/queries";

export function CrateDropList({ drops }: { drops: CrateDrop[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>Crate</th><th>Tier</th><th>Amount</th></tr></thead>
        <tbody>
          {drops.map((d, i) => (
            <tr key={`${d.crateSlug}-${d.tier}-${i}`}>
              <td><Link href={`/environment/${d.crateSlug}`} className="link">{d.crateName}</Link></td>
              <td>{d.tier}</td>
              <td className="whitespace-nowrap">{d.values.join(" / ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: `items/[slug]/page.tsx`** — import `getCratesContaining` and `CrateDropList`; after building `tabs` from `availableTabs(trades)`, fetch drops and append a Loot tab:
```tsx
const drops = await getCratesContaining(item.slug);
// ...after const tabs = availableTabs(trades).map(...):
if (drops.length > 0) tabs.push({ id: "loot", label: "Loot", content: <CrateDropList drops={drops} /> });
```
(`tabs` is a `Tab[]`; `Tab.id` is a string, so `"loot"` is fine. Add the `getCratesContaining` call alongside the existing awaits.)

- [ ] **Step 4: build** → success. **Commit** `feat(wiki): Loot tab on item pages linking back to crates`.

---

## Task 7: re-seed + e2e + full gate

**Files:** modify `tests/e2e/wiki.spec.ts`.

- [ ] **Step 1: re-seed** (DESTRUCTIVE, Neon dev DB — authorized). `npm --prefix sand-wiki run db:seed`. Spot-check: `getEnvEntityBySlug("crate-of-shells")` loot has 3 tiers; `getCratesContaining("small-cannon-ammo")` non-empty.

- [ ] **Step 2: e2e** — add to `wiki.spec.ts`:
```ts
test("crate detail shows loot tier tabs with linked items", async ({ page }) => {
  await page.goto("/environment/crate-of-shells");
  await expect(page.getByRole("tab", { name: "Normal" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Rare" })).toBeVisible();
  await expect(page.getByRole("link", { name: "40mm Shell" })).toBeVisible();
});

test("item page links back to crates via a Loot tab", async ({ page }) => {
  await page.goto("/items/small-cannon-ammo");
  await page.getByRole("tab", { name: "Loot" }).click();
  await expect(page.getByRole("link", { name: "Crate of Shells" })).toBeVisible();
});
```
(If `40mm Shell` isn't in the Normal tab by default, the first `getByRole("link"...)` may need the relevant tab clicked first; the Normal tab is active by default and contains it.)

- [ ] **Step 3: full gate** (note `:3000` stale-dev-server caveat — if occupied, `next start -p <other>` + a throwaway `playwright.tmp.config.ts`): `npm --prefix sand-wiki run test`, `lint`, `build`, `test:e2e`. Green; axe clean on `/environment/crate-of-shells` + `/items/small-cannon-ammo`.
- [ ] **Step 4: commit** `test(wiki): loot tier tabs + item Loot tab e2e`.

---

## Self-Review notes (author)
- **Spec coverage:** §1→Task1; §2→Tasks 2,3; §3→Task 4; §4→Task 5; §5→Task 6; §6→Task 7. Covered.
- **Type consistency:** `parseLootTable` shape `{tier,columns,entries:{name,values}}` (T1) → importer adds `slug` (T2) → stored (T3) → `CrateDrop` (T4) consumed by `CrateDropList` (T6); `LootEntry {slug?,name,values}` (T5) matches stored entries. `TabId` adds "loot" (T6); page appends loot tab.
- **Re-seed** required (T7), destructive/authorized.
- The Crowns fallback (Icon without `3=`) is covered by the Task 1 test.
