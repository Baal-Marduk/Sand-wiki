/** Contributor-edit protection for the seed.
 *  Applied `edit` proposals record exactly which fields a contributor changed (the keys of
 *  `Proposal.changes`). The seed uses these to skip overwriting those fields on re-seed. */

/** Fold applied `edit` proposals into `Map<slug, Set<editedFieldName>>`.
 *  Skips rows with no slug / no object changes / empty changes. Caller is responsible for
 *  passing only `status:"applied", kind:"edit"` proposals. */
export function buildLockMap(
  proposals: { targetSlug: string | null; changes: unknown }[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of proposals) {
    if (!p.targetSlug || !p.changes || typeof p.changes !== "object") continue;
    const fields = Object.keys(p.changes as Record<string, unknown>);
    if (fields.length === 0) continue;
    const set = map.get(p.targetSlug) ?? new Set<string>();
    for (const f of fields) set.add(f);
    map.set(p.targetSlug, set);
  }
  return map;
}

/** Shallow copy of `payload` with every locked key removed. No-op copy when `locked` is
 *  empty/undefined. Only the keys present in `payload` matter, so an unknown locked name
 *  is harmless. */
export function omitLocked<T extends Record<string, unknown>>(
  payload: T,
  locked?: ReadonlySet<string>,
): Partial<T> {
  if (!locked || locked.size === 0) return { ...payload };
  const out: Partial<T> = {};
  for (const k of Object.keys(payload) as (keyof T & string)[]) {
    if (!locked.has(k)) out[k] = payload[k];
  }
  return out;
}

/** Count of defined `payload` values whose key is locked — i.e. fields this seed run would
 *  have overwritten but is now preserving. For the seed's visibility log. */
export function lockedHits(payload: Record<string, unknown>, locked?: ReadonlySet<string>): number {
  if (!locked || locked.size === 0) return 0;
  let n = 0;
  for (const k of Object.keys(payload)) if (payload[k] !== undefined && locked.has(k)) n++;
  return n;
}
