# Environment Section (Loot Containers Pilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the Environment placeholder into a real data-driven section and populate Loot Containers (7) from sandgame.wiki.

**Architecture:** New `EnvEntity` Prisma model; a one-off committed importer (`prisma/import-env-content.mjs`) that strips wiki markup to a lead description and writes `prisma/env-content.json`; seed merges it. Taxonomy flips `environment` to a data section (Outposts→Landmarks). UI: `/environment` landing + `?category=loot-containers` grid + `/environment/<slug>` detail with source attribution. NPCs/Landmarks/Game-Modes show "coming soon".

**Tech Stack:** Next.js 16, React 19, Prisma 6, Tailwind/DaisyUI, Vitest, Playwright, Node (importer).

**Spec:** `sand-wiki/docs/superpowers/specs/2026-06-10-wiki-environment-loot-design.md`

**Commands:** from `d:/Documents/SandLabs`; app under `sand-wiki/`. `npm --prefix sand-wiki run {test,lint,build,test:e2e}`. Commit via `git -C "d:/Documents/SandLabs"`. Branch `feat/wiki-environment-loot` (spec committed there).

**Real data:** 7 loot containers — Crate of Shells, Food Crate, Medical Cabinet, Parts Crate, Suspicious Pile of Sand, Valuables Safe, Weapon Crate. Lead prose example (Weapon Crate): `The Weapon Crate is a [[Loot Containers|Loot Container]] which mainly stores [[:Category:Player Weapons|Player Weapons]], [[Ammunition]] … all across [[Sophie]].` followed by `===Loot Table===`.

---

## File Structure

**Create:** `prisma/wiki-text.mjs` (+ `wiki-text.test.ts`), `prisma/import-env-content.mjs`, `prisma/env-content.json`, `src/components/EnvCard.tsx`, `src/app/environment/[slug]/page.tsx`.
**Modify:** `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/taxonomy.ts` (+ `taxonomy.test.ts`), `src/lib/queries.ts`, `src/app/environment/page.tsx`, `tests/e2e/wiki.spec.ts`.

---

## Task 1: `stripWikiMarkup` + `titleToSlug` (TDD)

**Files:** create `prisma/wiki-text.mjs`, `prisma/wiki-text.test.ts`.

- [ ] **Step 1: failing tests** (`prisma/wiki-text.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { stripWikiMarkup, titleToSlug } from "./wiki-text.mjs";

const WT = `The Weapon Crate is a [[Loot Containers|Loot Container]] which stores [[:Category:Player Weapons|Player Weapons]] and [[Ammunition]]. '''Bold''' across [[Sophie]]. {{SomeTemplate|x=1}}
===Loot Table===
<tabber>junk {| wikitable |}</tabber>`;

describe("stripWikiMarkup", () => {
  it("returns the lead section as clean text with links/templates/emphasis removed", () => {
    const r = stripWikiMarkup(WT);
    expect(r).toBe("The Weapon Crate is a Loot Container which stores Player Weapons and Ammunition. Bold across Sophie.");
  });
  it("handles empty / heading-only input", () => {
    expect(stripWikiMarkup("==Top==\nx")).toBe("");
    expect(stripWikiMarkup("")).toBe("");
  });
});

describe("titleToSlug", () => {
  it("kebab-cases titles", () => {
    expect(titleToSlug("Weapon Crate")).toBe("weapon-crate");
    expect(titleToSlug("Suspicious Pile of Sand")).toBe("suspicious-pile-of-sand");
    expect(titleToSlug("Crate of Shells")).toBe("crate-of-shells");
  });
});
```

- [ ] **Step 2: run, verify fail.** `npm --prefix sand-wiki run test -- prisma/wiki-text.test.ts`

- [ ] **Step 3: implement `prisma/wiki-text.mjs`**

```js
// Pure helpers for turning a wiki page into a clean lead description. No I/O.

/** Remove all {{...}} templates (brace-matched, nesting-safe). */
function stripTemplates(s) {
  let out = "", depth = 0;
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "{{") { depth++; i++; continue; }
    if (two === "}}") { if (depth > 0) depth--; i++; continue; }
    if (depth === 0) out += s[i];
  }
  return out;
}

/** Lead section (before the first ==heading==) of a wiki page, as clean plain text. */
export function stripWikiMarkup(wikitext) {
  if (!wikitext) return "";
  // lead = text before the first line starting with "=="
  const lead = wikitext.split(/\n=={1,}/)[0] ?? "";
  let s = stripTemplates(lead);
  s = s.replace(/<[^>]+>/g, " ");                       // html/tabber tags
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {     // [[a|b]] -> b, [[a]] -> a
    const parts = inner.split("|");
    return (parts[parts.length - 1] || "").replace(/^:?Category:/i, "").trim();
  });
  s = s.replace(/'''?/g, "");                            // bold/italic
  s = s.replace(/\{\|[\s\S]*?\|\}/g, " ");               // stray wikitables
  s = s.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  return s;
}

/** Kebab-case a page title into a slug. */
export function titleToSlug(title) {
  return (title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: run, verify pass. Step 5: commit** `feat(wiki): wiki-text lead/markup helpers`.

---

## Task 2: env importer + snapshot

**Files:** create `prisma/import-env-content.mjs`, generate `prisma/env-content.json`.

- [ ] **Step 1: write `prisma/import-env-content.mjs`** — reuses the API pattern of `import-wiki-enrichment.mjs`:
  - `categoryMembers("Loot Container")` (ns 0, follow `cmcontinue`).
  - For each title: fetch wikitext (`action=parse&prop=wikitext&redirects=1`), `description = stripWikiMarkup(wt)`, `slug = titleToSlug(title)`.
  - Build `{ [slug]: { category: "loot-containers", name: title, description, sourceUrl: "https://sandgame.wiki/index.php/" + encodeURIComponent(title.replace(/ /g, "_")) } }`.
  - Write `prisma/env-content.json` (sorted keys). Print summary: count + any empty descriptions.

```js
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripWikiMarkup, titleToSlug } from "./wiki-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = "https://sandgame.wiki/api.php";

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "User-Agent": "sand-wiki-env/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function members(cat) {
  const out = []; let cont = {};
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

async function main() {
  const titles = await members("Loot Container");
  const out = {};
  const empty = [];
  for (const title of titles) {
    const description = stripWikiMarkup(await wikitext(title));
    const slug = titleToSlug(title);
    if (!description) empty.push(title);
    out[slug] = {
      category: "loot-containers",
      name: title,
      description,
      sourceUrl: "https://sandgame.wiki/index.php/" + encodeURIComponent(title.replace(/ /g, "_")),
    };
  }
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeFileSync(join(__dirname, "env-content.json"), JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(sorted).length} loot containers. Empty descriptions: ${empty.join(", ") || "none"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: run** `node sand-wiki/prisma/import-env-content.mjs` (cwd `sand-wiki`). Expect 7 entries, no empties.
- [ ] **Step 3: spot-check** `env-content.json`: `weapon-crate` description mentions "Player Weapons"/"Ammunition", sourceUrl ends `/Weapon_Crate`.
- [ ] **Step 4: commit** `prisma/import-env-content.mjs` + `env-content.json` → `feat(wiki): scrape loot container descriptions`.

---

## Task 3: EnvEntity schema + migration

**Files:** modify `prisma/schema.prisma`. Migration `add_env_entity`.

- [ ] **Step 1:** add model to `schema.prisma`:
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
- [ ] **Step 2:** `npx --prefix sand-wiki prisma migrate dev --name add_env_entity`. If `prisma generate` EPERM-fails on the engine DLL (a dev server holding it), the migration still applies and the existing same-version client works — verify with a quick `prisma.envEntity` query rather than killing processes.
- [ ] **Step 3:** confirm client sees the model: `node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.envEntity.count().then(n=>{console.log('envEntity ok',n);return p.$disconnect()})"` → prints `envEntity ok 0`.
- [ ] **Step 4: commit** `prisma/schema.prisma` + `prisma/migrations` → `feat(wiki): add EnvEntity model`.

---

## Task 4: taxonomy (env data section + Landmarks)

**Files:** modify `src/lib/taxonomy.ts`, `src/lib/taxonomy.test.ts`.

- [ ] **Step 1: update tests** (`taxonomy.test.ts`): add a test that the environment section is `kind: "data"` with categories `["loot-containers","landmarks","game-modes","npcs"]`, and that a new `isEnvCategory` validates them:
```ts
it("environment is a data section with the four env categories", () => {
  const env = getSection("environment");
  expect(env?.kind).toBe("data");
  expect(env?.categories.map((c) => c.slug)).toEqual(["loot-containers","landmarks","game-modes","npcs"]);
});
it("validates env categories", () => {
  expect(isEnvCategory("loot-containers")).toBe(true);
  expect(isEnvCategory("weapons")).toBe(false);
});
```
(add `isEnvCategory` to the import.)

- [ ] **Step 2: run, verify fail.**

- [ ] **Step 3: edit `taxonomy.ts`:**
  - In `SECTIONS`, change the `environment` entry to `kind: "data"` and categories to:
    `[{ slug: "loot-containers", label: "Loot Containers" }, { slug: "landmarks", label: "Landmarks" }, { slug: "game-modes", label: "Game Modes" }, { slug: "npcs", label: "NPCs" }]`.
  - Add after the item helpers:
    ```ts
    const ENV_SECTION = SECTIONS.find((s) => s.slug === "environment");
    export const ENV_CATEGORY_SLUGS = ENV_SECTION ? ENV_SECTION.categories.map((c) => c.slug) : [];
    export function isEnvCategory(slug: string): boolean { return ENV_CATEGORY_SLUGS.includes(slug); }
    ```
    (Place the `export` after `SECTIONS` is defined.)
  - Add env category colors to `CATEGORY_COLORS`:
    ```ts
    "loot-containers": "#c9a24b",
    "landmarks": "#7aa6b0",
    "game-modes": "#b07 aa0",
    "npcs": "#9b8b73",
    ```
    (Use valid hex; e.g. `game-modes: "#b07aa0"`, `npcs: "#9b8b73"`.)

- [ ] **Step 4: run, verify pass.** Also confirm existing taxonomy tests still pass (`SECTIONS` order unchanged — environment stays 2nd). **Commit** `feat(wiki): environment becomes a data section (Outposts→Landmarks)`.

---

## Task 5: queries + seed merge

**Files:** modify `src/lib/queries.ts`, `prisma/seed.ts`.

- [ ] **Step 1: `queries.ts`** — add:
```ts
export async function listEnvEntities(category?: string) {
  return prisma.envEntity.findMany({ where: category ? { category } : {}, orderBy: { name: "asc" } });
}
export async function getEnvEntityBySlug(slug: string) {
  return prisma.envEntity.findUnique({ where: { slug } });
}
export async function envCategoryCounts(): Promise<Record<string, number>> {
  const rows = await prisma.envEntity.groupBy({ by: ["category"], _count: true });
  return Object.fromEntries(rows.map((r) => [r.category, r._count]));
}
```

- [ ] **Step 2: `seed.ts`** — import `isEnvCategory` from `../src/lib/taxonomy`; after the recipe loop, add:
```ts
  const envContent: Record<string, { category: string; name: string; description?: string; sourceUrl?: string }> =
    JSON.parse(readFileSync(join(__dirname, "env-content.json"), "utf-8"));
  await prisma.envEntity.deleteMany();
  for (const [slug, e] of Object.entries(envContent)) {
    if (!isEnvCategory(e.category)) { console.warn(`Unknown env category "${e.category}" for ${slug}`); continue; }
    await prisma.envEntity.create({ data: { slug, category: e.category, name: e.name, description: e.description ?? undefined, sourceUrl: e.sourceUrl ?? undefined } });
  }
  console.log(`Seeded ${Object.keys(envContent).length} environment entities.`);
```
(place the `prisma.envEntity.deleteMany()` with the other deletes if preferred; creating after is fine since EnvEntity has no relations.)

- [ ] **Step 3: typecheck** `npx --prefix sand-wiki tsc --noEmit -p sand-wiki/tsconfig.json` → clean. (Re-seed in Task 7.)
- [ ] **Step 4: commit** `feat(wiki): env queries + seed loot containers`.

---

## Task 6: UI (landing, category grid, detail)

**Files:** create `src/components/EnvCard.tsx`, `src/app/environment/[slug]/page.tsx`; rewrite `src/app/environment/page.tsx`.

- [ ] **Step 1: `EnvCard.tsx`**
```tsx
import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

export function EnvCard({ entity }: { entity: { slug: string; name: string; icon?: string | null } }) {
  return (
    <li className="list-none">
      <Link href={`/environment/${entity.slug}`} className="card card-side bg-base-200 hover:bg-base-300 transition-colors h-full items-center gap-3 p-3">
        <ItemIcon name={entity.name} icon={entity.icon} size="card" decorative />
        <div className="flex-1 min-w-0"><div className="font-medium truncate">{entity.name}</div></div>
      </Link>
    </li>
  );
}
```

- [ ] **Step 2: rewrite `environment/page.tsx`**
```tsx
import Link from "next/link";
import { getSection, isEnvCategory, categoryColor, categoryLabel } from "@/lib/taxonomy";
import { listEnvEntities, envCategoryCounts } from "@/lib/queries";
import { EnvCard } from "@/components/EnvCard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EnvironmentPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = str(sp.category);
  const category = raw && isEnvCategory(raw) ? raw : undefined;
  const section = getSection("environment");

  if (!category) {
    const counts = await envCategoryCounts();
    return (
      <section className="py-6">
        <h1 className="font-display text-2xl font-bold mb-4">Environment</h1>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {section?.categories.map((c) => {
            const n = counts[c.slug] ?? 0;
            return (
              <li key={c.slug} className="list-none">
                <Link href={`/environment?category=${c.slug}`} className="card bg-base-200 hover:bg-base-300 transition-colors p-4 flex flex-row items-center gap-3">
                  <span className="size-3 rounded-full" style={{ backgroundColor: categoryColor(c.slug) }} aria-hidden="true" />
                  <span className="font-medium flex-1">{c.label}</span>
                  <span className="badge badge-ghost badge-sm">{n > 0 ? `${n}` : "coming soon"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const entities = await listEnvEntities(category);
  return (
    <section className="py-6">
      <p className="mb-2"><Link href="/environment" className="btn btn-ghost btn-sm">← Environment</Link></p>
      <h1 className="font-display text-2xl font-bold mb-4">{categoryLabel(category)}</h1>
      {entities.length === 0 ? (
        <div role="alert" className="alert alert-warning max-w-2xl"><span>Coming soon — no entries yet.</span></div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((e) => <EnvCard key={e.id} entity={{ slug: e.slug, name: e.name, icon: e.icon }} />)}
        </ul>
      )}
    </section>
  );
}
```
Note: `categoryLabel` currently only knows item categories; extend it (Task 4) — actually it falls back to the slug. To show "Loot Containers", read the label from the section categories instead. **Use** `section?.categories.find((c) => c.slug === category)?.label ?? category` rather than `categoryLabel(category)`. Update the code above accordingly when implementing.

- [ ] **Step 3: `environment/[slug]/page.tsx`**
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnvEntityBySlug } from "@/lib/queries";

type Params = Promise<{ slug: string }>;

export default async function EnvEntityPage({ params }: { params: Params }) {
  const { slug } = await params;
  const e = await getEnvEntityBySlug(slug);
  if (!e) notFound();
  return (
    <article className="py-6 space-y-4 max-w-2xl">
      <p><Link href="/environment" className="btn btn-ghost btn-sm">← Environment</Link></p>
      <h1 className="font-display text-3xl font-bold">{e.name}</h1>
      {e.description && e.description.split(/\n+/).map((p, i) => <p key={i} className="text-base-content/80">{p}</p>)}
      {e.sourceUrl && (
        <p className="text-sm text-base-content/60">
          Source: <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">sandgame.wiki ↗</a>
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 4: build** `npm --prefix sand-wiki run build` → success. **Commit** `feat(wiki): environment landing, category grid, detail pages`.

---

## Task 7: re-seed + e2e + full gate

**Files:** modify `tests/e2e/wiki.spec.ts`.

- [ ] **Step 1: re-seed** (DESTRUCTIVE, Neon dev DB — authorized). `npm --prefix sand-wiki run db:seed`. Spot-check: `listEnvEntities("loot-containers")` returns 7; `getEnvEntityBySlug("weapon-crate")` has a description + sourceUrl.

- [ ] **Step 2: replace the env e2e.** The existing test `environment section shows a coming-soon placeholder` (asserts `/coming soon/i` + "Loot Containers" text) must be updated — the landing now shows real categories. Replace with:
```ts
test("environment landing lists Loot Containers and links to a container", async ({ page }) => {
  await page.goto("/environment");
  await expect(page.getByRole("heading", { name: "Environment" })).toBeVisible();
  await page.getByRole("link", { name: /Loot Containers/ }).click();
  await expect(page).toHaveURL(/category=loot-containers/);
  const container = page.getByRole("link", { name: "Weapon Crate" });
  await expect(container).toBeVisible();
});

test("loot container detail shows a description and a source link", async ({ page }) => {
  await page.goto("/environment/weapon-crate");
  await expect(page.getByRole("heading", { name: "Weapon Crate" })).toBeVisible();
  await expect(page.getByText(/Player Weapons/)).toBeVisible();
  await expect(page.getByRole("link", { name: /sandgame\.wiki/ })).toHaveAttribute("href", /Weapon_Crate/);
});
```
Also add `/environment/weapon-crate` to the a11y `pages` array at the top of the file.

- [ ] **Step 3: full gate** (note the `:3000` stale-dev-server caveat — if a leftover dev server occupies :3000, build + `next start -p <other>` and run e2e via a throwaway `playwright.tmp.config.ts` pointing at that port): `npm --prefix sand-wiki run test`, `lint`, `build`, `test:e2e`. All green; axe clean on `/environment` + a detail page.
- [ ] **Step 4: commit** `test(wiki): environment e2e`.

---

## Self-Review notes (author)
- **Spec coverage:** §1→Task 3; §2→Tasks 1,2; §3→Task 4; §4→Task 5; §5→Task 6; §6→Task 5 seed + Task 7 re-seed; verification→Task 7. Covered.
- **Type consistency:** `EnvEntity` fields (slug/category/name/description/sourceUrl/icon) consistent across schema (T3), seed (T5), queries (T5), UI (T6). `isEnvCategory`/`ENV_CATEGORY_SLUGS` (T4) used in page (T6) + seed (T5). `stripWikiMarkup`/`titleToSlug` (T1) used by importer (T2).
- **Label fix noted** in T6 Step 2: use the section's category label, not `categoryLabel` (which is item-only).
- **Re-seed** required (T7), destructive/authorized.
