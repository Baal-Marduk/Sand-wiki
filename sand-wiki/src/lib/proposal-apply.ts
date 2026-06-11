import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { fieldDef } from "./proposal-schema";
import type { Diff } from "./proposal-diff";

/** Build a Prisma update object containing only whitelisted fields' new values. */
export function applyableUpdate(type: string, diff: Diff): Record<string, string | number | null> {
  const update: Record<string, string | number | null> = {};
  for (const [field, change] of Object.entries(diff)) {
    if (fieldDef(type, field)) update[field] = change.new;
  }
  return update;
}

/** Fields whose current DB value differs from the diff's recorded `old` value. */
export function detectStale(diff: Diff, current: Record<string, unknown>): string[] {
  const stale: string[] = [];
  for (const [field, change] of Object.entries(diff)) {
    const cur = current[field] ?? null;
    if (cur !== change.old) stale.push(field);
  }
  return stale;
}

/** Apply an approved edit proposal to its canonical row, transactionally. */
export async function applyProposal(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "edit" || !p.targetType || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending edit.");
    }
    const update = applyableUpdate(p.targetType, p.changes as unknown as Diff);
    if (Object.keys(update).length === 0) throw new Error("Nothing to apply.");

    // `update` holds only whitelisted scalar columns (applyableUpdate filters via
    // fieldDef), so it's a safe partial update for each model's input type.
    if (p.targetType === "item")
      await tx.item.update({ where: { slug: p.targetSlug }, data: update as unknown as Prisma.ItemUpdateInput });
    else if (p.targetType === "envEntity")
      await tx.envEntity.update({ where: { slug: p.targetSlug }, data: update as unknown as Prisma.EnvEntityUpdateInput });
    else if (p.targetType === "tramplerPart")
      await tx.tramplerPart.update({ where: { slug: p.targetSlug }, data: update as unknown as Prisma.TramplerPartUpdateInput });
    else throw new Error("Unknown target type.");

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}
