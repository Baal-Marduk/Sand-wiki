import type { EditableField } from "./proposal-schema";

export interface Change {
  old: string | number | null;
  new: string | number | null;
}
export type Diff = Record<string, Change>;

function norm(v: unknown): string | number | null {
  return v === undefined || v === "" ? null : (v as string | number | null);
}

/** Diff of whitelisted fields only; entries appear solely where the value changed. */
export function computeDiff(
  current: Record<string, unknown>,
  submitted: Record<string, unknown>,
  fields: EditableField[],
): Diff {
  const diff: Diff = {};
  for (const f of fields) {
    const oldVal = norm(current[f.field]);
    const newVal = norm(submitted[f.field]);
    if (oldVal !== newVal) diff[f.field] = { old: oldVal, new: newVal };
  }
  return diff;
}
