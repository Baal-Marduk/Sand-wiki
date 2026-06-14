# Tech Tree Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `/tech` route with an interactive Tech Tree screen (95 nodes, 3 factions × 4 tiers) faithful to `design/tech-tree.html`, with hover cost detail, click-to-plan path costing, and localStorage unlock progress.

**Architecture:** Server component queries Prisma (`getTechTree()`) and passes a serialized graph to a `"use client"` `TechTreeView`. Pure, unit-tested libs do the data transform (`transform.ts`) and layout/graph math (`layout.ts`); the component is a 1:1 React port of the approved mockup's JS, reading the precomputed layout.

**Tech Stack:** Next.js 16 (App Router), Prisma 6, React client component, Vitest. Design tokens in `src/app/globals.css`. Design reference in `sand-wiki/design/`.

---

## Background facts (verified against the live DB — do not re-derive)

- Roles on tech-node `EntityLink`s: `tech-prereq` (82), `tech-unlock-cost` (333), `tech-unlocks` (121).
- **Every** cost link has a resolved `target` entity with an `icon` (0 unresolved). Crowns target: slug `coin-crown`, icon `/icons/icon_item_coinCrown.png`. Icons are absolute paths (`/icons/...`).
- Tech-node entities have `icon: null` → node glyph comes from the **first unlock's** `target.icon`.
- Slug format: `tech-<faction>-t<tier><letter>-<kebab>` (e.g. `tech-godlewski-t1a-energy-rod`). Letter = the `[a-z]` right after `t<tier>`.
- Exactly one cross-faction prereq exists: kaiser `3b` "Great Chassis" → `"III(a) Great Chassis"` resolves (via the seed's fallback) to a **godlewski** node. The transform drops prereqs whose target faction ≠ source faction; that node keeps its valid `II(b) Middling Chassis` edge.
- Faction accents (from the in-game tree): godlewski `#4493f8`, kaiser `#e3a008`, landwehr `#6fb24a`. Display names: "Godlewski's Expedition", "Kaiser's Friends", "K.K. Landwehr".

## File Structure

- Create `src/lib/tech-tree/types.ts` — shared serialized types.
- Create `src/lib/tech-tree/transform.ts` — `toTechTree(rows)`: pure rows→`TechTree` mapper.
- Create `src/lib/tech-tree/transform.test.ts` — unit tests.
- Create `src/lib/tech-tree/layout.ts` — `computeLayout`, `ancestors`, `descendants`, `pathCost`.
- Create `src/lib/tech-tree/layout.test.ts` — unit tests.
- Modify `src/lib/queries.ts` — add `getTechTree()` (Prisma query + `toTechTree`).
- Create `src/components/tech-tree/tech-tree.css` — ported styles.
- Create `src/components/tech-tree/TechTreeView.tsx` — `"use client"` component.
- Modify `src/app/tech/page.tsx` — server page rendering `TechTreeView`.

---

## Task 1: Serialized types + transform

**Files:**
- Create: `src/lib/tech-tree/types.ts`
- Create: `src/lib/tech-tree/transform.ts`
- Test: `src/lib/tech-tree/transform.test.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
// Serialized, client-safe tech-tree graph (no Prisma types leak to the client).
export interface TechCost {
  name: string;
  amount: number;
  icon: string | null;
}

export interface TechUnlock {
  name: string;
  slug: string | null;
  icon: string | null;
}

export interface TechNode {
  slug: string;
  name: string;
  faction: string; // "godlewski" | "kaiser" | "landwehr"
  tier: number; // 1-4
  letter: string; // a-d (sub-column)
  crowns: number; // Crowns cost shown on the card (0 if none)
  costs: TechCost[]; // all resources (tooltip + planner); Crowns first
  unlocks: TechUnlock[];
  glyphIcon: string | null; // first unlock's icon
  prereqs: string[]; // same-faction prerequisite node slugs
}

export interface TechFaction {
  id: string;
  name: string;
  accent: string;
}

export interface TechTree {
  nodes: TechNode[];
  factions: TechFaction[];
  defaultUnlocked: string[]; // slugs of prereq-less (free) nodes
}

// Shape returned by the Prisma query, consumed by toTechTree().
export interface RawTechLinkTarget {
  slug: string;
  name: string;
  icon: string | null;
  techNodeStats: { faction: string } | null;
}
export interface RawTechLink {
  role: string;
  name: string;
  amount: number | null;
  sortOrder: number;
  target: RawTechLinkTarget | null;
}
export interface RawTechRow {
  slug: string;
  name: string;
  techNodeStats: { faction: string; tier: number; sortOrder: number | null } | null;
  outgoingLinks: RawTechLink[];
}
```

- [ ] **Step 2: Write the failing test `transform.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { toTechTree, parseLetter } from "./transform";
import type { RawTechRow } from "./types";

function row(over: Partial<RawTechRow> & { slug: string; faction: string; tier: number }): RawTechRow {
  return {
    slug: over.slug,
    name: over.name ?? over.slug,
    techNodeStats: { faction: over.faction, tier: over.tier, sortOrder: null },
    outgoingLinks: over.outgoingLinks ?? [],
  };
}

describe("parseLetter", () => {
  it("extracts the sub-column letter from a tech slug", () => {
    expect(parseLetter("tech-godlewski-t1a-energy-rod")).toBe("a");
    expect(parseLetter("tech-kaiser-t3b-great-chassis")).toBe("b");
  });
  it("returns 'a' when the slug has no parseable letter", () => {
    expect(parseLetter("weird-slug")).toBe("a");
  });
});

describe("toTechTree", () => {
  it("maps crowns, costs (with icons), unlocks, glyph and prereqs", () => {
    const rows: RawTechRow[] = [
      row({
        slug: "tech-godlewski-t1a-energy-rod", faction: "godlewski", tier: 1, name: "Energy Rod",
        outgoingLinks: [
          { role: "tech-unlock-cost", name: "Crowns", amount: 1500, sortOrder: 0,
            target: { slug: "coin-crown", name: "Crowns", icon: "/icons/coin.png", techNodeStats: null } },
          { role: "tech-unlock-cost", name: "Weird Coral", amount: 15, sortOrder: 1,
            target: { slug: "weird-coral", name: "Weird Coral", icon: "/icons/coral.png", techNodeStats: null } },
          { role: "tech-unlocks", name: "NZ Mk2 Energy Rod", amount: null, sortOrder: 0,
            target: { slug: "nz-mk2-energy-rod", name: "NZ Mk2 Energy Rod", icon: "/icons/rod.png", techNodeStats: null } },
        ],
      }),
    ];
    const tree = toTechTree(rows);
    const n = tree.nodes[0];
    expect(n.letter).toBe("a");
    expect(n.crowns).toBe(1500);
    expect(n.costs).toEqual([
      { name: "Crowns", amount: 1500, icon: "/icons/coin.png" },
      { name: "Weird Coral", amount: 15, icon: "/icons/coral.png" },
    ]);
    expect(n.glyphIcon).toBe("/icons/rod.png");
    expect(n.unlocks[0]).toEqual({ name: "NZ Mk2 Energy Rod", slug: "nz-mk2-energy-rod", icon: "/icons/rod.png" });
    expect(n.prereqs).toEqual([]);
    expect(tree.defaultUnlocked).toContain("tech-godlewski-t1a-energy-rod");
  });

  it("keeps same-faction prereqs and drops cross-faction ones", () => {
    const rows: RawTechRow[] = [
      row({ slug: "tech-kaiser-t2b-middling-chassis", faction: "kaiser", tier: 2, name: "Middling Chassis" }),
      row({
        slug: "tech-kaiser-t3b-great-chassis", faction: "kaiser", tier: 3, name: "Great Chassis",
        outgoingLinks: [
          { role: "tech-prereq", name: "II(b) Middling Chassis", amount: null, sortOrder: 0,
            target: { slug: "tech-kaiser-t2b-middling-chassis", name: "Middling Chassis", icon: null, techNodeStats: { faction: "kaiser" } } },
          { role: "tech-prereq", name: "III(a) Great Chassis", amount: null, sortOrder: 1,
            target: { slug: "tech-godlewski-t3a-great-chassis", name: "Great Chassis", icon: null, techNodeStats: { faction: "godlewski" } } },
        ],
      }),
    ];
    const tree = toTechTree(rows);
    const great = tree.nodes.find((n) => n.slug === "tech-kaiser-t3b-great-chassis")!;
    expect(great.prereqs).toEqual(["tech-kaiser-t2b-middling-chassis"]);
    expect(tree.defaultUnlocked).not.toContain("tech-kaiser-t3b-great-chassis");
  });
});
```

- [ ] **Step 3: Run the test — expect failure**

Run: `npm test -- src/lib/tech-tree/transform.test.ts`
Expected: FAIL ("Failed to resolve import './transform'").

- [ ] **Step 4: Write `transform.ts`**

```ts
import type { RawTechRow, TechTree, TechNode, TechFaction } from "./types";

const FACTIONS: TechFaction[] = [
  { id: "godlewski", name: "Godlewski's Expedition", accent: "#4493f8" },
  { id: "kaiser", name: "Kaiser's Friends", accent: "#e3a008" },
  { id: "landwehr", name: "K.K. Landwehr", accent: "#6fb24a" },
];

/** Sub-column letter from a tech slug (`tech-<fac>-t<tier><letter>-…`). Defaults to "a". */
export function parseLetter(slug: string): string {
  return slug.match(/-t\d+([a-z])-/)?.[1] ?? "a";
}

export function toTechTree(rows: RawTechRow[]): TechTree {
  const nodes: TechNode[] = rows
    .filter((r) => r.techNodeStats)
    .map((r) => {
      const faction = r.techNodeStats!.faction;
      const costLinks = r.outgoingLinks
        .filter((l) => l.role === "tech-unlock-cost")
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const unlockLinks = r.outgoingLinks
        .filter((l) => l.role === "tech-unlocks")
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const prereqs = r.outgoingLinks
        .filter((l) => l.role === "tech-prereq" && l.target?.techNodeStats?.faction === faction)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => l.target!.slug);

      const costs = costLinks.map((l) => ({ name: l.name, amount: l.amount ?? 0, icon: l.target?.icon ?? null }));
      const crowns = costs.find((c) => c.name === "Crowns")?.amount ?? 0;
      const unlocks = unlockLinks.map((l) => ({ name: l.name, slug: l.target?.slug ?? null, icon: l.target?.icon ?? null }));

      return {
        slug: r.slug,
        name: r.name,
        faction,
        tier: r.techNodeStats!.tier,
        letter: parseLetter(r.slug),
        crowns,
        costs,
        unlocks,
        glyphIcon: unlocks.find((u) => u.icon)?.icon ?? null,
        prereqs,
      };
    });

  const defaultUnlocked = nodes.filter((n) => n.prereqs.length === 0).map((n) => n.slug);
  const present = new Set(nodes.map((n) => n.faction));
  return { nodes, factions: FACTIONS.filter((f) => present.has(f.id)), defaultUnlocked };
}
```

- [ ] **Step 5: Run the test — expect pass**

Run: `npm test -- src/lib/tech-tree/transform.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tech-tree/types.ts src/lib/tech-tree/transform.ts src/lib/tech-tree/transform.test.ts
git commit -m "feat(tech): tech-tree serialized types + rows→graph transform"
```

---

## Task 2: Layout + graph helpers

**Files:**
- Create: `src/lib/tech-tree/layout.ts`
- Test: `src/lib/tech-tree/layout.test.ts`

Layout constants mirror the mockup (`design/tech-tree.js`): `CARD_W=196, CARD_H=72, COL_W=252, LANE_H=92, PAD_LEFT=240, PAD_TOP=20, BAND_GAP=56, ROOT_W=196`.

- [ ] **Step 1: Write the failing test `layout.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computeLayout, ancestors, descendants, pathCost } from "./layout";
import type { TechTree, TechNode } from "./types";

function node(p: Partial<TechNode> & { slug: string; faction: string; tier: number; letter: string }): TechNode {
  return {
    slug: p.slug, name: p.name ?? p.slug, faction: p.faction, tier: p.tier, letter: p.letter,
    crowns: p.crowns ?? 0, costs: p.costs ?? [], unlocks: p.unlocks ?? [],
    glyphIcon: p.glyphIcon ?? null, prereqs: p.prereqs ?? [],
  };
}

const tree: TechTree = {
  factions: [{ id: "godlewski", name: "G", accent: "#4493f8" }],
  defaultUnlocked: ["g1a-small"],
  nodes: [
    node({ slug: "g1a-small", faction: "godlewski", tier: 1, letter: "a", crowns: 100, costs: [{ name: "Crowns", amount: 100, icon: null }] }),
    node({ slug: "g1a-energy", faction: "godlewski", tier: 1, letter: "a", crowns: 150, costs: [{ name: "Crowns", amount: 150, icon: null }, { name: "Coral", amount: 5, icon: "/c.png" }] }),
    node({ slug: "g2a-mid", faction: "godlewski", tier: 2, letter: "a", crowns: 500, costs: [{ name: "Crowns", amount: 500, icon: null }, { name: "Coral", amount: 10, icon: "/c.png" }], prereqs: ["g1a-small"] }),
  ],
};

describe("computeLayout", () => {
  it("assigns one column per (tier,letter) and groups columns under tiers", () => {
    const L = computeLayout(tree);
    expect(L.cols["1a"]).toBe(0);
    expect(L.cols["2a"]).toBe(1);
    expect(L.tiers.map((t) => t.tier)).toEqual([1, 2]);
    expect(L.tiers[0].cols).toEqual([0]);
  });
  it("stacks same-column nodes into increasing lanes", () => {
    const L = computeLayout(tree);
    const lanes = L.positions.filter((p) => p.col === 0).map((p) => p.lane).sort();
    expect(lanes).toEqual([0, 1]);
  });
  it("creates a root edge for prereq-less nodes and prereq edges otherwise", () => {
    const L = computeLayout(tree);
    expect(L.edges.some((e) => e.from === null && e.to === "g1a-small")).toBe(true);
    expect(L.edges.some((e) => e.from === "g1a-small" && e.to === "g2a-mid")).toBe(true);
  });
});

describe("graph helpers", () => {
  it("ancestors walks the prereq chain", () => {
    expect(ancestors(tree.nodes, "g2a-mid")).toEqual(["g1a-small"]);
  });
  it("descendants walks forward", () => {
    expect(descendants(tree.nodes, "g1a-small")).toEqual(["g2a-mid"]);
  });
});

describe("pathCost", () => {
  it("sums crowns + materials for un-unlocked nodes on the path only", () => {
    const r = pathCost(tree.nodes, ["g2a-mid"], new Set(["g1a-small"]));
    // path = {g2a-mid} (g1a-small is its ancestor but already unlocked)
    expect(r.remainingCrowns).toBe(500);
    expect(r.fullCrowns).toBe(600); // 100 (ancestor) + 500
    expect(r.techsLeft).toBe(1);
    expect(r.materials).toEqual([{ name: "Coral", amount: 10, icon: "/c.png" }]);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npm test -- src/lib/tech-tree/layout.test.ts`
Expected: FAIL ("Failed to resolve import './layout'").

- [ ] **Step 3: Write `layout.ts`**

```ts
import type { TechTree, TechNode } from "./types";

export const LAYOUT = { CARD_W: 196, CARD_H: 72, COL_W: 252, LANE_H: 92, PAD_LEFT: 240, PAD_TOP: 20, BAND_GAP: 56, ROOT_W: 196 } as const;
const ROMAN = ["", "I", "II", "III", "IV"];

export interface NodePosition { slug: string; faction: string; col: number; lane: number; x: number; y: number; }
export interface TierGroup { tier: number; roman: string; label: string; cols: number[]; }
export interface BandBox { faction: string; top: number; height: number; lanes: number; }
export interface Edge { from: string | null; to: string; }
export interface Layout {
  cols: Record<string, number>; // "<tier><letter>" -> column index
  tiers: TierGroup[];
  bands: Record<string, BandBox>;
  positions: NodePosition[];
  edges: Edge[];
  canvasW: number;
  canvasH: number;
}

export function computeLayout(tree: TechTree): Layout {
  const codeOf = (n: TechNode) => `${n.tier}${n.letter}`;

  // columns: unique (tier, letter) sorted by tier then letter
  const codes = Array.from(new Set(tree.nodes.map(codeOf))).sort((a, b) => {
    const ta = parseInt(a), tb = parseInt(b);
    return ta !== tb ? ta - tb : a.slice(String(ta).length).localeCompare(b.slice(String(tb).length));
  });
  const cols: Record<string, number> = {};
  codes.forEach((c, i) => (cols[c] = i));

  // tiers group their column indices
  const tierMap = new Map<number, number[]>();
  codes.forEach((c) => {
    const t = parseInt(c);
    if (!tierMap.has(t)) tierMap.set(t, []);
    tierMap.get(t)!.push(cols[c]);
  });
  const tiers: TierGroup[] = [...tierMap.entries()].sort((a, b) => a[0] - b[0])
    .map(([tier, c]) => ({ tier, roman: ROMAN[tier] ?? String(tier), label: `Tier ${tier}`, cols: c }));

  // lanes: per faction, index within each (tier,letter) column group (ordered by slug for determinism)
  const factionOrder = tree.factions.map((f) => f.id);
  const bands: Record<string, BandBox> = {};
  const positions: NodePosition[] = [];
  let cursorY = LAYOUT.PAD_TOP;
  for (const fid of factionOrder) {
    const facNodes = tree.nodes.filter((n) => n.faction === fid);
    const laneByCol = new Map<number, number>();
    const placed: { n: TechNode; col: number; lane: number }[] = [];
    for (const n of facNodes.slice().sort((a, b) => a.slug.localeCompare(b.slug))) {
      const col = cols[codeOf(n)];
      const lane = laneByCol.get(col) ?? 0;
      laneByCol.set(col, lane + 1);
      placed.push({ n, col, lane });
    }
    const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));
    bands[fid] = { faction: fid, top: cursorY, height: lanes * LAYOUT.LANE_H, lanes };
    for (const p of placed) {
      positions.push({
        slug: p.n.slug, faction: fid, col: p.col, lane: p.lane,
        x: LAYOUT.PAD_LEFT + p.col * LAYOUT.COL_W,
        y: bands[fid].top + p.lane * LAYOUT.LANE_H,
      });
    }
    cursorY += bands[fid].height + LAYOUT.BAND_GAP;
  }

  const edges: Edge[] = [];
  for (const n of tree.nodes) {
    if (n.prereqs.length === 0) edges.push({ from: null, to: n.slug });
    else n.prereqs.forEach((p) => edges.push({ from: p, to: n.slug }));
  }

  const maxCol = codes.length - 1;
  const canvasW = LAYOUT.PAD_LEFT + maxCol * LAYOUT.COL_W + LAYOUT.CARD_W + 80;
  const canvasH = cursorY + 20;
  return { cols, tiers, bands, positions, edges, canvasW, canvasH };
}

function index(nodes: TechNode[]): Record<string, TechNode> {
  const m: Record<string, TechNode> = {};
  nodes.forEach((n) => (m[n.slug] = n));
  return m;
}

/** All transitive prerequisites of `slug`. */
export function ancestors(nodes: TechNode[], slug: string): string[] {
  const by = index(nodes);
  const out = new Set<string>();
  const stack = [...(by[slug]?.prereqs ?? [])];
  while (stack.length) {
    const r = stack.pop()!;
    if (out.has(r) || !by[r]) continue;
    out.add(r);
    by[r].prereqs.forEach((x) => stack.push(x));
  }
  return [...out];
}

/** All nodes that (transitively) require `slug`. */
export function descendants(nodes: TechNode[], slug: string): string[] {
  const out = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (out.has(n.slug)) continue;
      if (n.prereqs.includes(slug) || n.prereqs.some((r) => out.has(r))) { out.add(n.slug); changed = true; }
    }
  }
  return [...out];
}

export interface PathCost {
  pathSlugs: string[];
  remainingCrowns: number;
  fullCrowns: number;
  techsLeft: number;
  materials: { name: string; amount: number; icon: string | null }[]; // aggregated, un-unlocked only, excludes Crowns
}

/** Cost to reach all `targets` (each target + its ancestors), counting Crowns/materials
 *  only for nodes not in `unlocked`. */
export function pathCost(nodes: TechNode[], targets: string[], unlocked: Set<string>): PathCost {
  const by = index(nodes);
  const path = new Set<string>();
  for (const t of targets) {
    if (!by[t]) continue;
    path.add(t);
    ancestors(nodes, t).forEach((a) => path.add(a));
  }
  let remainingCrowns = 0, fullCrowns = 0, techsLeft = 0;
  const mat = new Map<string, { name: string; amount: number; icon: string | null }>();
  for (const slug of path) {
    const n = by[slug];
    fullCrowns += n.crowns;
    if (unlocked.has(slug)) continue;
    remainingCrowns += n.crowns;
    techsLeft++;
    for (const c of n.costs) {
      if (c.name === "Crowns") continue;
      const e = mat.get(c.name) ?? { name: c.name, amount: 0, icon: c.icon };
      e.amount += c.amount;
      mat.set(c.name, e);
    }
  }
  return { pathSlugs: [...path], remainingCrowns, fullCrowns, techsLeft, materials: [...mat.values()] };
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `npm test -- src/lib/tech-tree/layout.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tech-tree/layout.ts src/lib/tech-tree/layout.test.ts
git commit -m "feat(tech): tech-tree layout + ancestors/descendants/pathCost helpers"
```

---

## Task 3: `getTechTree()` query

**Files:**
- Modify: `src/lib/queries.ts` (append)

- [ ] **Step 1: Add imports at the top of `queries.ts`** (after the existing imports)

```ts
import { toTechTree } from "./tech-tree/transform";
import type { TechTree } from "./tech-tree/types";
```

- [ ] **Step 2: Append `getTechTree()` at the end of `queries.ts`**

```ts
/** Full tech tree: all tech-node entities with costs, unlocks and same-faction prereqs. */
export async function getTechTree(): Promise<TechTree> {
  const rows = await prisma.entity.findMany({
    where: { kind: "tech-node" },
    select: {
      slug: true,
      name: true,
      techNodeStats: { select: { faction: true, tier: true, sortOrder: true } },
      outgoingLinks: {
        where: { role: { in: ["tech-prereq", "tech-unlock-cost", "tech-unlocks"] } },
        orderBy: { sortOrder: "asc" },
        select: {
          role: true, name: true, amount: true, sortOrder: true,
          target: {
            select: { slug: true, name: true, icon: true, techNodeStats: { select: { faction: true } } },
          },
        },
      },
    },
  });
  return toTechTree(rows);
}
```

- [ ] **Step 3: Verify the query compiles and returns the expected shape**

Run:
```bash
npx tsx -e "import('./src/lib/queries.ts').then(async m => { const t = await m.getTechTree(); console.log('nodes', t.nodes.length, 'factions', t.factions.length, 'defaultUnlocked', t.defaultUnlocked.length); const k = t.nodes.find(n=>n.slug==='tech-kaiser-t3b-great-chassis'); console.log('kaiser 3b prereqs', JSON.stringify(k?.prereqs)); process.exit(0); })"
```
Expected: `nodes 95 factions 3 defaultUnlocked <N>`, and the kaiser `3b` prereqs array contains only its `tech-kaiser-t2b-…` Middling Chassis slug (no godlewski slug).

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(tech): getTechTree() Prisma query"
```

---

## Task 4: Component styles (port the mockup CSS)

**Files:**
- Create: `src/components/tech-tree/tech-tree.css`

- [ ] **Step 1: Copy the mockup styles**

Copy the **entire contents of the `<style>…</style>` block** from `design/tech-tree.html` (lines 8–162) into `src/components/tech-tree/tech-tree.css` (CSS only, without the `<style>` tags). The mockup uses the same token names as `globals.css` (`--background`, `--primary`, `--primary-hover`, `--accent`, `--border`, `--border-strong`, `--success`, `--destructive`, `--muted-foreground`, `--dim`, `--card`, `--card-elevated`, `--font-display`), so the tokens resolve unchanged.

- [ ] **Step 2: Apply these exact edits to `tech-tree.css`**

1. Add a `--font-mono` and `--font-body` fallback at the top so the file is self-sufficient if those tokens are unset:

```css
.tt-app { --font-mono: ui-monospace, "Cascadia Code", Menlo, monospace; --font-body: system-ui, -apple-system, "Segoe UI", sans-serif; }
```

2. Replace the body-level rules (the mockup set `body { overflow:hidden }` etc.) — since this is embedded in the app, **delete** the `html, body { … }` and `body { … }` rules entirely. The page wrapper supplies the background.

3. The node glyph now holds a real `<img>`. Add:

```css
.tnode-glyph img, .tt-faction-glyph img { width: 100%; height: 100%; object-fit: contain; display: block; }
.tnode-glyph { display: grid; place-items: center; }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tech-tree/tech-tree.css
git commit -m "feat(tech): port tech-tree mockup styles to a component stylesheet"
```

---

## Task 5: `TechTreeView` client component

**Files:**
- Create: `src/components/tech-tree/TechTreeView.tsx`

This ports `design/tech-tree.js` to React. Differences from the mockup, all implemented below: keys/ids are **slugs**; cost on the card is **Crowns only**; the tooltip shows the **full cost (icons + qty)**; the planner adds an **aggregated materials** list; **no faction level badge**; node/faction glyphs render **real `<img>` icons** (fallback to a `▦` glyph); layout comes from `computeLayout`.

- [ ] **Step 1: Write `TechTreeView.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./tech-tree.css";
import type { TechTree, TechNode } from "@/lib/tech-tree/types";
import { LAYOUT, computeLayout, ancestors, pathCost } from "@/lib/tech-tree/layout";

const STORE_KEY = "sand_techtree_unlocked_v1";
const fmt = (n: number) => n.toLocaleString("en-US");

function Glyph({ icon, alt }: { icon: string | null; alt: string }) {
  return icon ? <img src={icon} alt="" aria-hidden /> : <span aria-label={alt}>▦</span>;
}

export function TechTreeView({ tree }: { tree: TechTree }) {
  const layout = useMemo(() => computeLayout(tree), [tree]);
  const byId = useMemo(() => Object.fromEntries(tree.nodes.map((n) => [n.slug, n])) as Record<string, TechNode>, [tree]);
  const posById = useMemo(() => Object.fromEntries(layout.positions.map((p) => [p.slug, p])), [layout]);
  const accentOf = useMemo(() => Object.fromEntries(tree.factions.map((f) => [f.id, f.accent])), [tree]);

  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ slug: string; rect: DOMRect } | null>(null);

  // load progress
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) { setUnlocked(new Set((JSON.parse(raw) as string[]).filter((s) => byId[s]))); return; }
    } catch { /* ignore */ }
    setUnlocked(new Set(tree.defaultUnlocked));
  }, [byId, tree.defaultUnlocked]);

  const persist = useCallback((s: Set<string>) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
  }, []);

  // path set = selected targets + their ancestors
  const ps = useMemo(() => {
    const set = new Set<string>();
    for (const t of selected) { set.add(t); ancestors(tree.nodes, t).forEach((a) => set.add(a)); }
    return set;
  }, [selected, tree.nodes]);
  const hasSel = selected.size > 0;

  const toggleUnlocked = useCallback((slug: string) => {
    setUnlocked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
        // cascade: iteratively remove any node whose prereq is no longer unlocked
        let changed = true;
        while (changed) { changed = false; for (const n of tree.nodes) { if (next.has(n.slug) && n.prereqs.some((r) => !next.has(r))) { next.delete(n.slug); changed = true; } } }
      } else {
        next.add(slug);
        ancestors(tree.nodes, slug).forEach((a) => next.add(a));
      }
      persist(next);
      return next;
    });
  }, [tree.nodes, persist]);

  const toggleSelected = useCallback((slug: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  }, []);

  const cost = useMemo(() => pathCost(tree.nodes, [...selected], unlocked), [tree.nodes, selected, unlocked]);

  return (
    <div className="tt-app">
      <header className="tt-appbar">
        <div className="tt-brand"><span className="tt-brand-mark">S</span><span className="tt-brand-name">SAND<span className="sub">·</span>WIKI</span></div>
        <span className="tt-page-title">Tech Tree</span>
        <div className="tt-toolbar">
          <span className="tt-progress">{unlocked.size} / {tree.nodes.length} unlocked</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear selection</button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            if (!confirm("Reset your unlocked progress to the starting techs?")) return;
            const d = new Set(tree.defaultUnlocked); setUnlocked(d); persist(d);
          }}>Reset progress</button>
        </div>
      </header>

      <div className="tt-legend">
        <span className="tt-legend-item"><span className="tt-legend-sw" style={{ borderColor: "var(--border-strong)" }} />Locked</span>
        <span className="tt-legend-item"><span className="tt-legend-sw" style={{ borderColor: "var(--success)", background: "color-mix(in srgb,var(--success) 14%,transparent)" }} />Unlocked</span>
        <span className="tt-legend-item"><span className="tt-legend-sw" style={{ borderColor: "var(--primary)", boxShadow: "0 0 0 1px var(--primary)" }} />On selected path</span>
        <span className="hint">Click a tech to plan its path · click the ring to mark it already unlocked · select several to combine</span>
      </div>

      <div className="tt-viewport">
        <div id="tt-tierbar" style={{ width: layout.canvasW }}>
          {layout.tiers.map((t) => {
            const first = t.cols[0], last = t.cols[t.cols.length - 1];
            const left = LAYOUT.PAD_LEFT + first * LAYOUT.COL_W - 24;
            const right = LAYOUT.PAD_LEFT + last * LAYOUT.COL_W + LAYOUT.CARD_W + 24;
            return (
              <div key={t.tier} className="tt-tier-label" style={{ left, width: right - left }}>
                <span className="tt-tier-roman">{t.roman}</span>{t.label}
              </div>
            );
          })}
        </div>

        <div id="tt-canvas" style={{ position: "relative", width: layout.canvasW, height: layout.canvasH }}>
          <svg id="tt-svg" width={layout.canvasW} height={layout.canvasH} viewBox={`0 0 ${layout.canvasW} ${layout.canvasH}`} xmlns="http://www.w3.org/2000/svg">
            {layout.edges.map((e, i) => {
              const to = posById[e.to]; if (!to) return null;
              let x1: number, y1: number;
              if (e.from === null) {
                const b = layout.bands[byId[e.to].faction];
                x1 = 8 + LAYOUT.ROOT_W; y1 = b.top + b.height / 2;
              } else {
                const from = posById[e.from]; if (!from) return null;
                x1 = from.x + LAYOUT.CARD_W; y1 = from.y + LAYOUT.CARD_H / 2;
              }
              const x2 = to.x, y2 = to.y + LAYOUT.CARD_H / 2;
              const midX = x1 + Math.max(18, (x2 - x1) / 2);
              const active = hasSel && ps.has(e.to) && (e.from === null || ps.has(e.from));
              const done = unlocked.has(e.to) && (e.from === null || unlocked.has(e.from));
              const cls = "tt-edge" + (done ? " done" : active ? " active" : "");
              return <path key={i} className={cls} d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`} />;
            })}
          </svg>

          {tree.factions.map((f) => {
            const b = layout.bands[f.id];
            return (
              <div key={f.id}>
                <div className="tt-band" style={{ ["--fac" as string]: f.accent, top: b.top - 18, height: b.height + 12, width: layout.canvasW }} />
                <div className="tt-faction" style={{ ["--fac" as string]: f.accent, left: 8, top: b.top + b.height / 2 - 33, width: LAYOUT.ROOT_W }}>
                  <span className="tt-faction-glyph glyph"><Glyph icon={null} alt={f.name} /></span>
                  <div className="tt-faction-meta"><span className="tt-faction-name">{f.name}</span><span className="tt-faction-sub">Faction line</span></div>
                </div>
              </div>
            );
          })}

          {tree.nodes.map((n) => {
            const p = posById[n.slug]; if (!p) return null;
            const cls = ["tnode",
              unlocked.has(n.slug) ? "is-unlocked" : "",
              selected.has(n.slug) ? "is-selected" : "",
              hasSel && ps.has(n.slug) && !selected.has(n.slug) ? "in-path" : "",
              hasSel && !ps.has(n.slug) ? "dimmed" : "",
            ].filter(Boolean).join(" ");
            return (
              <div key={n.slug} className={cls}
                   style={{ ["--fac" as string]: accentOf[n.faction], left: p.x, top: p.y, width: LAYOUT.CARD_W, height: LAYOUT.CARD_H }}
                   onClick={() => toggleSelected(n.slug)}
                   onMouseEnter={(ev) => setHover({ slug: n.slug, rect: (ev.currentTarget as HTMLElement).getBoundingClientRect() })}
                   onMouseLeave={() => setHover((h) => (h?.slug === n.slug ? null : h))}>
                <span className="tnode-rail" />
                <button className="tnode-status" aria-label="Toggle unlocked"
                        onClick={(ev) => { ev.stopPropagation(); toggleUnlocked(n.slug); }} />
                <div className="tnode-main">
                  <div className="tnode-head"><span className="tnode-name" title={n.name}>{n.name}</span></div>
                  <div className="tnode-cost"><span className="tnode-scrap" /><span className="tnode-num">{fmt(n.crowns)}</span></div>
                </div>
                <span className="tnode-glyph glyph"><Glyph icon={n.glyphIcon} alt={n.name} /></span>
              </div>
            );
          })}
        </div>
      </div>

      {hover && <Tooltip node={byId[hover.slug]} rect={hover.rect} unlocked={unlocked} nodes={tree.nodes} />}

      <aside className="tt-summary">
        <div className="tt-summary-h"><span className="ti">Path planner</span></div>
        <div id="tt-summary-body">
          {selected.size === 0 ? (
            <div className="tt-sum-empty">Click any tech to plan a path. Its prerequisites light up and the remaining cost — counting only what you haven’t unlocked yet — shows here. Select several to combine paths. Tick the ring on a card to mark it already unlocked.</div>
          ) : (
            <>
              <div className="tt-sum-targets">
                {[...selected].map((s) => (
                  <span key={s} className="tt-chip" onClick={() => toggleSelected(s)}>{byId[s].name}<i className="tt-chip-x">×</i></span>
                ))}
              </div>
              <div className="tt-sum-figures">
                <div className="tt-fig tt-fig-main"><span className="tt-fig-label">Remaining to unlock</span><span className="tt-fig-val">{fmt(cost.remainingCrowns)}<i>crowns</i></span></div>
                <div className="tt-fig"><span className="tt-fig-label">Techs left</span><span className="tt-fig-val tt-fig-sm">{cost.techsLeft}</span></div>
                <div className="tt-fig"><span className="tt-fig-label">Full path</span><span className="tt-fig-val tt-fig-sm">{fmt(cost.fullCrowns)}</span></div>
              </div>
              {cost.materials.length > 0 && (
                <div className="tt-sum-mats">
                  <div className="tt-sum-plan-h">Materials needed</div>
                  <div className="tt-mat-grid">
                    {cost.materials.map((m) => (
                      <span key={m.name} className="tt-mat"><span className="tt-mat-ic"><Glyph icon={m.icon} alt={m.name} /></span><b>{fmt(m.amount)}</b> {m.name}</span>
                    ))}
                  </div>
                </div>
              )}
              {cost.techsLeft > 0 ? (
                <div className="tt-sum-plan">
                  <div className="tt-sum-plan-h">Build order
                    <button className="tt-mini-btn" onClick={() => { const next = new Set(unlocked); ps.forEach((id) => next.add(id)); setUnlocked(next); persist(next); }}>Mark all unlocked</button>
                  </div>
                  <ol className="tt-steps">
                    {[...ps].filter((id) => !unlocked.has(id)).sort((a, b) => layout.cols[`${byId[a].tier}${byId[a].letter}`] - layout.cols[`${byId[b].tier}${byId[b].letter}`]).map((id) => (
                      <li key={id} className="tt-step">
                        <span className="tt-step-dot" style={{ background: accentOf[byId[id].faction] }} />
                        <span className="tt-step-name">{byId[id].name}</span>
                        <span className="tt-step-cost">{fmt(byId[id].crowns)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : <div className="tt-sum-done">Every tech on this path is already unlocked.</div>}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Tooltip({ node, rect, unlocked, nodes }: { node: TechNode; rect: DOMRect; unlocked: Set<string>; nodes: TechNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  useEffect(() => {
    const tr = ref.current?.getBoundingClientRect();
    const h = tr?.height ?? 0, w = tr?.width ?? 252;
    let top = rect.top - h - 10; if (top < 8) top = rect.bottom + 10;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top, left });
  }, [rect]);
  const isUnlocked = unlocked.has(node.slug);
  const reqNames = node.prereqs.length
    ? node.prereqs.map((r) => nodes.find((n) => n.slug === r)?.name ?? r).join(", ")
    : "Faction root — no prerequisite";
  return (
    <div id="tt-tip" ref={ref} className="show" style={{ top: pos.top, left: pos.left }}>
      <div className="tt-tip-h">
        <span className="tt-tip-name">{node.name}</span>
        <span className={"tt-tip-st" + (isUnlocked ? " ok" : "")}>{isUnlocked ? "Unlocked" : "Locked"}</span>
      </div>
      <div className="tt-tip-cost">
        {node.costs.map((c) => (
          <div key={c.name} className="tt-tip-costrow">
            <span className="tt-tip-ic"><Glyph icon={c.icon} alt={c.name} /></span>
            <b>{fmt(c.amount)}</b><span>{c.name}</span>
          </div>
        ))}
      </div>
      <div className="tt-tip-row"><span>Requires</span><b>{reqNames}</b></div>
      {node.unlocks.length > 0 && <div className="tt-tip-row"><span>Unlocks</span><b>{node.unlocks.map((u) => u.name).join(", ")}</b></div>}
    </div>
  );
}
```

- [ ] **Step 2: Add the tooltip-cost and materials styles to `tech-tree.css`**

```css
.tt-tip-cost { padding: 4px 0; }
.tt-tip-costrow { display: flex; align-items: center; gap: 8px; padding: 5px 11px; font-size: 12px; border-bottom: 1px solid var(--border); }
.tt-tip-costrow .tt-tip-ic { width: 18px; height: 18px; display: grid; place-items: center; flex: none; }
.tt-tip-costrow .tt-tip-ic img { width: 100%; height: 100%; object-fit: contain; }
.tt-tip-costrow b { color: var(--primary); font-family: var(--font-mono); }
.tt-tip-costrow span:last-child { color: var(--muted-foreground); }
.tt-sum-mats { margin-bottom: 14px; }
.tt-mat-grid { display: flex; flex-wrap: wrap; gap: 6px 12px; }
.tt-mat { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 11px; color: var(--muted-foreground); }
.tt-mat-ic { width: 16px; height: 16px; display: grid; place-items: center; }
.tt-mat-ic img { width: 100%; height: 100%; object-fit: contain; }
.tt-mat b { color: var(--foreground); }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `src/components/tech-tree/` or `src/lib/tech-tree/`.

- [ ] **Step 4: Commit**

```bash
git add src/components/tech-tree/TechTreeView.tsx src/components/tech-tree/tech-tree.css
git commit -m "feat(tech): TechTreeView client component (port of mockup, Crowns card + full-cost tooltip + planner)"
```

---

## Task 6: Wire the page + manual verification

**Files:**
- Modify: `src/app/tech/page.tsx`

- [ ] **Step 1: Replace `page.tsx`**

```tsx
import { getTechTree } from "@/lib/queries";
import { TechTreeView } from "@/components/tech-tree/TechTreeView";

export const metadata = { title: "Tech Tree — SAND Wiki" };

export default async function TechPage() {
  const tree = await getTechTree();
  return <TechTreeView tree={tree} />;
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: build succeeds; `/tech` compiles as a dynamic (server-rendered) route.

- [ ] **Step 3: Manual verification (use the `run` skill)**

Start the dev server and open `/tech`. Confirm:
- 3 faction bands (Godlewski / Kaiser / Landwehr), tiers I–IV across the top, nodes positioned in their (tier,letter) columns with orthogonal connectors. No faction level numbers.
- Node cards show the Crowns number and a real unlocked-item icon glyph.
- Hover a node → tooltip lists **every** cost resource with icon + quantity, the requires list, and unlocks.
- Click a node → it + prerequisites highlight, others dim; planner shows remaining Crowns (only un-unlocked), techs-left, full-path, and an aggregated **Materials needed** list. Multi-select combines.
- Click a card's status ring → marks unlocked (green), cascades to ancestors; the Crowns number strikes through. Un-marking cascades to descendants.
- Reload → progress persists. "Reset progress" returns to the free starting techs.
- Verify the kaiser `3b` Great Chassis has a single connector from kaiser Middling Chassis (no cross-band line to godlewski).

- [ ] **Step 4: Commit**

```bash
git add src/app/tech/page.tsx
git commit -m "feat(tech): wire interactive Tech Tree page at /tech"
```

---

## Self-review notes

- **Spec coverage:** live query (T3) ✓, letter-from-slug (T1) ✓, same-faction edges (T1 + test) ✓, free roots/defaultUnlocked (T1) ✓, layout lib + tests (T2) ✓, Crowns-only card (T5) ✓, full-material tooltip (T5) ✓, planner Crowns + materials (T5) ✓, no faction level (T5) ✓, real icons/glyph (T1+T5) ✓, localStorage + cascade (T5) ✓, page wiring + manual verify (T6) ✓. Phase 2 (Steam sync) intentionally excluded.
- **Icons:** simplified vs spec — all costs resolve to entities with icons in the DB, so the component reads `target.icon` directly; no hand-map and no `Raw Aurogen Crystal` fallback path needed (the `Glyph` `▦` fallback remains as a safety net).
- **Landwehr root part slug** reconciliation (`s-h-fortified-entrance-area` vs the data's "S&H Entrance Vestibule") is a display-only detail surfaced during T6 manual verify; it does not affect node identity or edges.
