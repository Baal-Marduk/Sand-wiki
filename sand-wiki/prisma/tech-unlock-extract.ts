import type { PrismaClient } from "@prisma/client";

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

export interface TechUnlockResult { itemsTouched: number; optionsCreated: number; pairsSkipped: number }

/** Create price-less buy options (buy-unlock + buy-yield qty 1) on each item the tech tree
 *  unlocks, derived from existing tech-unlocks links. Insert-only and idempotent: a pair that
 *  already has a buy-unlock is skipped. Does NOT set lootCurated (buy-unlock is not
 *  seed-managed). Runs in one transaction. */
export async function extractTechUnlocksToBuyOptions(prisma: PrismaClient): Promise<TechUnlockResult> {
  return prisma.$transaction(async (tx) => {
    // tech-unlocks: source = tech node, target = unlocked entity.
    const unlockLinks = await tx.entityLink.findMany({
      where: { role: "tech-unlocks" },
      select: {
        source: { select: { id: true, name: true } },
        target: { select: { id: true, name: true, kind: true } },
      },
    });

    const pairs: UnlockPair[] = unlockLinks
      .filter((l) => l.target && l.target.kind === "item")
      .map((l) => ({
        itemId: l.target!.id, itemName: l.target!.name,
        nodeId: l.source.id, nodeName: l.source.name,
      }));

    // buy-unlock: source = item, target = node.
    const existingLinks = await tx.entityLink.findMany({
      where: { role: "buy-unlock" },
      select: { sourceId: true, targetId: true },
    });
    const existing: ExistingUnlock[] = existingLinks
      .filter((l) => l.targetId)
      .map((l) => ({ itemId: l.sourceId, nodeId: l.targetId! }));

    const planned = planTechUnlockOptions(pairs, existing);
    const pairsSkipped = pairs.length - planned.length;
    if (planned.length === 0) return { itemsTouched: 0, optionsCreated: 0, pairsSkipped };

    // Current max buyGroup per item, so appended options don't collide with existing ones.
    const itemIds = [...new Set(planned.map((p) => p.itemId))];
    const maxByItem = new Map<string, number>();
    for (const itemId of itemIds) {
      const agg = await tx.entityLink.aggregate({
        where: { sourceId: itemId, buyGroup: { not: null } },
        _max: { buyGroup: true },
      });
      maxByItem.set(itemId, agg._max.buyGroup ?? -1);
    }

    const rows: {
      sourceId: string; targetId: string; role: string; name: string;
      amount: number | null; sortOrder: number; buyGroup: number;
    }[] = [];
    for (const p of planned) {
      const group = maxByItem.get(p.itemId)! + 1;
      maxByItem.set(p.itemId, group);
      rows.push({ sourceId: p.itemId, targetId: p.nodeId, role: "buy-unlock", name: p.nodeName, amount: null, sortOrder: 0, buyGroup: group });
      rows.push({ sourceId: p.itemId, targetId: p.itemId, role: "buy-yield", name: p.itemName, amount: 1, sortOrder: 1, buyGroup: group });
    }
    await tx.entityLink.createMany({ data: rows });

    return { itemsTouched: itemIds.length, optionsCreated: planned.length, pairsSkipped };
  });
}
