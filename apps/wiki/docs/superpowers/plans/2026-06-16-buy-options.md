# Buy Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the derived "Buyable"/"Sellable" prices with a stored, editable buy model — multiple buy options per item, each a multi-entity price bundle with a yield and an optional tech-node unlock — rendered in a "Buy" tab and editable via a grouped picker.

**Architecture:** Buy data lives on the item as `EntityLink` rows bundled into options by a new `buyGroup Int?` column, across three roles: `buy-cost` (price components), `buy-yield` (self-row, quantity received), `buy-unlock` (optional tech node). `buy-cost`/`buy-yield` are seed-managed and lock-map protected (like `loot`/`cost`); `buy-unlock` is contributor-only and seed-immune. A shared `convertCoinTradesToBuyLinks` routine migrates the old Coin Crown trade-recipes (used by both a one-time script and the seed). Edits flow through a new `buy_options_edit` Proposal kind.

**Tech Stack:** Next.js (App Router, server components + server actions), Prisma 6 (Neon Postgres), React client components, Vitest, tsx for scripts.

**Conventions for every task below:**
- Run a single test file: `npx vitest run <path>`
- Run a script: `npx tsx <path>`
- Lint: `npm run lint`
- This repo's Next.js has breaking changes — see `AGENTS.md`; check `node_modules/next/dist/docs/` before using unfamiliar Next APIs.
- **Never** run `db:seed`, `db:seed:force`, or `db:reset` against the live Neon DB (see memory: never-reseed-live-db). Migrations and the one-time script are safe; reseeds are not.

---

## Phase 1 — Data model

### Task 1: Add `buyGroup` column to `EntityLink`

**Files:**
- Modify: `prisma/schema.prisma:94-111` (the `EntityLink` model)

- [ ] **Step 1: Add the column**

In `model EntityLink`, add after `sortOrder Int` (line 107):

```prisma
  buyGroup  Int?
```

So the model reads:

```prisma
model EntityLink {
  id        String  @id @default(dbgenerated("(gen_random_uuid())::text"))
  sourceId  String
  source    Entity  @relation("LinkSource", fields: [sourceId], references: [id], onDelete: Cascade)
  targetId  String?
  target    Entity? @relation("LinkTarget", fields: [targetId], references: [id], onDelete: SetNull)
  role      String
  name      String
  amount    Int?
  tier      String?
  value1    String?
  value2    String?
  value3    String?
  sortOrder Int
  buyGroup  Int?

  @@index([sourceId, role])
  @@index([targetId])
}
```

- [ ] **Step 2: Create the migration against the dev DB**

Run: `npx prisma migrate dev --name entity-link-buy-group`
Expected: a new folder under `prisma/migrations/` containing `ALTER TABLE "EntityLink" ADD COLUMN "buyGroup" INTEGER;`, and "Your database is now in sync with your schema."

- [ ] **Step 3: Verify client regenerated**

Run: `npx prisma generate`
Expected: "Generated Prisma Client". `buyGroup` is now a nullable field on `EntityLink`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add EntityLink.buyGroup for grouped buy options"
```

---

### Task 2: Register the three buy roles

**Files:**
- Modify: `src/lib/entity-links.ts:16-27` (the `LINK_ROLES` catalog)
- Test: `src/lib/entity-links.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/entity-links.test.ts`:

```ts
import { isLinkRole, linkFields } from "./entity-links";

describe("buy roles", () => {
  it("registers buy-cost / buy-yield / buy-unlock as link roles", () => {
    expect(isLinkRole("buy-cost")).toBe(true);
    expect(isLinkRole("buy-yield")).toBe(true);
    expect(isLinkRole("buy-unlock")).toBe(true);
  });

  it("buy-cost and buy-yield edit the amount field; buy-unlock has none", () => {
    expect(linkFields("buy-cost")).toEqual(["amount"]);
    expect(linkFields("buy-yield")).toEqual(["amount"]);
    expect(linkFields("buy-unlock")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/entity-links.test.ts`
Expected: FAIL — `isLinkRole("buy-cost")` is `false`.

- [ ] **Step 3: Add the roles**

In `src/lib/entity-links.ts`, extend `LINK_ROLES` (after the key roles, before the closing `} as const;`):

```ts
  // Buy options: an item can be purchased in several ways. All rows for one option
  // share a `buyGroup` (see EntityLink.buyGroup). `buy-cost` = one price component,
  // `buy-yield` = a self-row whose amount is how many of the item you receive,
  // `buy-unlock` = an optional tech-node that gates the option. These are NOT edited
  // via the generic LinkEditForm — they use the grouped BuyOptionsEditor. `buy-cost`/
  // `buy-yield` are seed-managed + lock-map protected (like loot/cost); `buy-unlock`
  // is contributor-only and seed-immune (like the key roles).
  "buy-cost": { label: "Buy Cost", fields: ["amount"] },
  "buy-yield": { label: "Buy Yield", fields: ["amount"] },
  "buy-unlock": { label: "Buy Unlock", fields: [] },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/entity-links.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/entity-links.ts src/lib/entity-links.test.ts
git commit -m "feat(links): register buy-cost/buy-yield/buy-unlock roles"
```

---

### Task 3: Buy-options grouping helper + view types

**Files:**
- Create: `src/lib/buy-options.ts`
- Test: `src/lib/buy-options.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/buy-options.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupBuyOptions, type BuyLinkRow } from "./buy-options";

const row = (p: Partial<BuyLinkRow>): BuyLinkRow => ({
  role: "buy-cost", buyGroup: 0, amount: 1, name: "X",
  target: { slug: "x", kind: "item", icon: null, rarity: null }, ...p,
});

describe("groupBuyOptions", () => {
  it("bundles rows by buyGroup, ordered by group", () => {
    const rows: BuyLinkRow[] = [
      row({ role: "buy-cost", buyGroup: 1, amount: 1200, name: "Coin Crown", target: { slug: "coin-crown", kind: "item", icon: null, rarity: null } }),
      row({ role: "buy-yield", buyGroup: 1, amount: 1, name: "Cannon", target: { slug: "cannon", kind: "item", icon: null, rarity: null } }),
      row({ role: "buy-cost", buyGroup: 0, amount: 500, name: "Coin Crown", target: { slug: "coin-crown", kind: "item", icon: null, rarity: null } }),
      row({ role: "buy-cost", buyGroup: 0, amount: 1, name: "Wine Crate", target: { slug: "wine-crate", kind: "item", icon: null, rarity: null } }),
      row({ role: "buy-yield", buyGroup: 0, amount: 1, name: "Cannon", target: { slug: "cannon", kind: "item", icon: null, rarity: null } }),
      row({ role: "buy-unlock", buyGroup: 0, amount: null, name: "Heavy Ordnance", target: { slug: "heavy-ordnance", kind: "tech-node", icon: null, rarity: null } }),
    ];
    const opts = groupBuyOptions(rows);
    expect(opts.map((o) => o.group)).toEqual([0, 1]);
    expect(opts[0].costs.map((c) => c.slug)).toEqual(["coin-crown", "wine-crate"]);
    expect(opts[0].yield).toBe(1);
    expect(opts[0].unlock).toEqual({ slug: "heavy-ordnance", name: "Heavy Ordnance" });
    expect(opts[1].costs.map((c) => c.amount)).toEqual([1200]);
    expect(opts[1].unlock).toBeNull();
  });

  it("defaults yield to 1 when no buy-yield row is present", () => {
    const opts = groupBuyOptions([row({ role: "buy-cost", buyGroup: 0, amount: 5 })]);
    expect(opts[0].yield).toBe(1);
  });

  it("ignores rows with a null buyGroup", () => {
    expect(groupBuyOptions([row({ buyGroup: null })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/buy-options.test.ts`
Expected: FAIL — cannot find module `./buy-options`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/buy-options.ts`:

```ts
/** A loaded EntityLink row participating in buy options, target resolved to slug/kind. */
export interface BuyLinkRow {
  role: string; // "buy-cost" | "buy-yield" | "buy-unlock"
  buyGroup: number | null;
  amount: number | null;
  name: string;
  target: { slug: string; kind: string | null; icon: string | null; rarity: string | null } | null;
}

export interface BuyCostView {
  slug: string | null;
  name: string;
  icon: string | null;
  rarity: string | null;
  amount: number;
}

/** One buy option, ready to render. `yield` = quantity received (default 1). */
export interface BuyOptionView {
  group: number;
  costs: BuyCostView[];
  yield: number;
  unlock: { slug: string; name: string } | null;
}

/** Group flat buy links into options by `buyGroup` (ascending). Rows with a null
 *  buyGroup are ignored. Within a group: buy-cost rows are the price (in arrival
 *  order), the buy-yield row's amount is the quantity received (absent ⇒ 1), and the
 *  optional buy-unlock row (target = tech node) is the gate. */
export function groupBuyOptions(rows: BuyLinkRow[]): BuyOptionView[] {
  const byGroup = new Map<number, BuyLinkRow[]>();
  for (const r of rows) {
    if (r.buyGroup === null) continue;
    (byGroup.get(r.buyGroup) ?? byGroup.set(r.buyGroup, []).get(r.buyGroup)!).push(r);
  }
  return [...byGroup.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([group, rs]) => {
      const costs: BuyCostView[] = rs
        .filter((r) => r.role === "buy-cost")
        .map((r) => ({
          slug: r.target?.slug ?? null,
          name: r.name,
          icon: r.target?.icon ?? null,
          rarity: r.target?.rarity ?? null,
          amount: r.amount ?? 1,
        }));
      const yieldRow = rs.find((r) => r.role === "buy-yield");
      const unlockRow = rs.find((r) => r.role === "buy-unlock" && r.target);
      return {
        group,
        costs,
        yield: yieldRow?.amount ?? 1,
        unlock: unlockRow?.target ? { slug: unlockRow.target.slug, name: unlockRow.name } : null,
      };
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/buy-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/buy-options.ts src/lib/buy-options.test.ts
git commit -m "feat(buy): groupBuyOptions helper + view types"
```

---

## Phase 2 — Migration logic (shared by script and seed)

### Task 4: Coin-trade classification + buy-option extraction (pure helpers)

**Files:**
- Create: `prisma/buy-migration.ts`
- Test: `prisma/buy-migration.test.ts`

These pure functions decide, for a recipe, whether it is a buy (coins in, item out), a sell (item in, coins out), or a real craft; and convert a buy recipe into a buy option's cost+yield. `convertCoinTradesToBuyLinks` (the DB routine) is added in Task 5 in the same file.

- [ ] **Step 1: Write the failing test**

Create `prisma/buy-migration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyCoinRecipe, buyOptionFromRecipe, type MigRecipe } from "./buy-migration";

const CUR = "coin-crown";
const r = (inputs: [string, number][], outputs: [string, number][]): MigRecipe => ({
  id: "r", slug: "r",
  inputs: inputs.map(([slug, amount]) => ({ slug, amount })),
  outputs: outputs.map(([slug, amount]) => ({ slug, amount })),
});

describe("classifyCoinRecipe", () => {
  it("coins in, item out → buy", () => {
    expect(classifyCoinRecipe(r([[CUR, 500]], [["cannon", 1]]), CUR)).toBe("buy");
  });
  it("item in, coins out → sell", () => {
    expect(classifyCoinRecipe(r([["cannon", 1]], [[CUR, 300]]), CUR)).toBe("sell");
  });
  it("no currency → keep", () => {
    expect(classifyCoinRecipe(r([["wood", 2]], [["plank", 1]]), CUR)).toBe("keep");
  });
  it("currency on both sides → keep (not a trade)", () => {
    expect(classifyCoinRecipe(r([[CUR, 1]], [[CUR, 2]]), CUR)).toBe("keep");
  });
});

describe("buyOptionFromRecipe", () => {
  it("extracts cost components (non-currency excluded) and yield from the item output", () => {
    const opt = buyOptionFromRecipe(r([[CUR, 500], ["wine-crate", 1]], [["cannon", 2]]), "cannon", CUR);
    expect(opt.costs).toEqual([
      { slug: CUR, amount: 500 },
      { slug: "wine-crate", amount: 1 },
    ]);
    expect(opt.yield).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/buy-migration.test.ts`
Expected: FAIL — cannot find module `./buy-migration`.

- [ ] **Step 3: Implement the pure helpers**

Create `prisma/buy-migration.ts`:

```ts
export interface MigLine { slug: string; amount: number }
export interface MigRecipe { id: string; slug: string; inputs: MigLine[]; outputs: MigLine[] }

const has = (lines: MigLine[], slug: string) => lines.some((l) => l.slug === slug);

/** Classify a recipe relative to the currency item. "buy" = currency in & item out;
 *  "sell" = item in & currency out; "keep" = anything else (incl. currency on both
 *  sides, or no currency). */
export function classifyCoinRecipe(rec: MigRecipe, currencySlug: string): "buy" | "sell" | "keep" {
  const inHas = has(rec.inputs, currencySlug);
  const outHas = has(rec.outputs, currencySlug);
  if (inHas === outHas) return "keep"; // both or neither → not a pure trade
  return inHas ? "buy" : "sell";
}

export interface ExtractedOption { costs: MigLine[]; yield: number }

/** From a buy recipe, the cost components (all inputs) and the yield (the item output's
 *  amount). `itemSlug` is the bought item (the recipe's non-currency output). */
export function buyOptionFromRecipe(rec: MigRecipe, itemSlug: string, currencySlug: string): ExtractedOption {
  const costs = rec.inputs.map((l) => ({ slug: l.slug, amount: l.amount }));
  const out = rec.outputs.find((o) => o.slug === itemSlug);
  return { costs, yield: out?.amount ?? 1 };
}

/** The bought item of a buy recipe = its first non-currency output slug (null if none). */
export function boughtItemSlug(rec: MigRecipe, currencySlug: string): string | null {
  return rec.outputs.find((o) => o.slug !== currencySlug)?.slug ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run prisma/buy-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/buy-migration.ts prisma/buy-migration.test.ts
git commit -m "feat(migration): pure coin-trade classification + buy-option extraction"
```

---

### Task 5: `convertCoinTradesToBuyLinks` DB routine

**Files:**
- Modify: `prisma/buy-migration.ts`

This is the idempotent, lock-map-aware routine that both the one-time script (Task 6) and the seed (Task 7) call. It reads all recipes, classifies them, writes buy-cost/buy-yield links for buy recipes (skipping items whose `lootCurated` is true), deletes the converted buy recipes and all sell recipes.

- [ ] **Step 1: Add the routine**

Append to `prisma/buy-migration.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export interface ConvertResult {
  itemsConverted: number;
  optionsCreated: number;
  buyRecipesDeleted: number;
  sellRecipesDeleted: number;
  itemsSkippedCurated: number;
}

/** Convert Coin Crown trade-recipes into buy options, in one transaction.
 *  - buy recipes (coins in, item out) → buy-cost + buy-yield EntityLinks on the item,
 *    then the recipe is deleted. Items with lootCurated=true are skipped (their buy
 *    links are community-owned) but their stale buy recipes are still removed.
 *  - sell recipes (item in, coins out) → deleted (the Value field conveys sell worth).
 *  Idempotent: an item that already has buy-cost rows is not re-converted (its recipes,
 *  if any remain, are still cleaned). */
export async function convertCoinTradesToBuyLinks(
  prisma: PrismaClient,
  opts: { currencySlug: string },
): Promise<ConvertResult> {
  const { currencySlug } = opts;
  return prisma.$transaction(async (tx) => {
    const recipes = await tx.recipe.findMany({
      include: {
        inputs: { include: { item: { select: { slug: true } } } },
        outputs: { include: { item: { select: { slug: true } } } },
      },
    });

    const mig: MigRecipe[] = recipes.map((r) => ({
      id: r.id,
      slug: r.slug,
      inputs: r.inputs.map((l) => ({ slug: l.item.slug, amount: l.amount })),
      outputs: r.outputs.map((l) => ({ slug: l.item.slug, amount: l.amount })),
    }));

    const buyByItem = new Map<string, ExtractedOption[]>();
    const buyRecipeIds: string[] = [];
    const sellRecipeIds: string[] = [];
    for (const rec of mig) {
      const cls = classifyCoinRecipe(rec, currencySlug);
      if (cls === "sell") { sellRecipeIds.push(rec.id); continue; }
      if (cls !== "buy") continue;
      const itemSlug = boughtItemSlug(rec, currencySlug);
      if (!itemSlug) continue;
      const opt = buyOptionFromRecipe(rec, itemSlug, currencySlug);
      (buyByItem.get(itemSlug) ?? buyByItem.set(itemSlug, []).get(itemSlug)!).push(opt);
      buyRecipeIds.push(rec.id);
    }

    // Resolve item ids (sources/targets) for every slug we touch.
    const slugs = new Set<string>();
    for (const [itemSlug, options] of buyByItem) {
      slugs.add(itemSlug);
      for (const o of options) for (const c of o.costs) slugs.add(c.slug);
    }
    const ents = await tx.entity.findMany({
      where: { slug: { in: [...slugs] } },
      select: { id: true, slug: true, name: true, lootCurated: true },
    });
    const bySlug = new Map(ents.map((e) => [e.slug, e]));

    let itemsConverted = 0, optionsCreated = 0, itemsSkippedCurated = 0;
    for (const [itemSlug, options] of buyByItem) {
      const item = bySlug.get(itemSlug);
      if (!item) continue;
      if (item.lootCurated) { itemsSkippedCurated++; continue; }

      const existing = await tx.entityLink.count({ where: { sourceId: item.id, role: "buy-cost" } });
      if (existing > 0) continue; // idempotent — already converted

      let group = 0;
      const linkRows: {
        sourceId: string; targetId: string | null; role: string; name: string;
        amount: number | null; sortOrder: number; buyGroup: number;
      }[] = [];
      for (const o of options) {
        let sortOrder = 0;
        for (const c of o.costs) {
          const tgt = bySlug.get(c.slug);
          if (!tgt) continue;
          linkRows.push({ sourceId: item.id, targetId: tgt.id, role: "buy-cost", name: tgt.name, amount: c.amount, sortOrder: sortOrder++, buyGroup: group });
        }
        linkRows.push({ sourceId: item.id, targetId: item.id, role: "buy-yield", name: item.name, amount: o.yield, sortOrder: sortOrder++, buyGroup: group });
        group++;
      }
      if (linkRows.length) {
        await tx.entityLink.createMany({ data: linkRows });
        itemsConverted++;
        optionsCreated += options.length;
      }
    }

    if (buyRecipeIds.length) await tx.recipe.deleteMany({ where: { id: { in: buyRecipeIds } } });
    if (sellRecipeIds.length) await tx.recipe.deleteMany({ where: { id: { in: sellRecipeIds } } });

    return {
      itemsConverted, optionsCreated,
      buyRecipesDeleted: buyRecipeIds.length,
      sellRecipesDeleted: sellRecipeIds.length,
      itemsSkippedCurated,
    };
  });
}
```

> Note: the Recipe line relation field is `item` (see `RecipeInput`/`RecipeOutput` in `schema.prisma`). If your schema names the relation differently, adjust the `include`/`.item.slug` accessors to match.

- [ ] **Step 2: Verify it type-checks**

Run: `npm run lint`
Expected: no errors in `prisma/buy-migration.ts`.

- [ ] **Step 3: Commit**

```bash
git add prisma/buy-migration.ts
git commit -m "feat(migration): convertCoinTradesToBuyLinks (idempotent, lock-map aware)"
```

---

### Task 6: One-time migration script

**Files:**
- Create: `prisma/migrate-coin-trades-to-buy.ts`

- [ ] **Step 1: Write the script**

Create `prisma/migrate-coin-trades-to-buy.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { convertCoinTradesToBuyLinks } from "./buy-migration";
import { CURRENCY_SLUG } from "../src/lib/trades";

const prisma = new PrismaClient();

async function main() {
  const result = await convertCoinTradesToBuyLinks(prisma, { currencySlug: CURRENCY_SLUG });
  console.log("Coin-trade → buy-option migration complete:", result);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add after `db:load-curated-extras`:

```json
    "db:migrate-buy-options": "tsx prisma/migrate-coin-trades-to-buy.ts",
```

- [ ] **Step 3: Dry-run against the dev DB**

Run: `npm run db:migrate-buy-options`
Expected: prints a `ConvertResult` with non-zero `buyRecipesDeleted` and `optionsCreated`. Run it **a second time** — expected: `itemsConverted: 0` (idempotent; already-converted items skipped).

- [ ] **Step 4: Commit**

```bash
git add prisma/migrate-coin-trades-to-buy.ts package.json
git commit -m "feat(migration): one-time db:migrate-buy-options script"
```

> **Live DB:** after deploying the schema migration (Task 1) to prod with `prisma migrate deploy`, run `npm run db:migrate-buy-options` **once** against the live DB. This is a targeted migration, not a reseed — safe under the never-reseed rule.

---

## Phase 3 — Seed integration

### Task 7: Seed reproduces buy options and stops emitting coin recipes

**Files:**
- Modify: `prisma/seed.ts` (end of `main`, after recipes + entities are imported)

The seed already imports coin-trade recipes as `Recipe` rows. Rather than rework the recipe import, run the same conversion at the **end** of the seed so a fresh dev DB ends up with buy options instead of coin recipes. `buy-cost`/`buy-yield` become seed-managed; the `lootCurated` guard inside `convertCoinTradesToBuyLinks` protects community edits. `buy-unlock` is never written by the seed.

- [ ] **Step 1: Import the routine**

At the top of `prisma/seed.ts`, with the other imports:

```ts
import { convertCoinTradesToBuyLinks } from "./buy-migration";
import { CURRENCY_SLUG } from "../src/lib/trades";
```

- [ ] **Step 2: Call it at the end of `main`**

Just before `main` finishes its console summary (after tech-tree links are written), add:

```ts
  const buyResult = await convertCoinTradesToBuyLinks(prisma, { currencySlug: CURRENCY_SLUG });
  console.log(
    `Buy options: converted ${buyResult.itemsConverted} item(s), ${buyResult.optionsCreated} option(s); ` +
    `deleted ${buyResult.buyRecipesDeleted} buy + ${buyResult.sellRecipesDeleted} sell recipe(s); ` +
    `skipped ${buyResult.itemsSkippedCurated} curated item(s).`,
  );
```

- [ ] **Step 3: Reseed the DEV DB and verify**

Run: `npm run db:seed`
Expected: completes; the new "Buy options:" line reports converted items and deleted recipes. (Only the dev DB — never live.)

- [ ] **Step 4: Spot-check in the DB**

Run:
```bash
npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); p.entityLink.count({where:{role:'buy-cost'}}).then(n=>{console.log('buy-cost rows:',n); return p.\$disconnect();});"
```
Expected: a non-zero count.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): reproduce buy options from coin trades at seed end"
```

---

## Phase 4 — Proposal pipeline (edit → review → apply)

### Task 8: Buy-options proposal change shape + parse/validate

**Files:**
- Modify: `src/lib/buy-options.ts`
- Test: `src/lib/buy-options.test.ts`

Defines the stored `changes` JSON shape for a `buy_options_edit` proposal and a pure parser that turns the editor's flat FormData arrays into validated `BuyOptionDraft[]`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/buy-options.test.ts`:

```ts
import { parseBuyOptionsForm, type BuyOptionsForm } from "./buy-options";

describe("parseBuyOptionsForm", () => {
  const valid: BuyOptionsForm = {
    optGroups: ["0", "1"],
    optYields: ["1", "1"],
    optUnlockSlugs: ["heavy-ordnance", ""],
    costGroups: ["0", "0", "1"],
    costSlugs: ["coin-crown", "wine-crate", "coin-crown"],
    costAmounts: ["500", "1", "1200"],
  };

  it("reconstructs options grouped by index, ordered by group", () => {
    const { options, error } = parseBuyOptionsForm(valid);
    expect(error).toBeNull();
    expect(options).toHaveLength(2);
    expect(options[0]).toEqual({
      yield: 1,
      unlockSlug: "heavy-ordnance",
      costs: [{ targetSlug: "coin-crown", amount: 500 }, { targetSlug: "wine-crate", amount: 1 }],
    });
    expect(options[1]).toEqual({ yield: 1, unlockSlug: null, costs: [{ targetSlug: "coin-crown", amount: 1200 }] });
  });

  it("rejects an option with no cost components", () => {
    const { error } = parseBuyOptionsForm({ ...valid, costGroups: ["0"], costSlugs: ["coin-crown"], costAmounts: ["500"] });
    expect(error).toMatch(/at least one/i);
  });

  it("rejects a non-positive amount", () => {
    const { error } = parseBuyOptionsForm({ ...valid, costAmounts: ["0", "1", "1200"] });
    expect(error).toMatch(/positive/i);
  });

  it("rejects a non-positive yield", () => {
    const { error } = parseBuyOptionsForm({ ...valid, optYields: ["0", "1"] });
    expect(error).toMatch(/yield/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/buy-options.test.ts`
Expected: FAIL — `parseBuyOptionsForm` is not exported.

- [ ] **Step 3: Implement the shape + parser**

Append to `src/lib/buy-options.ts`:

```ts
/** One cost component in an editable/stored buy option. */
export interface BuyCostDraft { targetSlug: string; amount: number }

/** One editable/stored buy option (the shape persisted in a proposal's `changes`). */
export interface BuyOptionDraft {
  yield: number;
  unlockSlug: string | null; // tech-node slug or null
  costs: BuyCostDraft[];
}

/** Stored shape of a buy_options_edit proposal's `changes` JSON. */
export interface BuyOptionsChange { old: BuyOptionDraft[]; new: BuyOptionDraft[] }

/** Flat, index-aligned arrays the BuyOptionsEditor emits. Option-level arrays are
 *  aligned to each other; cost-level arrays are aligned to each other and reference
 *  their option via `costGroups`. */
export interface BuyOptionsForm {
  optGroups: string[];
  optYields: string[];
  optUnlockSlugs: string[];
  costGroups: string[];
  costSlugs: string[];
  costAmounts: string[];
}

export interface ParsedBuyOptions { options: BuyOptionDraft[]; error: string | null }

const posInt = (s: string): number | null => {
  const n = Number((s ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Reconstruct and validate buy options from the editor's flat arrays. Options are
 *  ordered by their position in `optGroups`. Each option needs ≥1 cost; amounts and
 *  yields must be positive integers; an empty unlock slug means no unlock. */
export function parseBuyOptionsForm(form: BuyOptionsForm): ParsedBuyOptions {
  const costsByGroup = new Map<string, BuyCostDraft[]>();
  for (let i = 0; i < form.costSlugs.length; i++) {
    const slug = (form.costSlugs[i] ?? "").trim();
    if (slug === "") continue;
    const amount = posInt(form.costAmounts[i] ?? "");
    if (amount === null) return { options: [], error: `Cost amount for ${slug} must be a positive whole number.` };
    const g = form.costGroups[i] ?? "";
    (costsByGroup.get(g) ?? costsByGroup.set(g, []).get(g)!).push({ targetSlug: slug, amount });
  }

  const options: BuyOptionDraft[] = [];
  for (let i = 0; i < form.optGroups.length; i++) {
    const g = form.optGroups[i] ?? "";
    const costs = costsByGroup.get(g) ?? [];
    if (costs.length === 0) return { options: [], error: "Each buy option needs at least one cost component." };
    const y = posInt(form.optYields[i] ?? "");
    if (y === null) return { options: [], error: "Buy option yield must be a positive whole number." };
    const unlockSlug = (form.optUnlockSlugs[i] ?? "").trim() || null;
    options.push({ yield: y, unlockSlug, costs });
  }
  return { options, error: null };
}

/** Order-sensitive equality of two option lists (for the no-op check). */
export function buyOptionsEqual(a: BuyOptionDraft[], b: BuyOptionDraft[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((o, i) => {
    const p = b[i];
    return o.yield === p.yield && o.unlockSlug === p.unlockSlug &&
      o.costs.length === p.costs.length &&
      o.costs.every((c, j) => c.targetSlug === p.costs[j].targetSlug && c.amount === p.costs[j].amount);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/buy-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/buy-options.ts src/lib/buy-options.test.ts
git commit -m "feat(buy): proposal change shape + parseBuyOptionsForm validator"
```

---

### Task 9: Query helpers — load buy options for render and for the editor

**Files:**
- Modify: `src/lib/queries.ts` (add two helpers near `getOutgoingLinks`, ~line 343)
- Modify: `src/lib/buy-options.ts` (add `optionsToDrafts` for the editor prefill)

- [ ] **Step 1: Add `optionsToDrafts` to buy-options.ts**

Append to `src/lib/buy-options.ts`:

```ts
/** Convert loaded buy-option views into editable drafts (for prefilling the editor). */
export function optionsToDrafts(views: BuyOptionView[]): BuyOptionDraft[] {
  return views.map((v) => ({
    yield: v.yield,
    unlockSlug: v.unlock?.slug ?? null,
    costs: v.costs
      .filter((c) => c.slug !== null)
      .map((c) => ({ targetSlug: c.slug as string, amount: c.amount })),
  }));
}
```

- [ ] **Step 2: Add `getBuyOptions` query (for rendering)**

In `src/lib/queries.ts`, after `getOutgoingLinks` (line 365), add:

```ts
import { groupBuyOptions, type BuyLinkRow } from "./buy-options";
// (add to the existing import block at top of file if not already importing from ./buy-options)

/** An item's buy options, grouped and ready to render. Empty array if the item has
 *  none. buy-unlock targets resolve to tech-node slug/name; buy-cost to item slug/icon. */
export async function getBuyOptions(itemSlug: string): Promise<BuyOptionView[]> {
  const entity = await prisma.entity.findUnique({
    where: { slug: itemSlug },
    select: {
      outgoingLinks: {
        where: { role: { in: ["buy-cost", "buy-yield", "buy-unlock"] }, ...linkTargetEnabled },
        orderBy: [{ buyGroup: "asc" }, { sortOrder: "asc" }],
        select: {
          role: true, buyGroup: true, amount: true, name: true,
          target: { select: { slug: true, kind: true, icon: true, rarity: true } },
        },
      },
    },
  });
  if (!entity) return [];
  return groupBuyOptions(entity.outgoingLinks as BuyLinkRow[]);
}
```

> `linkTargetEnabled` is the existing fragment that hides disabled link targets (used by `getOutgoingLinks`/`getTechTree`). Import/reference it the same way those queries do. `BuyOptionView` must be imported from `./buy-options`.

- [ ] **Step 3: Add `getBuyOptionsForEdit` (editor prefill + entity check)**

In `src/lib/queries.ts`, after `getBuyOptions`, add:

```ts
/** Buy options for the editor: the item (id/name/kind) + its current options as views.
 *  Null if the slug is not an item. */
export async function getBuyOptionsForEdit(itemSlug: string) {
  const item = await prisma.entity.findUnique({
    where: { slug: itemSlug },
    select: { id: true, name: true, kind: true },
  });
  if (!item || item.kind !== "item") return null;
  const options = await getBuyOptions(itemSlug);
  return { item, options };
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npm run lint`
Expected: no errors. (If `linkTargetEnabled` is module-private, move the helper next to the other queries that already use it, or export it.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts src/lib/buy-options.ts
git commit -m "feat(buy): getBuyOptions + getBuyOptionsForEdit + optionsToDrafts"
```

---

### Task 10: `submitBuyOptionsEdit` server action

**Files:**
- Modify: `src/app/contribute/actions.ts`

- [ ] **Step 1: Add the action**

In `src/app/contribute/actions.ts`, add a new exported action (mirror the structure of `submitItemLootEdit`, lines 261-303). Add the needed imports at the top: `getBuyOptionsForEdit` from `@/lib/queries`, and `parseBuyOptionsForm`, `buyOptionsEqual`, `optionsToDrafts` from `@/lib/buy-options`.

```ts
export async function submitBuyOptionsEdit(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const note = readNote(formData);

  const session = await requireUser(`/contribute/edit-tabs?type=item&slug=${slug}`);
  await assertUnderQuota(session.steamId);

  const loaded = await getBuyOptionsForEdit(slug);
  if (!loaded) throw new Error("Item not found.");

  const parsed = parseBuyOptionsForm({
    optGroups: formData.getAll("optGroup").map(String),
    optYields: formData.getAll("optYield").map(String),
    optUnlockSlugs: formData.getAll("optUnlockSlug").map(String),
    costGroups: formData.getAll("costGroup").map(String),
    costSlugs: formData.getAll("costSlug").map(String),
    costAmounts: formData.getAll("costAmount").map(String),
  });
  if (parsed.error) throw new Error(parsed.error);

  const oldDrafts = optionsToDrafts(loaded.options);
  if (buyOptionsEqual(oldDrafts, parsed.options)) throw new Error("No changes to submit.");

  await prisma.proposal.create({
    data: {
      kind: "buy_options_edit",
      targetType: "item",
      targetSlug: slug,
      changes: { old: oldDrafts, new: parsed.options } as object,
      note,
      proposerId: session.steamId,
    },
  });

  redirect(`/items/${slug}?proposed=1`);
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run lint`
Expected: no errors in `actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/contribute/actions.ts
git commit -m "feat(buy): submitBuyOptionsEdit server action"
```

---

### Task 11: `applyBuyOptionsProposal` apply function

**Files:**
- Modify: `src/lib/proposal-apply.ts`

Full-replaces the item's `buy-cost`/`buy-yield`/`buy-unlock` rows from `change.new`, assigning `buyGroup` by option index. Resolves cost slugs to items and each unlock slug to a tech-node; sets `lootCurated = true`.

- [ ] **Step 1: Add the apply function**

In `src/lib/proposal-apply.ts`, add (import `BuyOptionsChange` from `./buy-options`):

```ts
/** Apply an approved buy_options_edit proposal: full-replace the item's buy-cost,
 *  buy-yield and buy-unlock rows from the new option list. Each option's rows share a
 *  buyGroup (its index). Cost targets resolve to items; the yield row is a self-row
 *  (target = the item); the optional unlock resolves to a tech-node. Marks the item
 *  lootCurated so a reseed won't clobber the edit. */
export async function applyBuyOptionsProposal(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "buy_options_edit" || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending buy-options edit.");
    }
    const change = p.changes as unknown as BuyOptionsChange;

    const item = await tx.entity.findUnique({ where: { slug: p.targetSlug }, select: { id: true, name: true, kind: true } });
    if (!item || item.kind !== "item") throw new Error("Item not found.");

    // Resolve all referenced entities before any write.
    const costSlugs = [...new Set(change.new.flatMap((o) => o.costs.map((c) => c.targetSlug)))];
    const unlockSlugs = [...new Set(change.new.map((o) => o.unlockSlug).filter((s): s is string => !!s))];
    const costEnts = await tx.entity.findMany({ where: { slug: { in: costSlugs } }, select: { id: true, slug: true, name: true } });
    const costBySlug = new Map(costEnts.map((e) => [e.slug, e]));
    const techEnts = await tx.entity.findMany({ where: { slug: { in: unlockSlugs }, kind: "tech-node" }, select: { id: true, slug: true, name: true } });
    const techBySlug = new Map(techEnts.map((e) => [e.slug, e]));

    const rows: {
      sourceId: string; targetId: string | null; role: string; name: string;
      amount: number | null; sortOrder: number; buyGroup: number;
    }[] = [];
    change.new.forEach((o, group) => {
      let sortOrder = 0;
      for (const c of o.costs) {
        const tgt = costBySlug.get(c.targetSlug);
        if (!tgt) throw new Error(`Cannot resolve cost item ${c.targetSlug}`);
        rows.push({ sourceId: item.id, targetId: tgt.id, role: "buy-cost", name: tgt.name, amount: c.amount, sortOrder: sortOrder++, buyGroup: group });
      }
      rows.push({ sourceId: item.id, targetId: item.id, role: "buy-yield", name: item.name, amount: o.yield, sortOrder: sortOrder++, buyGroup: group });
      if (o.unlockSlug) {
        const tech = techBySlug.get(o.unlockSlug);
        if (!tech) throw new Error(`Cannot resolve tech node ${o.unlockSlug}`);
        rows.push({ sourceId: item.id, targetId: tech.id, role: "buy-unlock", name: tech.name, amount: null, sortOrder: sortOrder++, buyGroup: group });
      }
    });

    await tx.entityLink.deleteMany({ where: { sourceId: item.id, role: { in: ["buy-cost", "buy-yield", "buy-unlock"] } } });
    if (rows.length) await tx.entityLink.createMany({ data: rows });
    await tx.entity.update({ where: { id: item.id }, data: { lootCurated: true } });

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/proposal-apply.ts
git commit -m "feat(buy): applyBuyOptionsProposal full-replace apply"
```

---

### Task 12: Wire the new kind into review dispatch + admin UI

**Files:**
- Modify: `src/app/admin/proposals/actions.ts:6,14-25`
- Modify: `src/app/admin/proposals/page.tsx:38-49` (list label)
- Modify: `src/app/admin/proposals/[id]/page.tsx` (diff rendering)
- Modify: `src/lib/queries.ts:415` (slug resolution comment/branch if kind-gated)

- [ ] **Step 1: Dispatch apply by kind**

In `src/app/admin/proposals/actions.ts`, add the import and a branch:

```ts
import { applyProposal, applyRecipeProposal, applyLinksProposal, applyItemLootProposal, applyBuyOptionsProposal, applyRecipeNew, applyRecipeDelete } from "@/lib/proposal-apply";
```

In the kind dispatch chain (after the `loot_sources_edit` branch, ~line 21):

```ts
  } else if (p.kind === "buy_options_edit") {
    await applyBuyOptionsProposal(id, session.steamId);
```

- [ ] **Step 2: Label the kind in the proposals list**

In `src/app/admin/proposals/page.tsx`, extend the `p.kind === ...` ternary chain (lines 38-49) to add a label for `buy_options_edit`, e.g.:

```tsx
                        : p.kind === "buy_options_edit"
                          ? "Buy options"
```

Insert it consistently within the existing nested ternary (match the surrounding indentation/structure).

- [ ] **Step 3: Render the diff on the proposal detail page**

In `src/app/admin/proposals/[id]/page.tsx`, add a branch that renders a `buy_options_edit` proposal's `changes` (shape `{ old: BuyOptionDraft[], new: BuyOptionDraft[] }`). Render old vs new as two readable lists — each option as "N× <yield item> for <amount> <cost slug> + … [unlocked by <tech slug>]". Minimal implementation:

```tsx
  if (p.kind === "buy_options_edit" && p.changes) {
    const c = p.changes as unknown as import("@/lib/buy-options").BuyOptionsChange;
    const fmt = (o: import("@/lib/buy-options").BuyOptionDraft) =>
      `${o.yield}× for ${o.costs.map((x) => `${x.amount} ${x.targetSlug}`).join(" + ")}` +
      (o.unlockSlug ? ` (unlock: ${o.unlockSlug})` : "");
    return (
      <section className="space-y-2">
        <h2 className="font-display text-sm uppercase tracking-[0.06em] text-muted-foreground">Buy options</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><div className="text-muted-foreground">Before</div><ul>{c.old.map((o, i) => <li key={i}>{fmt(o)}</li>)}</ul></div>
          <div><div className="text-muted-foreground">After</div><ul>{c.new.map((o, i) => <li key={i}>{fmt(o)}</li>)}</ul></div>
        </div>
      </section>
    );
  }
```

Place it alongside the other `p.kind === ...` branches, before the generic fallback. Match the page's existing layout/styling components if it uses a shared diff component.

- [ ] **Step 4: Ensure post-review redirect resolves the item slug**

Check `src/lib/queries.ts:415` (the comment lists "edit, links_edit, and loot_sources_edit kinds — all of which carry the entity's slug"). `buy_options_edit` also carries `targetSlug` (the item). If that function gates on a kind list, add `"buy_options_edit"`; if it just reads `targetSlug`, update the comment to mention buy options.

- [ ] **Step 5: Verify and commit**

Run: `npm run lint`
Expected: no errors.

```bash
git add src/app/admin/proposals
git commit -m "feat(buy): wire buy_options_edit into review dispatch + admin UI"
```

---

## Phase 5 — The editor

### Task 13: `BuyOptionsEditor` client component

**Files:**
- Create: `src/components/BuyOptionsEditor.tsx`

A grouped editor: a list of option blocks, each with cost rows (enriched item picker + amount), a yield input, and an optional tech-node unlock picker. Emits the flat FormData arrays `parseBuyOptionsForm` consumes. Reuses `EntitySearchBox` and `ItemIcon` like `LinkPicker` does.

- [ ] **Step 1: Implement the component**

Create `src/components/BuyOptionsEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { DirtyForm, DirtySubmit } from "@/components/DirtyForm";
import { EntitySearchBox } from "@/components/EntitySearchBox";
import { ItemIcon } from "@/components/ItemIcon";
import { submitBuyOptionsEdit } from "@/app/contribute/actions";
import type { LinkOption } from "@/lib/link-picker";
import type { BuyOptionDraft } from "@/lib/buy-options";
import { labelCls, inputCls, textareaCls, btnGhost, btnSecondary, btnSm } from "@/components/form-styles";

let nextKey = 0;
interface CostRow { key: number; targetSlug: string; name: string; icon: string | null; rarity: string | null; category: string | null; amount: number }
interface OptionRow { key: number; costs: CostRow[]; yield: number; unlockSlug: string | null; unlockName: string | null }

const optFromDraft = (d: BuyOptionDraft, items: Map<string, LinkOption>, tech: Map<string, LinkOption>): OptionRow => ({
  key: nextKey++,
  yield: d.yield,
  unlockSlug: d.unlockSlug,
  unlockName: d.unlockSlug ? tech.get(d.unlockSlug)?.name ?? d.unlockSlug : null,
  costs: d.costs.map((c) => {
    const o = items.get(c.targetSlug);
    return { key: nextKey++, targetSlug: c.targetSlug, name: o?.name ?? c.targetSlug, icon: o?.icon ?? null, rarity: o?.rarity ?? null, category: o?.category ?? null, amount: c.amount };
  }),
});

/** Grouped buy-options editor. `items` = all items (cost targets); `techNodes` =
 *  tech-node entities (unlock targets). Emits index-aligned FormData arrays:
 *  per option — optGroup/optYield/optUnlockSlug; per cost — costGroup/costSlug/costAmount. */
export function BuyOptionsEditor({
  slug, rows, items, techNodes,
}: {
  slug: string;
  rows: BuyOptionDraft[];
  items: LinkOption[];
  techNodes: LinkOption[];
}) {
  const itemBySlug = new Map(items.map((o) => [o.slug, o]));
  const techBySlug = new Map(techNodes.map((o) => [o.slug, o]));
  const [options, setOptions] = useState<OptionRow[]>(rows.map((d) => optFromDraft(d, itemBySlug, techBySlug)));

  const addOption = () => setOptions([...options, { key: nextKey++, costs: [], yield: 1, unlockSlug: null, unlockName: null }]);
  const removeOption = (oi: number) => setOptions(options.filter((_, i) => i !== oi));
  const patchOption = (oi: number, patch: Partial<OptionRow>) => setOptions(options.map((o, i) => (i === oi ? { ...o, ...patch } : o)));
  const addCost = (oi: number, opt: LinkOption) =>
    patchOption(oi, { costs: [...options[oi].costs, { key: nextKey++, targetSlug: opt.slug, name: opt.name, icon: opt.icon, rarity: opt.rarity, category: opt.category, amount: 1 }] });
  const removeCost = (oi: number, ci: number) => patchOption(oi, { costs: options[oi].costs.filter((_, i) => i !== ci) });
  const patchCost = (oi: number, ci: number, patch: Partial<CostRow>) =>
    patchOption(oi, { costs: options[oi].costs.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });

  return (
    <DirtyForm action={submitBuyOptionsEdit} className="space-y-4 max-w-2xl">
      <input type="hidden" name="slug" value={slug} />

      <div className="space-y-4">
        {options.map((o, oi) => (
          <fieldset key={o.key} className="space-y-3 border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <legend className={labelCls}>Option {oi + 1}</legend>
              <button type="button" className={`${btnGhost} ${btnSm}`} onClick={() => removeOption(oi)} aria-label="Remove option">Remove option</button>
            </div>

            {/* Per-option hidden fields */}
            <input type="hidden" name="optGroup" value={oi} />
            <input type="hidden" name="optUnlockSlug" value={o.unlockSlug ?? ""} />

            {/* Cost rows */}
            <div className="space-y-1.5">
              <span className={labelCls}>Price</span>
              {o.costs.map((c, ci) => (
                <div key={c.key} className="flex items-center gap-2 border border-border bg-card px-2 py-1.5">
                  <ItemIcon name={c.name} size="sm" decorative icon={c.icon} rarity={c.rarity} categorySlug={c.category} />
                  <input type="hidden" name="costGroup" value={oi} />
                  <input type="hidden" name="costSlug" value={c.targetSlug} />
                  <span className="min-w-0 flex-1 text-sm">{c.name}</span>
                  <input
                    name="costAmount" type="number" min={1} value={c.amount}
                    onChange={(e) => patchCost(oi, ci, { amount: Number(e.target.value) })}
                    className={`${inputCls} w-20 text-center`} aria-label="Amount"
                  />
                  <button type="button" className={`${btnGhost} ${btnSm}`} onClick={() => removeCost(oi, ci)} aria-label="Remove cost">✕</button>
                </div>
              ))}
              <EntitySearchBox items={items} excludeSlugs={o.costs.map((c) => c.targetSlug)} optionNoun="item" allowCustom={false} onSelect={(opt) => addCost(oi, opt)} />
            </div>

            {/* Yield */}
            <label className="flex items-center gap-2">
              <span className={labelCls}>You receive</span>
              <input
                name="optYield" type="number" min={1} value={o.yield}
                onChange={(e) => patchOption(oi, { yield: Number(e.target.value) })}
                className={`${inputCls} w-20 text-center`} aria-label="Yield"
              />
            </label>

            {/* Unlock */}
            <div className="space-y-1.5">
              <span className={labelCls}>Unlocked by (optional)</span>
              {o.unlockSlug ? (
                <div className="flex items-center gap-2 border border-border bg-card px-2 py-1.5">
                  <span className="min-w-0 flex-1 text-sm">{o.unlockName}</span>
                  <button type="button" className={`${btnGhost} ${btnSm}`} onClick={() => patchOption(oi, { unlockSlug: null, unlockName: null })} aria-label="Clear unlock">✕</button>
                </div>
              ) : (
                <EntitySearchBox items={techNodes} excludeSlugs={[]} optionNoun="tech node" allowCustom={false} onSelect={(opt) => patchOption(oi, { unlockSlug: opt.slug, unlockName: opt.name })} />
              )}
            </div>
          </fieldset>
        ))}
      </div>

      <button type="button" className={`${btnSecondary} ${btnSm}`} onClick={addOption}>+ Add buy option</button>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Note / source (optional)</span>
        <textarea name="note" className={textareaCls} rows={2} placeholder="Where did you confirm this?" />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <DirtySubmit>Submit buy options change</DirtySubmit>
      </div>
    </DirtyForm>
  );
}
```

> Check `LinkOption` (in `src/lib/link-picker.ts`) for its exact fields (`slug`, `name`, `icon`, `rarity`, `category`). If `category` isn't present, drop the `categorySlug` prop on `ItemIcon` for cost rows (it's decorative).

- [ ] **Step 2: Verify it type-checks**

Run: `npm run lint`
Expected: no errors in `BuyOptionsEditor.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/BuyOptionsEditor.tsx
git commit -m "feat(buy): grouped BuyOptionsEditor client component"
```

---

### Task 14: Mount the editor on the edit-tabs page (items)

**Files:**
- Modify: `src/app/contribute/edit-tabs/page.tsx`

- [ ] **Step 1: Load editor data and render the section**

In `src/app/contribute/edit-tabs/page.tsx`:

1. Add imports:
```tsx
import { getBuyOptionsForEdit } from "@/lib/queries";
import { optionsToDrafts } from "@/lib/buy-options";
import { BuyOptionsEditor } from "@/components/BuyOptionsEditor";
```

2. After the `isItem` line (58), load data:
```tsx
  const buyData = isItem ? await getBuyOptionsForEdit(slug) : null;
  const techNodes = isItem
    ? await prisma.entity.findMany({
        where: { kind: "tech-node" },
        select: { slug: true, name: true, rarity: true, icon: true, category: true },
        orderBy: { name: "asc" },
      })
    : [];
```

3. Add a "Buy options" `<section>` (place it before the "Found in" section, ~line 88):
```tsx
      {isItem && buyData && (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">Buy options</h2>
          <p className="text-sm text-muted-foreground">How this item can be purchased — each option is a price bundle (any items), a yield, and an optional tech-tree unlock.</p>
          <BuyOptionsEditor
            slug={slug}
            rows={optionsToDrafts(buyData.options)}
            items={items.length ? items : await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true, rarity: true, icon: true, category: true }, orderBy: { name: "asc" } })}
            techNodes={techNodes}
          />
        </section>
      )}
```

> `items` is only populated when `roles.length` (line 46); for item targets `roles` is empty, so fetch the item catalog for the picker. Simplify by hoisting the item-catalog fetch so both the loot editor and the buy editor share one `items` list — define `const itemCatalog = isItem ? await prisma.entity.findMany({ where: { kind: "item" }, select: { slug:true, name:true, rarity:true, icon:true, category:true }, orderBy:{ name:"asc" } }) : items;` once and pass `itemCatalog` to both editors. Prefer that over the inline fetch above.

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, open `/contribute/edit-tabs?type=item&slug=<an-item-with-buy-options>` (signed in).
Expected: a "Buy options" section showing existing options with editable price rows, yield, and unlock; "+ Add buy option" works; the tech-node picker only lists tech nodes; submitting redirects to the item page with `?proposed=1`.

- [ ] **Step 3: Commit**

```bash
git add src/app/contribute/edit-tabs/page.tsx
git commit -m "feat(buy): mount BuyOptionsEditor on item edit-tabs page"
```

---

## Phase 6 — Rendering + cleanup

### Task 15: Remove derived Buyable/Sellable, add the Buy tab

**Files:**
- Modify: `src/lib/item-view.ts`
- Test: `src/lib/item-view.test.ts`
- Modify: `src/lib/trades.ts`
- Test: `src/lib/trades.test.ts`

- [ ] **Step 1: Update item-view tests**

In `src/lib/item-view.test.ts`:
- In the `itemDetailRows` tests, remove the assertions expecting a **Buyable** row (and any **Sellable** row). Keep the **Value** row assertion. Add/keep a case asserting **no** Buyable/Sellable rows even when `trades.buy`/`trades.sell` would have had data.
- In the `availableTabs` test, add a case: when buy options exist (a new `hasBuyOptions` input — see Step 3), the first tab is `{ id: "buy", label: "Buy" }`; when none, no Buy tab.

```ts
it("adds a Buy tab first when the item has buy options", () => {
  const tabs = availableTabs({ crafts: [], usedInCrafts: [], buy: [], sell: [] } as any, true);
  expect(tabs[0]).toEqual({ id: "buy", label: "Buy" });
});
it("omits the Buy tab when there are no buy options", () => {
  const tabs = availableTabs({ crafts: [], usedInCrafts: [], buy: [], sell: [] } as any, false);
  expect(tabs.find((t) => t.id === "buy")).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/item-view.test.ts`
Expected: FAIL — `availableTabs` doesn't accept a second arg / Buyable row still present.

- [ ] **Step 3: Update `item-view.ts`**

In `src/lib/item-view.ts`:
- In `itemDetailRows`, delete the `if (trades.buy.length > 0) { … Buyable … }` block (lines 25-28). Keep the `Value` row. (No Sellable row exists today; ensure none is added.)
- Change `TabId` to add `"buy"`: `export type TabId = "buy" | "crafted-by" | "used-in" | "ammo" | "used-by" | "loot";`
- Change `availableTabs` to take a `hasBuyOptions` flag and push Buy first:

```ts
export function availableTabs(trades: ItemTrades, hasBuyOptions: boolean): TabDef[] {
  const tabs: TabDef[] = [];
  if (hasBuyOptions) tabs.push({ id: "buy", label: "Buy" });
  if (trades.crafts.length > 0) tabs.push({ id: "crafted-by", label: "Crafted by" });
  if (trades.usedInCrafts.length > 0) tabs.push({ id: "used-in", label: "Used in" });
  return tabs;
}
```

- [ ] **Step 4: Update trades.ts + its test (remove buy/sell)**

In `src/lib/trades.ts`:
- Remove the `buy` and `sell` fields from `ItemTrades` and the `TradeOption` plumbing **only if** nothing else consumes them. Safer minimal change: keep `ItemTrades` shape but make `classifyTrades` return `buy: []`, `sell: []` and stop classifying coin trades — i.e. `crafts` = all `craftedBy`, `usedInCrafts` = all `usedIn`. Since coin recipes are now deleted from the DB, there are no coin trades to misclassify. Simplest correct implementation:

```ts
export function classifyTrades(
  _itemSlug: string,
  craftedBy: RecipeCard[],
  usedIn: RecipeCard[],
): ItemTrades {
  return { buy: [], sell: [], crafts: craftedBy, usedInCrafts: usedIn };
}
```

Keep `formatCrowns`. Remove `withBest`, `isCurrencyTrade`, `amountOf`, `hasItem`, and the `CURRENCY_SLUG` re-use here **only if** they become unused (eslint will flag them) — but note `CURRENCY_SLUG` is imported by `migrate-coin-trades-to-buy.ts` and `seed.ts`, so keep the `export const CURRENCY_SLUG`.

In `src/lib/trades.test.ts`: remove tests asserting buy/sell classification of coin recipes; keep a test asserting `crafts`/`usedInCrafts` pass through unchanged, and the `formatCrowns` test.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/item-view.test.ts src/lib/trades.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/item-view.ts src/lib/item-view.test.ts src/lib/trades.ts src/lib/trades.test.ts
git commit -m "feat(buy): drop derived Buyable/Sellable; add Buy tab to availableTabs"
```

---

### Task 16: `BuyOptions` render component

**Files:**
- Create: `src/components/BuyOptions.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/BuyOptions.tsx`:

```tsx
import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";
import { formatCrowns, CURRENCY_SLUG } from "@/lib/trades";
import type { BuyOptionView } from "@/lib/buy-options";

/** Renders an item's buy options as a card list. Each card: the price components
 *  (icon + amount, joined with +), the yield ("You receive: N×"), and an optional
 *  "Unlocked by" chip linking to the tech page. */
export function BuyOptions({ options, itemName }: { options: BuyOptionView[]; itemName: string }) {
  if (options.length === 0) return null;
  return (
    <ul className="space-y-3">
      {options.map((o) => (
        <li key={o.group} className="border border-border bg-card p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Option {o.group + 1}</div>
          <div className="flex flex-wrap items-center gap-2">
            {o.costs.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 border border-border bg-background px-2 py-1 text-sm">
                {c.slug === CURRENCY_SLUG
                  ? <span>{formatCrowns(c.amount)} &#9826;</span>
                  : <><ItemIcon name={c.name} size="sm" decorative icon={c.icon} rarity={c.rarity} /> <span>{c.amount}× {c.name}</span></>}
                {i < o.costs.length - 1 && <span className="ml-1 text-muted-foreground">+</span>}
              </span>
            ))}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">You receive: {o.yield}× {itemName}</div>
          {o.unlock && (
            <Link href={`/tech?select=${o.unlock.slug}`} className="mt-2 inline-flex items-center gap-1.5 border border-dashed border-primary/50 px-2 py-1 text-xs text-primary">
              Unlocked by: {o.unlock.name}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
```

> The crown glyph `&#9826;` matches the existing `coin`-row convention in `item-view.ts`. If the app has a dedicated coin sprite component (e.g. `CoinIcon`), use it instead for consistency.

- [ ] **Step 2: Verify it type-checks**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BuyOptions.tsx
git commit -m "feat(buy): BuyOptions render component (card list)"
```

---

### Task 17: Wire the Buy tab into the item detail page

**Files:**
- Modify: `src/app/items/[slug]/page.tsx`

- [ ] **Step 1: Load buy options and render the tab**

In `src/app/items/[slug]/page.tsx`:

1. Import:
```tsx
import { getBuyOptions } from "@/lib/queries";
import { BuyOptions } from "@/components/BuyOptions";
```

2. Fetch options alongside the existing data (add to the `Promise.all` or as a sibling `await`):
```tsx
  const buyOptions = await getBuyOptions(slug);
```

3. Update the `availableTabs(...)` call to pass the new flag:
```tsx
  const tabs = availableTabs(trades, buyOptions.length > 0);
```

4. Add the Buy tab content to the `tabContent` map (keyed by `TabId`):
```tsx
    buy: <BuyOptions options={buyOptions} itemName={item.name} />,
```
(Match the existing `tabContent` structure — it maps each `TabId` to a node.)

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, open an item with buy options (e.g. one converted from a coin recipe).
Expected: a "Buy" tab appears first; clicking it shows option cards with price + yield; the Details panel no longer shows Buyable/Sellable; Value remains. Items with no buy options show no Buy tab.

- [ ] **Step 3: Commit**

```bash
git add src/app/items/[slug]/page.tsx
git commit -m "feat(buy): render Buy tab on the item detail page"
```

---

## Phase 7 — Tech-node reverse link (optional, additive)

### Task 18: "Unlocks purchase of" on the tech-node page

**Files:**
- Modify: `src/lib/queries.ts` (add `getBuyUnlockedItems`)
- Modify: the tech-node detail page (find via `getTechNodeBySlug` / the `/tech` node panel)

- [ ] **Step 1: Add the reverse query**

In `src/lib/queries.ts`:

```ts
/** Items whose purchase a given tech node unlocks (reverse of buy-unlock). */
export async function getBuyUnlockedItems(techSlug: string) {
  const node = await prisma.entity.findUnique({
    where: { slug: techSlug },
    select: {
      incomingLinks: {
        where: { role: "buy-unlock" },
        select: { source: { select: { slug: true, name: true, icon: true, kind: true } } },
      },
    },
  });
  if (!node) return [];
  // Dedup by source slug (an item may have several options unlocked by the same node).
  const seen = new Set<string>();
  return node.incomingLinks
    .map((l) => l.source)
    .filter((s) => s.kind === "item" && !seen.has(s.slug) && seen.add(s.slug));
}
```

- [ ] **Step 2: Render the list on the tech-node view**

Locate where a single tech node is rendered (search for the node detail/panel in `src/app/tech/` or wherever `getTechNodeBySlug` is consumed). Add a "Unlocks purchase of" section listing the returned items as links to `/items/<slug>` with their `ItemIcon`. Match the page's existing section styling.

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm run dev`, open a tech node that gates a purchase.
Expected: an "Unlocks purchase of" list linking to the item(s).

```bash
git add src/lib/queries.ts src/app/tech
git commit -m "feat(buy): tech-node 'unlocks purchase of' reverse links"
```

---

## Phase 8 — Final verification

### Task 19: Full test + lint + manual smoke

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: End-to-end smoke (dev DB)**

1. Open an item, confirm the Buy tab + cards render and Details has no Buyable/Sellable.
2. Edit its buy options (add an option with two cost items + a tech unlock + yield 3), submit.
3. As admin, review the proposal at `/admin/proposals`, confirm the before/after diff, approve.
4. Reload the item — the new option appears; the tech-node page shows "Unlocks purchase of".
5. Re-run `npm run db:seed` (dev only) — confirm the item's buy options are NOT clobbered (lootCurated guard) and the seed prints its buy-conversion summary.

- [ ] **Step 5: Commit any fixes, then finish the branch**

Use `superpowers:finishing-a-development-branch` to merge/PR `feat/buy-options`.

---

## Self-review notes (coverage map)

- Spec "data model (buyGroup + 3 roles)" → Tasks 1-3.
- Spec "one-time migration, idempotent, buy converts / sell deletes" → Tasks 4-6.
- Spec "seed reproduces, buy-cost/yield seed-managed + protected, buy-unlock fresh" → Task 7 (lootCurated guard; buy-unlock never written by seed).
- Spec "grouped editor, enriched picker, cost=any item, unlock=tech-node only, one combined section" → Tasks 13-14.
- Spec "buy_options_edit proposal, admin-reviewed, atomic replace" → Tasks 8, 10, 11, 12.
- Spec "Buy tab layout B, card per option, price/yield/unlock chip → /tech?select=" → Tasks 15-17.
- Spec "remove classifyTrades buy+sell, drop Buyable/Sellable rows, keep Value" → Task 15.
- Spec "tech-node reverse link (optional)" → Task 18.
- Spec "Files touched" list → all covered across the tasks above.
