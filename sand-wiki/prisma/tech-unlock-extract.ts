export interface UnlockPair { itemId: string; itemName: string; nodeId: string; nodeName: string }
export interface ExistingUnlock { itemId: string; nodeId: string }
export interface PlannedOption { itemId: string; itemName: string; nodeId: string; nodeName: string }

const key = (itemId: string, nodeId: string) => `${itemId}|${nodeId}`;

/** Decide which (item, node) buy-unlock options to create. Skips pairs that already have a
 *  buy-unlock between that item and node (idempotent + composes with the coin-trade
 *  migration). De-dupes repeated input pairs. Input order is preserved. */
export function planTechUnlockOptions(pairs: UnlockPair[], existing: ExistingUnlock[]): PlannedOption[] {
  const seen = new Set<string>(existing.map((e) => key(e.itemId, e.nodeId)));
  const planned: PlannedOption[] = [];
  for (const p of pairs) {
    const k = key(p.itemId, p.nodeId);
    if (seen.has(k)) continue;
    seen.add(k);
    planned.push({ itemId: p.itemId, itemName: p.itemName, nodeId: p.nodeId, nodeName: p.nodeName });
  }
  return planned;
}
