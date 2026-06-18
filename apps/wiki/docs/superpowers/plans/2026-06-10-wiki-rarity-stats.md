# Wiki Rarity + Item Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. NOTE: the data-acquisition tasks (Task 1–2) are iterative (scrape → inspect unmatched → add overrides → re-run) and are best executed inline with judgment, not by blind subagents.

**Goal:** Enrich items with rarity + weapon stats scraped from sandgame.wiki; show rarity-tinted icons, a rarity filter on the items list, and a stat box on detail pages.

**Architecture:** A committed one-off Node importer (`prisma/import-wiki-enrichment.mjs`) hits the MediaWiki API, parses `{{Weapons}}` infoboxes (brace/bracket-aware, multi-variant tabber pages, redirects), maps wiki entries → item slugs (normalized name + overrides), and emits `prisma/wiki-enrichment.json`. A migration adds `Item.rarity` (indexed) + `Item.stats Json`. The seed merges the JSON. `src/lib/rarity.ts` is the single source for the rarity scale + colors. UI: rarity-tinted `ItemIcon`, `RarityFilter` chip row on the items list, `StatBox` on detail pages.

**Tech Stack:** Next.js 16, React 19, Prisma 6, Tailwind v4/DaisyUI 5, Vitest, Playwright, Node (importer).

**Spec:** `sand-wiki/docs/superpowers/specs/2026-06-10-wiki-rarity-stats-design.md`

**Commands:** from `d:/Documents/SandLabs`; app under `sand-wiki/`. `npm --prefix sand-wiki run {test,lint,build,test:e2e}`. Commit via `git -C "d:/Documents/SandLabs"`. Branch: `feat/wiki-rarity-stats` (spec already committed there).

**Real data (from recon):**
- Rarity scale (seen): `Common, Uncommon, Noteworthy, Rare, Remarkable` → tiers 1–5; tier 6 reserved (`Exotic`, name unconfirmed). Colors from the game palette.
- `{{Weapons}}` params: `Name (bold), Image, Rarity, Type, Mag, Damage, Ammo, Value`.
- `Ammo` is either `[[<Name>]]`, `[[<Name>|label]]`, or `{{Icon|<key>|3=<Name>|4=right}}`.
- Tabber pages hold multiple infoboxes; variants are cross-listed on sibling pages (dedupe by matched slug).
- Ammo display names map to our ammo items, e.g. `11x54mm Ammo` ≈ our `sniper-rifle-ammo` ("11x54 mm Ammo") — note spacing differs, so normalization must strip spaces around `mm`/`GA`.

---

## File Structure

**Create:**
- `sand-wiki/prisma/import-wiki-enrichment.mjs` — the importer (fetch + parse + match + emit).
- `sand-wiki/prisma/wiki-parse.mjs` — pure parsing helpers (`parseWeaponInfoboxes`, `parseTemplateParams`, `extractAmmoName`), imported by the importer AND the test.
- `sand-wiki/prisma/wiki-parse.test.ts` — Vitest over the pure parser (fixture-based).
- `sand-wiki/prisma/wiki-overrides.json` — `{ "<normalized wiki name>": "<item-slug>" }` for match misses (starts `{}`, filled during Task 2).
- `sand-wiki/prisma/wiki-enrichment.json` — generated output (committed).
- `sand-wiki/src/lib/rarity.ts` — rarity scale, colors, helpers.
- `sand-wiki/src/lib/rarity.test.ts` — unit tests.
- `sand-wiki/src/components/RarityFilter.tsx` — chip row.
- `sand-wiki/src/components/StatBox.tsx` — detail stat grid.

**Modify:**
- `sand-wiki/prisma/schema.prisma` — `Item.rarity`, `Item.stats`, `@@index([rarity])`.
- `sand-wiki/prisma/seed.ts` — merge enrichment.
- `sand-wiki/src/lib/item-filter.ts` (+ `.test.ts`) — `rarity` filter.
- `sand-wiki/src/lib/queries.ts` — `listRarities(filter)`; select rarity/stats; pass rarity into filter.
- `sand-wiki/src/components/ItemIcon.tsx` — `rarity` prop → tinted tile.
- `sand-wiki/src/components/ItemCard.tsx` — pass rarity; add to `ItemCardData`.
- `sand-wiki/src/app/items/page.tsx` — `?rarity=`, render `RarityFilter`.
- `sand-wiki/src/app/items/[slug]/page.tsx` — rarity badge + `StatBox`; pass rarity to header icon.
- `sand-wiki/tests/e2e/wiki.spec.ts` — rarity filter + stat box assertions.

---

## Task 1: Pure wikitext parser (TDD)

**Files:** create `prisma/wiki-parse.mjs`, `prisma/wiki-parse.test.ts`.

The parser must be brace/bracket-aware: split `{{Weapons|...}}` params on top-level `|` only (ignore `|` inside nested `{{...}}` / `[[...]]`), find ALL `{{Weapons}}` blocks, and extract the ammo display name from `[[Name]]`, `[[Name|label]]`, or `{{Icon|key|3=Name|...}}`.

- [ ] **Step 1: Write failing tests** (`prisma/wiki-parse.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { parseWeaponInfoboxes, extractAmmoName } from "./wiki-parse.mjs";

const TABBER = `Intro text [[9x42mm Ammo]].
<tabber>
A=
{{Weapons
 |Name = '''M1866/9 "Einzel" Breechloader'''
 |Rarity = Common
 |Type = Single-Shot Rifle
 |Mag = 1
 |Damage = 50
 |Ammo = {{Icon|9x42mm|3=9x42mm Ammo|4=right}}
 |Value = 25
}}
|-|
B=
{{Weapons
 |Name = '''KF866/9R "Mehrzel" Repeater'''
 |Rarity = Noteworthy
 |Mag = 6
 |Damage = 50
 |Ammo = [[9x42mm Ammo]]
}}
</tabber>`;

describe("parseWeaponInfoboxes", () => {
  it("extracts every infobox on a tabber page with correct fields", () => {
    const r = parseWeaponInfoboxes(TABBER);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      name: 'M1866/9 "Einzel" Breechloader',
      rarity: "Common", type: "Single-Shot Rifle",
      magazine: 1, damage: 50, value: 25, ammoName: "9x42mm Ammo",
    });
    expect(r[1]).toMatchObject({ name: 'KF866/9R "Mehrzel" Repeater', rarity: "Noteworthy", magazine: 6, ammoName: "9x42mm Ammo" });
    expect(r[1].value).toBeNull();
  });
});

describe("extractAmmoName", () => {
  it("handles Icon template, plain link, and piped link", () => {
    expect(extractAmmoName("{{Icon|9x42mm|3=9x42mm Ammo|4=right}}")).toBe("9x42mm Ammo");
    expect(extractAmmoName("[[11x54mm Ammo]]")).toBe("11x54mm Ammo");
    expect(extractAmmoName("[[Shell|80mm Shell]]")).toBe("80mm Shell");
    expect(extractAmmoName("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npm --prefix sand-wiki run test -- prisma/wiki-parse.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `prisma/wiki-parse.mjs`**

```js
// Pure wikitext parsing for the SAND weapons infobox. No I/O.

/** Split a template body on top-level "|" (not inside nested {{}} or [[]]). */
export function splitTopLevel(body) {
  const parts = [];
  let buf = "", depthC = 0, depthB = 0;
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "{{") { depthC++; buf += two; i++; continue; }
    if (two === "}}") { depthC--; buf += two; i++; continue; }
    if (two === "[[") { depthB++; buf += two; i++; continue; }
    if (two === "]]") { depthB--; buf += two; i++; continue; }
    if (body[i] === "|" && depthC === 0 && depthB === 0) { parts.push(buf); buf = ""; continue; }
    buf += body[i];
  }
  parts.push(buf);
  return parts;
}

/** Parse "k = v" params from a template body into a lowercased-key map. */
export function parseTemplateParams(body) {
  const out = {};
  for (const part of splitTopLevel(body)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/** Pull an item display name from an Ammo field value. */
export function extractAmmoName(raw) {
  if (!raw) return null;
  const icon = raw.match(/\{\{Icon\b([\s\S]*?)\}\}/);
  if (icon) {
    const p = parseTemplateParams(icon[1]);
    if (p["3"]) return p["3"];
  }
  const link = raw.match(/\[\[([^\]]+)\]\]/);
  if (link) { const inner = link[1].split("|"); return (inner[1] || inner[0]).trim(); }
  return null;
}

const num = (v) => { if (v == null) return null; const n = Number(String(v).replace(/[^\d.]/g, "")); return Number.isFinite(n) && String(v).match(/\d/) ? n : null; };
const clean = (v) => (v == null ? null : v.replace(/'''/g, "").replace(/\[\[|\]\]/g, "").trim() || null);

/** Find every {{Weapons|...}} block and map to a normalized entry. */
export function parseWeaponInfoboxes(wikitext) {
  const out = [];
  const re = /\{\{Weapons\b/gi;
  let m;
  while ((m = re.exec(wikitext))) {
    // brace-match from m.index to the closing }}
    let i = m.index + 2, depth = 1, body = "";
    while (i < wikitext.length && depth > 0) {
      const two = wikitext.slice(i, i + 2);
      if (two === "{{") { depth++; body += two; i += 2; continue; }
      if (two === "}}") { depth--; if (depth === 0) break; body += two; i += 2; continue; }
      body += wikitext[i]; i++;
    }
    const p = parseTemplateParams(body);
    out.push({
      name: clean(p["name"]),
      rarity: clean(p["rarity"]),
      type: clean(p["type"]),
      magazine: num(p["mag"]),
      damage: num(p["damage"]),
      value: num(p["value"]),
      ammoName: extractAmmoName(p["ammo"] || ""),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass.** Same command → PASS.
- [ ] **Step 5: Commit** `feat(wiki): wikitext parser for weapon infoboxes`.

---

## Task 2: Importer + enrichment snapshot (inline, iterative)

**Files:** create `prisma/import-wiki-enrichment.mjs`, `prisma/wiki-overrides.json` (`{}`), generate `prisma/wiki-enrichment.json`.

- [ ] **Step 1: Write `prisma/import-wiki-enrichment.mjs`** — uses `wiki-parse.mjs`. Responsibilities:
  - Fetch category members for `Weapons`, `Player_Weapons`, `Mounted_Weapons` (`list=categorymembers`, follow `cmcontinue`).
  - For each title fetch `action=parse&prop=wikitext&redirects=1`; run `parseWeaponInfoboxes`.
  - Build a name index from `prisma/data.json`: map `normalize(displayName)` and `normalize(derivedName)` → slug. `normalize` = lowercase, strip quotes/parens/punctuation, collapse whitespace, and remove spaces around `mm`/`ga`/`x` so "9x42 mm" == "9x42mm".
  - For each entry: slug = overrides[normalize(name)] ?? index[normalize(name)]; if none → push to `unmatched`, skip. Dedupe by slug (first wins; warn on conflicting rarity).
  - Resolve `ammoName` → ammo slug via the same index; if unresolved → omit `ammoSlug`, warn.
  - Build `stats` = `{ type, damage, magazine, value, ammoSlug }` with only non-null keys.
  - Write `prisma/wiki-enrichment.json` (sorted keys). Print: pages, entries, matched, `unmatched` (full list), ammo-unresolved list.

- [ ] **Step 2: Run it.** `node sand-wiki/prisma/import-wiki-enrichment.mjs` (cwd `sand-wiki`). Inspect the `unmatched` list.
- [ ] **Step 3: Fill `wiki-overrides.json`** for genuine matches in the unmatched list (e.g. map wiki variant names to our slugs where a real item exists). Re-run until unmatched is only entries with no corresponding item. Log what stays unmatched.
- [ ] **Step 4: Spot-check** `wiki-enrichment.json`: `rifle-musket` → rarity Common, stats.damage 50, stats.magazine 1, stats.ammoSlug `rifle-ammo`. (Verify the ammo slug resolved.)
- [ ] **Step 5: Commit** `prisma/import-wiki-enrichment.mjs`, `wiki-parse.mjs` (if not already), `wiki-overrides.json`, `wiki-enrichment.json` → `feat(wiki): scrape rarity + weapon stats from sandgame.wiki`.

---

## Task 3: rarity.ts (TDD)

**Files:** create `src/lib/rarity.ts`, `src/lib/rarity.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from "vitest";
import { rarityColor, rarityTier, isRarity, RARITIES } from "./rarity";

describe("rarity", () => {
  it("orders the known scale by tier", () => {
    expect(RARITIES.map((r) => r.name)).toEqual(["Common","Uncommon","Noteworthy","Rare","Remarkable","Exotic"]);
  });
  it("maps name to color (case-insensitive) and null for unknown", () => {
    expect(rarityColor("Common")).toBe("#ADADAD");
    expect(rarityColor("noteworthy")).toBe("#899FB7");
    expect(rarityColor("nope")).toBeNull();
    expect(rarityColor(null)).toBeNull();
  });
  it("maps name to tier; unknown -> 0", () => {
    expect(rarityTier("Rare")).toBe(4);
    expect(rarityTier(undefined)).toBe(0);
  });
  it("validates known names case-insensitively", () => {
    expect(isRarity("Remarkable")).toBe(true);
    expect(isRarity("legendary")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `src/lib/rarity.ts`**

```ts
export interface Rarity { name: string; tier: number; color: string }

/** Ordered rarity scale (names from sandgame.wiki) → game-palette colors. */
export const RARITIES: Rarity[] = [
  { name: "Common", tier: 1, color: "#ADADAD" },
  { name: "Uncommon", tier: 2, color: "#889F83" },
  { name: "Noteworthy", tier: 3, color: "#899FB7" },
  { name: "Rare", tier: 4, color: "#9C86B7" },
  { name: "Remarkable", tier: 5, color: "#E29554" },
  { name: "Exotic", tier: 6, color: "#D16469" },
];

const byName = new Map(RARITIES.map((r) => [r.name.toLowerCase(), r]));

export function rarityColor(name?: string | null): string | null {
  return name ? byName.get(name.toLowerCase())?.color ?? null : null;
}
export function rarityTier(name?: string | null): number {
  return name ? byName.get(name.toLowerCase())?.tier ?? 0 : 0;
}
export function isRarity(name: string): boolean {
  return byName.has(name.toLowerCase());
}
export const KNOWN_RARITY_NAMES = RARITIES.map((r) => r.name);
```

- [ ] **Step 4: Run, verify pass. Step 5: Commit** `feat(wiki): rarity scale + colors`.

(If Task 2's scrape surfaced rarity names beyond these six, add them here before committing and note it.)

---

## Task 4: Schema + seed merge

**Files:** modify `prisma/schema.prisma`, `prisma/seed.ts`. Migration `add_item_rarity_stats`.

- [ ] **Step 1: Edit `model Item`** — add after `derivedName`:
```prisma
  rarity        String?
  stats         Json?
```
and add `@@index([rarity])` next to the existing indexes.

- [ ] **Step 2: Create migration** `npx --prefix sand-wiki prisma migrate dev --name add_item_rarity_stats --create-only` then apply with `prisma migrate dev` (or `prisma db push` if migrate is gated — match how prior migrations were applied). Regenerate client: `npx --prefix sand-wiki prisma generate`.

- [ ] **Step 3: Merge enrichment in `prisma/seed.ts`.** Near the top, load: `const enrich = JSON.parse(readFileSync(join(__dirname, "wiki-enrichment.json"), "utf-8"));`. In the item create loop, compute `const e = enrich[i.slug];` and add to `data`: `rarity: e?.rarity && isRarity(e.rarity) ? e.rarity : undefined, stats: e?.stats ?? undefined,`. Import `isRarity` from `../src/lib/rarity`. Warn if `e.rarity` present but not known.

- [ ] **Step 4: Typecheck** `npx --prefix sand-wiki tsc --noEmit -p sand-wiki/tsconfig.json` → clean. (DB re-seed deferred to Task 8.)
- [ ] **Step 5: Commit** `feat(wiki): add Item.rarity + stats; seed from enrichment`.

---

## Task 5: Filter + queries

**Files:** modify `src/lib/item-filter.ts` (+ `.test.ts`), `src/lib/queries.ts`.

- [ ] **Step 1: Failing test** in `item-filter.test.ts`:
```ts
it("filters by rarity", () => {
  expect(buildItemQuery({ rarity: "Rare" }).where).toEqual({ rarity: "Rare" });
});
```
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3:** In `item-filter.ts` add `rarity?: string` to `ItemFilter` and, in `buildItemQuery`, `if (f.rarity) where.rarity = f.rarity;`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5:** In `queries.ts`: ensure item selects include `rarity` and `stats` (if it uses explicit `select`; if it returns full rows, no change). Add:
```ts
export async function listRarities(filter: ItemFilter): Promise<string[]> {
  const { rarity, ...rest } = filter;
  const rows = await prisma.item.findMany({ where: buildItemQuery(rest).where, select: { rarity: true }, distinct: ["rarity"] });
  return rows.map((r) => r.rarity).filter((r): r is string => !!r);
}
```
- [ ] **Step 6: Run full unit suite** `npm --prefix sand-wiki run test` → PASS. **Commit** `feat(wiki): rarity filter + listRarities`.

---

## Task 6: ItemIcon tint + ItemCard

**Files:** modify `src/components/ItemIcon.tsx`, `src/components/ItemCard.tsx`.

- [ ] **Step 1: `ItemIcon.tsx`** — add prop `rarity?: string | null`. Import `rarityColor` from `@/lib/rarity`. Compute `const tint = rarityColor(rarity);`. On both the `<img>` and placeholder `<span>`, when `tint` is set, apply `style={{ backgroundColor: tint }}` and drop the `bg-base-300` class (keep it when no tint). For the placeholder glyph, when tinted use a fixed dark glyph color (e.g. add `text-base-100`) for contrast.
- [ ] **Step 2: `ItemCard.tsx`** — add `rarity?: string | null` to `ItemCardData`; pass `rarity={item.rarity}` to `<ItemIcon>`.
- [ ] **Step 3: Typecheck + build** `npm --prefix sand-wiki run build` → success.
- [ ] **Step 4: Commit** `feat(wiki): tint item icon by rarity`.

---

## Task 7: RarityFilter + StatBox + page wiring

**Files:** create `src/components/RarityFilter.tsx`, `src/components/StatBox.tsx`; modify `src/app/items/page.tsx`, `src/app/items/[slug]/page.tsx`.

- [ ] **Step 1: `RarityFilter.tsx`** (server component) — props `{ rarities: string[]; current?: string; category?: string; query?: string }`. Render a chip row: an "All" chip (clears `?rarity`) + one chip per rarity in `rarities` **sorted by `rarityTier`**, each a `Link` to `/items?…` preserving `category`/`q` and setting `rarity=<name>`, with a color dot (`rarityColor`) + name; active chip (`current`) highlighted with `aria-current="page"`. Reduced-radius chips like `CategoryQuickNav`.
- [ ] **Step 2: `StatBox.tsx`** — props `{ stats: Record<string, unknown> | null; ammoName?: string | null; ammoSlug?: string | null }`. If `stats` falsy/empty → return null. Render a responsive grid (`grid-cols-2 sm:grid-cols-3 gap-px bg-base-300 rounded-box overflow-hidden`) of present fields in order Damage, Magazine, Type, Ammo, Value with labels; each cell `bg-base-200 p-3` with an uppercase label + value. Ammo cell renders a `Link` to `/items/{ammoSlug}` showing `ammoName` (skip if no slug). Value shows `{value} ◈`.
- [ ] **Step 3: `items/page.tsx`** — read `rarity` from searchParams; validate via `isRarity`; add to the `ItemFilter`. `Promise.all` now also calls `listRarities({ q, category })`. Render `<RarityFilter rarities={rarities} current={rarity} category={category} query={q} />` between the result-count line and the grid. Pass `rarity: i.rarity` into each `ItemCard` item object.
- [ ] **Step 4: `items/[slug]/page.tsx`** — pass `rarity={item.rarity}` to the header `<ItemIcon>`; in the header badge row add a rarity badge (color dot via `rarityColor` + `item.rarity`) when present; under the header render `<StatBox stats={item.stats} ammoName={...} ammoSlug={item.stats?.ammoSlug} />`. Resolve `ammoName` for display: fetch the ammo item's name by slug (add a tiny `getItemName(slug)` or include in the existing query) — simplest: in `StatBox` accept `ammoName` resolved by the page via a `getItemBySlug`-lite; if that's heavy, store `ammoName` in `stats` at import time too. **Decision: store `ammoName` in `stats` during Task 2** so the page needs no extra query. (Update Task 2 `stats` to include `ammoName` alongside `ammoSlug`.)
- [ ] **Step 5: build** → success. **Commit** `feat(wiki): rarity filter, stat box, detail wiring`.

---

## Task 8: Migrate, re-seed, e2e, verify

**Files:** modify `tests/e2e/wiki.spec.ts`.

- [ ] **Step 1: Apply migration + re-seed** (DESTRUCTIVE, Neon dev DB — authorized per workflow). `npm --prefix sand-wiki run db:seed`. Confirm summary + spot-check: query `rifle-musket` → rarity "Common", stats has damage 50.
- [ ] **Step 2: Add e2e** to `wiki.spec.ts`:
```ts
test("items list exposes a rarity filter that narrows results", async ({ page }) => {
  await page.goto("/items?category=weapons");
  const f = page.getByRole("navigation", { name: "Rarity" });
  await expect(f).toBeVisible();
  await f.getByRole("link", { name: /Common/ }).first().click();
  await expect(page).toHaveURL(/rarity=Common/);
});

test("weapon detail shows a stat box with damage and ammo link", async ({ page }) => {
  await page.goto("/items/rifle-musket");
  await expect(page.getByText("Damage", { exact: false })).toBeVisible();
  await expect(page.getByText("50", { exact: false })).toBeVisible();
});
```
(Give `RarityFilter`'s `<nav aria-label="Rarity">`.)
- [ ] **Step 3: Full gate** — `npm --prefix sand-wiki run test`, `lint`, `build`, `test:e2e`. All green; axe clean on `/items` + an enriched detail page.
- [ ] **Step 4: Commit** any e2e/fixups → `test(wiki): rarity filter + stat box e2e`.

---

## Self-Review notes (author)
- **Spec coverage:** §1→Tasks 1,2; §2→Tasks 3,4,5; §3→Tasks 6,7; verification→Task 8. Covered.
- **Type consistency:** `ItemFilter.rarity` (Task 5) used in `items/page.tsx` (Task 7) + `listRarities` (Task 5). `stats` shape `{type,damage,magazine,value,ammoSlug,ammoName}` defined in Task 2, consumed by `StatBox` (Task 7) — note Task 7 Step 4 amends Task 2 to also store `ammoName`. `rarityColor/rarityTier/isRarity` (Task 3) used in Tasks 4,6,7.
- **Re-seed** required (Task 8); destructive, authorized.
- **Iterative scrape** (Task 2) is judgment-heavy — execute inline.
