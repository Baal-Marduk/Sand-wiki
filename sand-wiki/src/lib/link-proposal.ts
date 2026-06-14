import { linkFields } from "./entity-links";

/** A single editable EntityLink row. `targetSlug` null = unlinked (free-text name). */
export interface LinkRowDraft {
  targetSlug: string | null;
  name: string;
  amount: number | null;
  tier: string | null;
  value1: string | null;
}

/** Snapshot of one role's outgoing rows on one entity. sortOrder is positional. */
export interface LinkSnapshot {
  role: string;
  rows: LinkRowDraft[];
}

/** Stored shape of a links_edit proposal's `changes` JSON. */
export interface LinkProposalChange {
  role: string;
  old: LinkRowDraft[];
  new: LinkRowDraft[];
}

/** Select sentinel meaning "this row is an unlinked, free-text name". */
export const CUSTOM_TARGET = "__custom__";

/** A loaded EntityLink row with its target resolved to a slug. */
interface RawLink {
  target: { slug: string } | null;
  name: string;
  amount: number | null;
  tier: string | null;
  value1: string | null;
  sortOrder: number;
}

/** Flatten loaded EntityLink rows into a comparable snapshot (sorted by sortOrder). */
export function linksToSnapshot(role: string, rows: RawLink[]): LinkSnapshot {
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    role,
    rows: sorted.map((r) => ({
      targetSlug: r.target?.slug ?? null,
      name: r.name,
      amount: r.amount,
      tier: r.tier,
      value1: r.value1,
    })),
  };
}

export interface LinkFormArrays {
  slugs: string[];
  customNames: string[];
  amounts: string[];
  tiers: string[];
  value1s: string[];
}

export interface ParsedLinks {
  rows: LinkRowDraft[];
  error: string | null;
}

/** Pair index-aligned form arrays into validated rows. A blank slug drops the row.
 *  CUSTOM_TARGET → unlinked row using the paired customNames entry (name required).
 *  Which of amount/tier/value1 are read & validated is driven by the role's fields. */
export function parseLinkRows(role: string, form: LinkFormArrays, nameBySlug: Map<string, string>): ParsedLinks {
  const fields = linkFields(role);
  const usesAmount = fields.includes("amount");
  const usesTier = fields.includes("tier");
  const usesValue1 = fields.includes("value1");
  const rows: LinkRowDraft[] = [];

  for (let i = 0; i < form.slugs.length; i++) {
    const sel = (form.slugs[i] ?? "").trim();
    if (sel === "") continue;

    let targetSlug: string | null;
    let name: string;
    if (sel === CUSTOM_TARGET) {
      targetSlug = null;
      name = (form.customNames[i] ?? "").trim();
      if (name === "") return { rows: [], error: "Custom rows need a name." };
    } else {
      const resolved = nameBySlug.get(sel);
      if (!resolved) return { rows: [], error: `Unknown item: ${sel}` };
      targetSlug = sel;
      name = resolved;
    }

    let amount: number | null = null;
    if (usesAmount) {
      const a = Number((form.amounts[i] ?? "").trim());
      if (!Number.isInteger(a) || a <= 0) {
        return { rows: [], error: `Amount for ${name} must be a positive whole number.` };
      }
      amount = a;
    }
    const tier = usesTier ? ((form.tiers[i] ?? "").trim() || null) : null;
    const value1 = usesValue1 ? ((form.value1s[i] ?? "").trim() || null) : null;
    rows.push({ targetSlug, name, amount, tier, value1 });
  }
  return { rows, error: null };
}

const rowsEqual = (a: LinkRowDraft[], b: LinkRowDraft[]): boolean =>
  a.length === b.length &&
  a.every((r, i) =>
    r.targetSlug === b[i].targetSlug &&
    r.name === b[i].name &&
    r.amount === b[i].amount &&
    r.tier === b[i].tier &&
    r.value1 === b[i].value1);

/** True when two snapshots match on role and rows. Row comparison is ORDER-SENSITIVE. */
export function snapshotsEqual(a: LinkSnapshot, b: LinkSnapshot): boolean {
  return a.role === b.role && rowsEqual(a.rows, b.rows);
}

export interface LinkDiffRow {
  key: string;
  name: string;
  old: LinkRowDraft | null;
  new: LinkRowDraft | null;
  status: "added" | "removed" | "changed" | "same";
}

/** Key a row by target (or name fallback) plus tier, so the same item across two
 *  loot tiers stays two distinct rows. */
const rowKey = (r: LinkRowDraft): string => `${r.targetSlug ?? `name:${r.name}`}|${r.tier ?? ""}`;

const sameRow = (a: LinkRowDraft, b: LinkRowDraft): boolean =>
  a.amount === b.amount && a.tier === b.tier && a.value1 === b.value1 && a.name === b.name;

/** Per-key diff of two row lists (old order first, then new-only keys). */
export function diffLinkRows(oldRows: LinkRowDraft[], newRows: LinkRowDraft[]): LinkDiffRow[] {
  const oldBy = new Map(oldRows.map((r) => [rowKey(r), r]));
  const newBy = new Map(newRows.map((r) => [rowKey(r), r]));
  const keys = [...new Set([...oldRows.map(rowKey), ...newRows.map(rowKey)])];
  return keys.map((key) => {
    const o = oldBy.get(key) ?? null;
    const n = newBy.get(key) ?? null;
    const name = (n ?? o)!.name;
    const status: LinkDiffRow["status"] = !o ? "added" : !n ? "removed" : sameRow(o, n) ? "same" : "changed";
    return { key, name, old: o, new: n, status };
  });
}
