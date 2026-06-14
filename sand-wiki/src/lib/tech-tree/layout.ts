import type { TechTree, TechNode } from "./types";
import { CROWNS_NAME } from "./transform";

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
      if (c.name === CROWNS_NAME) continue;
      const e = mat.get(c.name) ?? { name: c.name, amount: 0, icon: c.icon };
      e.amount += c.amount;
      mat.set(c.name, e);
    }
  }
  return { pathSlugs: [...path], remainingCrowns, fullCrowns, techsLeft, materials: [...mat.values()] };
}
