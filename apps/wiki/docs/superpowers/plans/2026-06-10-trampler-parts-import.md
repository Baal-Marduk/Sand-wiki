# Trampler Parts Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full Tramplers section in sand-wiki, populated from the game wiki's `Category:Trampler Components` pages, with research + build-cost data shaped for a future tech tree.

**Architecture:** Mirror the existing Environment pipeline end-to-end: a one-off wiki importer (`import-tramplers.mjs`) writes a slug-keyed `prisma/tramplers.json` snapshot + downloads module images; the seed loads it into a new `TramplerPart` Prisma model; queries + a list page + a detail page render it. Pure-function parsers (module infobox, research line, cost mapping, category) live in unit-tested helpers.

**Tech Stack:** Next.js 16, React 19, Prisma 6 (PostgreSQL/Neon), Vitest, Tailwind/daisyUI, react-icons. All commands run from `sand-wiki/`.

**Spec:** `docs/superpowers/specs/2026-06-10-trampler-parts-import-design.md`

**Working directory note:** every command below assumes the shell is in `d:\Documents\SandLabs\sand-wiki`. The branch `feat/trampler-parts-import` is already checked out.

---

## Task 1: Pure parsers in `wiki-text.mjs` (module infobox, research, cost)

**Files:**
- Modify: `prisma/wiki-text.mjs`
- Test: `prisma/wiki-text.test.ts`

These are the I/O-free building blocks the importer uses. TDD them first.

- [ ] **Step 1: Write failing tests for `parseModule`, `parseResearch`, `parseCost`**

Append to `prisma/wiki-text.test.ts`:

```typescript
import { parseModule, parseResearch, parseCost } from "./wiki-text.mjs";

const MODULE_WT = `{{Module
| name = KF-B "Hole" Middling Chassis
| image = KF-B "Hole" Middling Chassis.png
| dimensions = 4x3
| research = II(b). Middling Chassis {{Tag Tier2}}
| weight_capacity = 25000
| weight = 1200
| energy_consumption = 5
| cost 1 = 75
| cost 2 = 200
| cost 3 = 0
| cost 4 = 0
}}
<blockquote>Flavor text here.</blockquote>
[[Category:Trampler Components]]`;

describe("parseModule", () => {
  it("extracts every | key = value field of the {{Module}} block", () => {
    const m = parseModule(MODULE_WT);
    expect(m.name).toBe(`KF-B "Hole" Middling Chassis`);
    expect(m.image).toBe(`KF-B "Hole" Middling Chassis.png`);
    expect(m.dimensions).toBe("4x3");
    expect(m.research).toBe("II(b). Middling Chassis {{Tag Tier2}}");
    expect(m.weight_capacity).toBe("25000");
    expect(m.weight).toBe("1200");
    expect(m.energy_consumption).toBe("5");
    expect(m["cost 1"]).toBe("75");
    expect(m["cost 4"]).toBe("0");
  });

  it("returns {} when there is no Module block", () => {
    expect(parseModule("Just prose.")).toEqual({});
  });
});

describe("parseResearch", () => {
  it("splits a node-prefixed research label into node / name / tier", () => {
    expect(parseResearch("II(b). Middling Chassis {{Tag Tier2}}")).toEqual({
      node: "II(b)", name: "Middling Chassis", tier: 2,
    });
  });

  it("keeps dotted root names whole when there is no node prefix", () => {
    expect(parseResearch("K.K. Landwehr {{Tag Tier1}}")).toEqual({
      node: null, name: "K.K. Landwehr", tier: 1,
    });
  });

  it("returns nulls for empty input", () => {
    expect(parseResearch("")).toEqual({ node: null, name: null, tier: null });
  });
});

describe("parseCost", () => {
  it("maps cost 1..4 to resolved item slugs, dropping zeros", () => {
    const fields = { "cost 1": "75", "cost 2": "200", "cost 3": "0", "cost 4": "0" };
    const resolve = (name) => ({ "Mechanical Parts": "resource-metal-t1" }[name]);
    expect(parseCost(fields, resolve)).toEqual([
      { name: "Crowns", amount: 75 },
      { slug: "resource-metal-t1", name: "Mechanical Parts", amount: 200 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- wiki-text`
Expected: FAIL — `parseModule is not a function` (and the other two).

- [ ] **Step 3: Implement the three parsers in `prisma/wiki-text.mjs`**

Append to `prisma/wiki-text.mjs`:

```javascript
/** Parse a {{Module}} infobox into a flat { key: value } map. Line-based: collects
 *  `| key = value` lines until the closing `}}` on its own line, so inline templates
 *  in a value (e.g. {{Tag Tier2}}) are preserved. Returns {} if no Module block. */
export function parseModule(wikitext) {
  if (!wikitext) return {};
  const start = wikitext.indexOf("{{Module");
  if (start < 0) return {};
  const lines = wikitext.slice(start).split("\n");
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\}\}/.test(line)) break;
    const m = line.match(/^\s*\|\s*([^=]+?)\s*=\s*(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

/** The four ordered cost slots of the {{Module}} infobox, by resource name.
 *  cost 1 is the Crowns currency (no item slug); 2-4 are craftable resources. */
const COST_SLOTS = [
  { field: "cost 1", name: "Crowns" },
  { field: "cost 2", name: "Mechanical Parts" },
  { field: "cost 3", name: "Pneumatic Parts" },
  { field: "cost 4", name: "Computing Module" },
];

/** Build a [{ slug?, name, amount }] cost array from Module fields, dropping zero/blank
 *  amounts. `resolve(name)` returns an item slug or undefined; Crowns stays slug-less. */
export function parseCost(fields, resolve) {
  const out = [];
  for (const { field, name } of COST_SLOTS) {
    const amount = Number(fields[field]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const slug = name === "Crowns" ? undefined : resolve(name);
    out.push(slug ? { slug, name, amount } : { name, amount });
  }
  return out;
}

/** Parse `research = II(b). Middling Chassis {{Tag TierN}}` into { node, name, tier }.
 *  Roman-numeral node prefixes (I, II(b), …) are split off; dotted root names
 *  (e.g. "K.K. Landwehr") have no node and stay whole. */
export function parseResearch(value) {
  if (!value) return { node: null, name: null, tier: null };
  const tierMatch = value.match(/\{\{\s*Tag\s+Tier(\d+)\s*\}\}/i);
  const tier = tierMatch ? Number(tierMatch[1]) : null;
  const text = value.replace(/\{\{[^}]*\}\}/g, "").trim();
  const nodeMatch = text.match(/^([IVX]+(?:\([a-z]\))?)\.\s+(.*)$/);
  if (nodeMatch) return { node: nodeMatch[1], name: nodeMatch[2].trim(), tier };
  return { node: null, name: text || null, tier };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- wiki-text`
Expected: PASS (all parseModule / parseResearch / parseCost cases).

- [ ] **Step 5: Commit**

```bash
git add prisma/wiki-text.mjs prisma/wiki-text.test.ts
git commit -m "feat(wiki): module/research/cost parsers for trampler import"
```

---

## Task 2: Taxonomy — Tramplers section, categories, name→category mapping

**Files:**
- Modify: `src/lib/taxonomy.ts`
- Test: `src/lib/taxonomy.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/taxonomy.test.ts` (inside the existing `describe("taxonomy", …)` block, before its closing `});`):

```typescript
  it("exposes the nine trampler categories as a data section", () => {
    const tr = getSection("tramplers");
    expect(tr?.kind).toBe("data");
    expect(tr?.categories.map((c) => c.slug)).toEqual([
      "chassis", "reactors", "engines", "crew", "driving",
      "cargo", "turrets", "stations", "structure",
    ]);
    expect(isTramplerCategory("chassis")).toBe(true);
    expect(isTramplerCategory("weapons")).toBe(false);
  });

  it("maps component names to functional categories, specific before generic", () => {
    expect(tramplerCategoryForName("KF-B \"Hole\" Middling Chassis")).toBe("chassis");
    expect(tramplerCategoryForName("NZ AzE80 Motor-Reactor, Covered (1x3)")).toBe("reactors");
    expect(tramplerCategoryForName("NZ Mb2k Maneuver Engine, Small")).toBe("engines");
    expect(tramplerCategoryForName("S&H MK4 Crew Cabin, 4 People")).toBe("crew");
    expect(tramplerCategoryForName("S&H M78 Framed Steering Deck")).toBe("driving");
    expect(tramplerCategoryForName("S&H Cargo Bay, L-Shape")).toBe("cargo");
    expect(tramplerCategoryForName("S.Trs Turret Deck")).toBe("turrets");
    expect(tramplerCategoryForName("S&H Armaments Workbench")).toBe("stations");
    expect(tramplerCategoryForName("S&H Supporting Frame")).toBe("structure");
  });
```

Add `isTramplerCategory` and `tramplerCategoryForName` to the existing import at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- taxonomy`
Expected: FAIL — `tramplerCategoryForName is not a function` and the section still has `kind: "placeholder"`.

- [ ] **Step 3: Implement in `src/lib/taxonomy.ts`**

3a. Add the trampler categories array after `itemCategories` (around line 25):

```typescript
const tramplerCategories: Category[] = [
  { slug: "chassis", label: "Chassis" },
  { slug: "reactors", label: "Reactors" },
  { slug: "engines", label: "Engines" },
  { slug: "crew", label: "Crew Compartments" },
  { slug: "driving", label: "Driving Compartments" },
  { slug: "cargo", label: "Cargo" },
  { slug: "turrets", label: "Turret Decks & Defenses" },
  { slug: "stations", label: "Crafting Stations" },
  { slug: "structure", label: "Structure & Decks" },
];
```

3b. Replace the `tramplers` line in `SECTIONS` (currently line 40):

```typescript
  { slug: "tramplers", label: "Tramplers", kind: "data", categories: tramplerCategories },
```

3c. Add exports + helpers after the env helpers (after line 65):

```typescript
export const TRAMPLER_CATEGORIES = tramplerCategories;
export const TRAMPLER_CATEGORY_SLUGS = tramplerCategories.map((c) => c.slug);

export function isTramplerCategory(slug: string): boolean {
  return TRAMPLER_CATEGORY_SLUGS.includes(slug);
}

/** Ordered keyword rules mapping a component name to a functional category.
 *  Specific keywords MUST precede generic ones (e.g. "Turret Deck" before "Deck",
 *  "Crew Cabin" before "Cabin"). Unmatched names fall back to "structure". */
const TRAMPLER_NAME_RULES: { kw: RegExp; category: string }[] = [
  { kw: /chassis/i, category: "chassis" },
  { kw: /reactor/i, category: "reactors" },
  { kw: /engine/i, category: "engines" },
  { kw: /turret deck/i, category: "turrets" },
  { kw: /armor plate|embrasure|battering ram|casemate/i, category: "turrets" },
  { kw: /crew (cabin|module)|captain|\bcabin\b/i, category: "crew" },
  { kw: /steering deck|flybridge|pilot bridge|wheelhouse/i, category: "driving" },
  { kw: /cargo/i, category: "cargo" },
  { kw: /workbench|workshop/i, category: "stations" },
];

export function tramplerCategoryForName(name: string): string {
  for (const { kw, category } of TRAMPLER_NAME_RULES) {
    if (kw.test(name)) return category;
  }
  return "structure";
}
```

3d. Add accent colors to `CATEGORY_COLORS` (inside the object literal, after the environment block):

```typescript
  // trampler categories
  chassis: "#a6794f",
  reactors: "#d4a23f",
  engines: "#cf7a4f",
  crew: "#6aa9c9",
  driving: "#7fb069",
  cargo: "#9b8b73",
  turrets: "#8b94a6",
  stations: "#4fb3a6",
  structure: "#7a8a99",
```

3e. Extend `categoryLabel` so the `CategoryTag` on the detail page resolves trampler
labels (today it only searches `itemCategories`, so `chassis` would render as the raw
slug). Replace the existing function (line 52-54):

```typescript
export function categoryLabel(slug: string): string {
  return (
    itemCategories.find((c) => c.slug === slug)?.label ??
    tramplerCategories.find((c) => c.slug === slug)?.label ??
    slug
  );
}
```

Add a test for this inside the `describe("taxonomy", …)` block:

```typescript
  it("resolves trampler category labels", () => {
    expect(categoryLabel("stations")).toBe("Crafting Stations");
    expect(categoryLabel("chassis")).toBe("Chassis");
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- taxonomy`
Expected: PASS, including the pre-existing "exposes the five top-level sections in order" test (order is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxonomy.ts src/lib/taxonomy.test.ts
git commit -m "feat(wiki): tramplers data section + name->category mapping"
```

---

## Task 3: `TramplerPart` Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_trampler_part/migration.sql` (generated)

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Append after the `EnvEntity` model (after line 44):

```prisma
model TramplerPart {
  id          String  @id @default(cuid())
  slug        String  @unique
  name        String
  category    String
  description String?
  icon        String?
  sourceUrl   String?

  dimensions         String?
  health             Int?
  weight             Int?
  weightCapacity     Int?
  weightCompensation Int?
  energyConsumption  Int?
  energyCapacity     Int?
  ratedPower         Int?
  crewSlots          Int?
  itemSlots          Int?

  researchNode String?
  researchName String?
  researchTier Int?

  cost Json?

  @@index([category])
  @@index([researchTier])
}
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name add_trampler_part`
Expected: Prisma generates `prisma/migrations/<ts>_add_trampler_part/migration.sql` with a `CREATE TABLE "TramplerPart"` + two indexes, applies it to the dev DB, and regenerates the client. No data loss prompt (new table only).

- [ ] **Step 3: Verify the client type exists**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors; `prisma.tramplerPart` is now available).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(wiki): add TramplerPart model + migration"
```

---

## Task 4: Importer `import-tramplers.mjs` + generated snapshot

**Files:**
- Create: `prisma/import-tramplers.mjs`
- Create (generated): `prisma/tramplers.json`, `public/tramplers/*.png`

This script does live wiki I/O, so it is verified by running it (not unit-tested); its pure parsers are already covered by Task 1.

- [ ] **Step 1: Write the importer**

Create `prisma/import-tramplers.mjs`:

```javascript
// One-off importer: scrape Trampler Component pages from sandgame.wiki into
// prisma/tramplers.json (slug-keyed) and download module images into public/tramplers/.
//   node prisma/import-tramplers.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripWikiMarkup, titleToSlug, parseModule, parseResearch, parseCost } from "./wiki-text.mjs";
import { tramplerCategoryForName } from "../src/lib/taxonomy.ts";

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const __dirname = dirname(fileURLToPath(import.meta.url));
const API = "https://sandgame.wiki/api.php";
const CATEGORY = "Trampler Components";

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "User-Agent": "sand-wiki-tramplers/1.0 (one-off import)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function members(cat) {
  const out = [];
  let cont = {};
  do {
    const d = await api({ action: "query", list: "categorymembers", cmtitle: `Category:${cat}`, cmlimit: "500", format: "json", ...cont });
    out.push(...(d.query?.categorymembers ?? []).filter((m) => m.ns === 0).map((m) => m.title));
    cont = d.continue ? { cmcontinue: d.continue.cmcontinue } : null;
  } while (cont);
  return out;
}

async function wikitext(title) {
  const d = await api({ action: "parse", page: title, prop: "wikitext", format: "json", formatversion: "2", redirects: "1" });
  return d?.parse?.wikitext ?? "";
}

// Resolve a File: page to its original URL, download it to public/tramplers/<slug>.png.
async function downloadImage(imageField, slug, dir) {
  if (!imageField) return undefined;
  const d = await api({ action: "query", titles: `File:${imageField}`, prop: "imageinfo", iiprop: "url", format: "json", formatversion: "2" });
  const url = d?.query?.pages?.[0]?.imageinfo?.[0]?.url;
  if (!url) return undefined;
  const r = await fetch(url, { headers: { "User-Agent": "sand-wiki-tramplers/1.0 (one-off import)" } });
  if (!r.ok) return undefined;
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(join(dir, `${slug}.png`), buf);
  return `/tramplers/${slug}.png`;
}

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
};

async function main() {
  // Name -> item slug index (shared resolver with item/env import).
  const data = JSON.parse(readFileSync(join(__dirname, "data.json"), "utf-8"));
  let overrides = {};
  try { overrides = JSON.parse(readFileSync(join(__dirname, "wiki-overrides.json"), "utf-8")); } catch { /* none */ }
  const index = new Map();
  for (const it of data.items) for (const n of [it.displayName, it.name]) {
    const k = norm(n);
    if (k && !index.has(k)) index.set(k, it.slug);
  }
  const resolveSlug = (name) => overrides[norm(name)] ?? index.get(norm(name));

  const imgDir = join(__dirname, "..", "public", "tramplers");
  if (!existsSync(imgDir)) mkdirSync(imgDir, { recursive: true });

  const titles = await members(CATEGORY);
  const out = {};
  const catCounts = {};
  const unresolvedCost = new Set();
  const noImage = [];

  for (const title of titles) {
    const wt = await wikitext(title);
    const m = parseModule(wt);
    const slug = titleToSlug(title);
    const category = tramplerCategoryForName(title);
    catCounts[category] = (catCounts[category] ?? 0) + 1;
    const research = parseResearch(m.research);
    const cost = parseCost(m, resolveSlug);
    for (const c of cost) if (!c.slug && c.name !== "Crowns") unresolvedCost.add(c.name);
    const icon = await downloadImage(m.image, slug, imgDir);
    if (!icon) noImage.push(title);

    out[slug] = {
      slug, name: m.name || title, category,
      description: stripWikiMarkup(wt) || undefined,
      icon, sourceUrl: "https://sandgame.wiki/index.php/" + encodeURIComponent(title.replace(/ /g, "_")),
      dimensions: m.dimensions || undefined,
      health: toInt(m.health),
      weight: toInt(m.weight),
      weightCapacity: toInt(m.weight_capacity),
      weightCompensation: toInt(m.weight_compensation),
      energyConsumption: toInt(m.energy_consumption),
      energyCapacity: toInt(m.energy_capacity),
      ratedPower: toInt(m.rated_power),
      crewSlots: toInt(m.crew_slots),
      itemSlots: toInt(m.item_slots),
      researchNode: research.node ?? undefined,
      researchName: research.name ?? undefined,
      researchTier: research.tier ?? undefined,
      cost: cost.length ? cost : undefined,
    };
    console.log(`  ${title} -> ${category}${icon ? "" : " (no image)"}`);
  }

  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeFileSync(join(__dirname, "tramplers.json"), JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(sorted).length} trampler parts.`);
  console.log(`Per category: ${JSON.stringify(catCounts)}`);
  if (unresolvedCost.size) console.log(`Unresolved cost items: ${[...unresolvedCost].join(", ")}`);
  if (noImage.length) console.log(`No image: ${noImage.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Note: the script imports `tramplerCategoryForName` from the `.ts` taxonomy file, so it must be run with `tsx` (which transpiles TS on the fly), matching how `db:seed` runs.

- [ ] **Step 2: Run the importer**

Run: `npx tsx prisma/import-tramplers.mjs`
Expected: ~130 `<title> -> <category>` lines, a final `Wrote N trampler parts.` (N ≈ 130), a per-category JSON summary, and ideally no unresolved-cost / no-image lines. `prisma/tramplers.json` and `public/tramplers/*.png` are created.

- [ ] **Step 3: Sanity-check the snapshot**

Run: `node -e "const t=require('./prisma/tramplers.json'); const v=Object.values(t); console.log('count', v.length); console.log('sample', JSON.stringify(v.find(x=>x.category==='chassis'), null, 2)); console.log('categories', [...new Set(v.map(x=>x.category))].sort());"`
Expected: count ≈ 130; a chassis sample with `dimensions`, `researchTier`, and a `cost` array whose resource entries have `slug` set; all 9 category slugs (or the subset actually present) appear and are valid.

- [ ] **Step 4: Commit**

```bash
git add prisma/import-tramplers.mjs prisma/tramplers.json public/tramplers
git commit -m "feat(wiki): trampler component importer + data snapshot"
```

---

## Task 5: Seed the `TramplerPart` table

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add the trampler block to `prisma/seed.ts`**

1a. Update the taxonomy import (line 4) to include `isTramplerCategory`:

```typescript
import { categoryForItem, isItemCategory, isEnvCategory, isTramplerCategory } from "../src/lib/taxonomy";
```

1b. Add an interface near the top (after the `EnvContent` interface, line 7):

```typescript
interface TramplerContent {
  slug: string; name: string; category: string; description?: string; icon?: string; sourceUrl?: string;
  dimensions?: string; health?: number; weight?: number; weightCapacity?: number; weightCompensation?: number;
  energyConsumption?: number; energyCapacity?: number; ratedPower?: number; crewSlots?: number; itemSlots?: number;
  researchNode?: string; researchName?: string; researchTier?: number; cost?: unknown;
}
```

1c. Add `await prisma.tramplerPart.deleteMany();` to the delete phase (after line 47, the `envEntity.deleteMany()`):

```typescript
  await prisma.tramplerPart.deleteMany();
```

1d. Add the create loop after the env loop (after line 111, before the final `console.log`):

```typescript
  const tramplers: Record<string, TramplerContent> = JSON.parse(
    readFileSync(join(__dirname, "tramplers.json"), "utf-8"),
  );
  let tramplerCount = 0;
  for (const [slug, t] of Object.entries(tramplers)) {
    if (!isTramplerCategory(t.category)) {
      console.warn(`Unknown trampler category "${t.category}" for ${slug} — skipped`);
      continue;
    }
    await prisma.tramplerPart.create({
      data: {
        slug, name: t.name, category: t.category,
        description: t.description ?? undefined, icon: t.icon ?? undefined, sourceUrl: t.sourceUrl ?? undefined,
        dimensions: t.dimensions ?? undefined,
        health: t.health ?? undefined, weight: t.weight ?? undefined,
        weightCapacity: t.weightCapacity ?? undefined, weightCompensation: t.weightCompensation ?? undefined,
        energyConsumption: t.energyConsumption ?? undefined, energyCapacity: t.energyCapacity ?? undefined,
        ratedPower: t.ratedPower ?? undefined, crewSlots: t.crewSlots ?? undefined, itemSlots: t.itemSlots ?? undefined,
        researchNode: t.researchNode ?? undefined, researchName: t.researchName ?? undefined,
        researchTier: t.researchTier ?? undefined,
        cost: (t.cost ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    tramplerCount++;
  }
```

1e. Update the final summary log (line 113):

```typescript
  console.log(`Seeded ${data.items.length} items, ${data.recipes.length} recipes, ${envCount} environment entities, ${tramplerCount} trampler parts.`);
```

- [ ] **Step 2: Run the seed**

Run: `npm run db:seed`
Expected: ends with `Seeded … N trampler parts.` (N ≈ 130), no "Unknown trampler category" warnings.

- [ ] **Step 3: Verify rows landed**

Run: `node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.tramplerPart.groupBy({by:['category'],_count:true}).then(r=>{console.log(r);return p.$disconnect();})"`
Expected: a per-category count breakdown summing to ≈130.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(wiki): seed TramplerPart rows from snapshot"
```

---

## Task 6: Queries for trampler parts

**Files:**
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: Add the three queries**

Append after the env queries (after `envCategoryCounts`, around line 90):

```typescript
/** Trampler parts, optionally filtered by functional category. */
export async function listTramplerParts(category?: string) {
  return prisma.tramplerPart.findMany({
    where: category ? { category } : {},
    orderBy: [{ researchTier: "asc" }, { name: "asc" }],
  });
}

export async function getTramplerPartBySlug(slug: string) {
  return prisma.tramplerPart.findUnique({ where: { slug } });
}

/** Count of trampler parts per category — for the Tramplers landing. */
export async function tramplerCategoryCounts(): Promise<Record<string, number>> {
  const rows = await prisma.tramplerPart.groupBy({ by: ["category"], _count: true });
  return Object.fromEntries(rows.map((r) => [r.category, r._count]));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(wiki): trampler part queries"
```

---

## Task 7: Category icons for the new slugs

**Files:**
- Modify: `src/components/CategoryIcon.tsx`

- [ ] **Step 1: Add icons for the trampler category slugs**

Update the imports and `ICONS` map. Change the `react-icons/gi` import line to add the new glyphs:

```typescript
import {
  GiPistolGun, GiFieldGun, GiWoodPile , GiArmorVest, GiFirstAidKit,
  GiAmmoBox, GiCardboardBox, GiOpenChest, GiCastle, GiGamepad, GiPerson,
  GiTank, GiNuclearPlant, GiGears, GiCog, GiHelmet, GiSteeringWheel,
  GiCargoCrate, GiCannon, GiAnvil,
} from "react-icons/gi";
```

Add to the `ICONS` object (after the environment entries):

```typescript
  chassis: GiTank,
  reactors: GiNuclearPlant,
  engines: GiGears,
  crew: GiHelmet,
  driving: GiSteeringWheel,
  cargo: GiCargoCrate,
  turrets: GiCannon,
  stations: GiAnvil,
  structure: GiCog,
```

(`GiCog` is imported as the `structure` glyph; remove the unused `GiGears`/`GiCog` only if eslint flags duplicates — both are used here.)

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. If any imported icon name does not exist in `react-icons/gi`, swap it for a valid one (e.g. `GiPowerGenerator` for reactors) — verify names at build time.

- [ ] **Step 3: Commit**

```bash
git add src/components/CategoryIcon.tsx
git commit -m "feat(wiki): category icons for trampler sections"
```

---

## Task 8: `TramplerCard` component

**Files:**
- Create: `src/components/TramplerCard.tsx`

- [ ] **Step 1: Write the component** (mirrors `EnvCard`, linking to `/tramplers/<slug>`)

Create `src/components/TramplerCard.tsx`:

```tsx
import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

/** Card for a trampler part, linking to its detail page. Shows the module image,
 *  name, dimensions, and research tier. */
export function TramplerCard({
  part,
}: {
  part: { slug: string; name: string; icon?: string | null; dimensions?: string | null; researchTier?: number | null };
}) {
  return (
    <li className="list-none">
      <Link
        href={`/tramplers/${part.slug}`}
        className="card card-side bg-base-200 hover:bg-base-300 transition-colors h-full items-center gap-3 p-3"
      >
        <ItemIcon name={part.name} icon={part.icon} size="card" decorative />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{part.name}</div>
          <div className="text-xs text-base-content/60">
            {part.dimensions && <span>{part.dimensions}</span>}
            {part.dimensions && part.researchTier != null && <span> · </span>}
            {part.researchTier != null && <span>Tier {part.researchTier}</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/TramplerCard.tsx
git commit -m "feat(wiki): TramplerCard component"
```

---

## Task 9: Tramplers list page

**Files:**
- Modify: `src/app/tramplers/page.tsx`

- [ ] **Step 1: Replace the placeholder** (mirrors `src/app/environment/page.tsx`)

Replace the entire contents of `src/app/tramplers/page.tsx`:

```tsx
import Link from "next/link";
import { getSection, isTramplerCategory } from "@/lib/taxonomy";
import { CategoryIcon } from "@/components/CategoryIcon";
import { listTramplerParts, tramplerCategoryCounts } from "@/lib/queries";
import { TramplerCard } from "@/components/TramplerCard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TramplersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = str(sp.category);
  const category = raw && isTramplerCategory(raw) ? raw : undefined;
  const section = getSection("tramplers");
  const labelOf = (slug: string) => section?.categories.find((c) => c.slug === slug)?.label ?? slug;

  if (!category) {
    const counts = await tramplerCategoryCounts();
    return (
      <section className="py-6">
        <h1 className="font-display text-2xl font-bold mb-4">Tramplers</h1>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {section?.categories.map((c) => {
            const n = counts[c.slug] ?? 0;
            return (
              <li key={c.slug} className="list-none">
                <Link
                  href={`/tramplers?category=${c.slug}`}
                  className="card bg-base-200 hover:bg-base-300 transition-colors p-4 flex flex-row items-center gap-3"
                >
                  <CategoryIcon slug={c.slug} className="size-5 shrink-0" />
                  <span className="font-medium flex-1">{c.label}</span>
                  <span className="badge badge-ghost badge-sm">{n > 0 ? n : "coming soon"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const parts = await listTramplerParts(category);
  return (
    <section className="py-6">
      <p className="mb-2"><Link href="/tramplers" className="btn btn-ghost btn-sm">← Tramplers</Link></p>
      <h1 className="font-display text-2xl font-bold mb-4">{labelOf(category)}</h1>
      {parts.length === 0 ? (
        <div role="alert" className="alert alert-warning max-w-2xl">
          <span>Coming soon — no entries yet for this category.</span>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {parts.map((p) => (
            <TramplerCard
              key={p.id}
              part={{ slug: p.slug, name: p.name, icon: p.icon, dimensions: p.dimensions, researchTier: p.researchTier }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`, open `http://localhost:3000/tramplers`.
Expected: a 9-card category grid with non-zero counts; clicking e.g. "Chassis" lists chassis cards with image, name, dimensions · Tier N. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/app/tramplers/page.tsx
git commit -m "feat(wiki): tramplers section list page"
```

---

## Task 10: Trampler detail page

**Files:**
- Create: `src/app/tramplers/[slug]/page.tsx`

- [ ] **Step 1: Write the detail page** (header + image, stat grid, research line, build-cost list, source link)

Create `src/app/tramplers/[slug]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTramplerPartBySlug, getItemIconMap } from "@/lib/queries";
import { ItemIcon } from "@/components/ItemIcon";
import { ItemIconLink } from "@/components/ItemIconLink";
import { CategoryTag } from "@/components/CategoryTag";

type Params = Promise<{ slug: string }>;

interface CostEntry { slug?: string; name: string; amount: number }

export default async function TramplerPartPage({ params }: { params: Params }) {
  const { slug } = await params;
  const part = await getTramplerPartBySlug(slug);
  if (!part) notFound();

  const cost = (part.cost as CostEntry[] | null) ?? [];
  const icons = await getItemIconMap(cost.map((c) => c.slug).filter(Boolean) as string[]);

  const stats: { label: string; value: React.ReactNode }[] = [];
  if (part.dimensions) stats.push({ label: "Dimensions", value: part.dimensions });
  if (part.health != null) stats.push({ label: "Health", value: part.health });
  if (part.weight != null) stats.push({ label: "Weight", value: part.weight });
  if (part.weightCapacity != null) stats.push({ label: "Weight Capacity", value: part.weightCapacity });
  if (part.weightCompensation != null) stats.push({ label: "Weight Compensation", value: part.weightCompensation });
  if (part.energyConsumption != null) stats.push({ label: "Energy Consumption", value: part.energyConsumption });
  if (part.energyCapacity != null) stats.push({ label: "Energy Capacity", value: part.energyCapacity });
  if (part.ratedPower != null) stats.push({ label: "Rated Power", value: part.ratedPower });
  if (part.crewSlots != null) stats.push({ label: "Crew Slots", value: part.crewSlots });
  if (part.itemSlots != null) stats.push({ label: "Item Slots", value: part.itemSlots });

  const research = [part.researchNode, part.researchName].filter(Boolean).join(". ");

  return (
    <article className="py-6 space-y-6 max-w-3xl">
      <p><Link href="/tramplers" className="btn btn-ghost btn-sm">← Tramplers</Link></p>
      <header className="flex flex-wrap items-start gap-4">
        <ItemIcon name={part.name} icon={part.icon} size="lg" decorative />
        <div className="flex-1 min-w-[16rem] space-y-2">
          <h1 className="font-display text-3xl font-bold">{part.name}</h1>
          <CategoryTag slug={part.category} />
          {part.description && <p className="text-base-content/80 max-w-prose">{part.description}</p>}
        </div>
      </header>

      {stats.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-base-300 rounded-box overflow-hidden">
          {stats.map((s) => (
            <div key={s.label} className="bg-base-200 px-3 py-2">
              <dt className="text-[0.65rem] uppercase tracking-wide text-base-content/60">{s.label}</dt>
              <dd className="font-medium">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(research || part.researchTier != null) && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-1">Research</h2>
          <p className="text-base-content/80">
            {research || "—"}
            {part.researchTier != null && <span className="badge badge-outline ml-2">Tier {part.researchTier}</span>}
          </p>
        </section>
      )}

      {cost.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-2">Build Cost</h2>
          <div className="flex flex-wrap gap-4">
            {cost.map((c) => (
              <ItemIconLink key={c.name} slug={c.slug} name={c.name} icon={c.slug ? icons[c.slug] : null} amount={c.amount} />
            ))}
          </div>
        </section>
      )}

      {part.sourceUrl && (
        <p className="text-sm text-base-content/60">
          Source:{" "}
          <a href={part.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
            sandgame.wiki ↗
          </a>
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`, open a part page (e.g. `http://localhost:3000/tramplers/kf-b-hole-middling-chassis`).
Expected: header with image + category tag + flavor text; a stat grid; a Research line with tier badge; a Build Cost row showing Crowns + resource icons with ×amounts (resource icons link to their item pages); a source link. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/tramplers/[slug]/page.tsx
git commit -m "feat(wiki): trampler part detail page"
```

---

## Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test + typecheck + lint suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all unit tests pass (including new wiki-text + taxonomy cases), no type errors, no lint errors.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: a clean production build; `/tramplers` and `/tramplers/[slug]` appear in the route output.

- [ ] **Step 3: Final manual smoke check**

Run: `npm run dev`, then verify:
- `/tramplers` shows 9 categories with counts,
- each category lists its parts,
- a detail page renders stats, research, and build cost.
Stop the dev server.

- [ ] **Step 4: (No commit)** — verification only. If anything failed, fix it under the relevant task and re-run.

---

## Self-Review notes (for the executor)

- **Spec coverage:** model (Task 3), importer + image download + cost resolution (Task 4), categorization (Task 2), seed (Task 5), queries (Task 6), list + detail UI (Tasks 8–10), tech-tree fields `researchNode/Name/Tier` + slug-referencing `cost` (Tasks 1, 4, 5). Out-of-scope items (search, tech-tree graph) are intentionally absent.
- **Type consistency:** `tramplerCategoryForName`/`isTramplerCategory`/`TRAMPLER_CATEGORY_SLUGS` (Task 2) are consumed verbatim in Tasks 4, 5, 9. `cost` JSON shape `{slug?, name, amount}` is produced by `parseCost` (Task 1), stored as-is (Tasks 4–5), and read as `CostEntry` (Task 10). Field names match the Prisma model (Task 3) throughout the seed (Task 5) and queries (Task 6).
- **Known runtime caveat:** `import-tramplers.mjs` imports a `.ts` file, so it must run under `tsx` (Task 4 Step 2 uses `npx tsx`). The seed already runs under `tsx` via `db:seed`.
