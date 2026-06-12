import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { fieldDef } from "./proposal-schema";
import { norm, type Diff } from "./proposal-diff";
import { buildLineCreates, type RecipeProposalChange } from "./recipe-proposal";

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
    // Normalize the same way computeDiff did when it recorded `old`, so an
    // empty-string column doesn't read as a spurious change against a null old.
    if (norm(current[field]) !== change.old) stale.push(field);
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

/** Apply an approved recipe_edit proposal: update meta and full-replace the
 *  recipe's input/output rows (these tables have no sortOrder, so replace is
 *  clean). Resolves item slugs to ids; throws if any referenced item is gone. */
export async function applyRecipeProposal(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "recipe_edit" || p.targetType !== "recipe" || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending recipe edit.");
    }
    const snap = (p.changes as unknown as RecipeProposalChange).new;

    const recipe = await tx.recipe.findUnique({ where: { slug: p.targetSlug } });
    if (!recipe) throw new Error("Recipe not found.");

    const slugs = [...new Set([...snap.inputs, ...snap.outputs].map((l) => l.slug))];
    const items = await tx.item.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    const idBySlug = new Map(items.map((i) => [i.slug, i.id]));

    // Resolve before any write so a missing item aborts the transaction cleanly.
    const inputCreates = buildLineCreates(snap.inputs, idBySlug).map((c) => ({ ...c, recipeId: recipe.id }));
    const outputCreates = buildLineCreates(snap.outputs, idBySlug).map((c) => ({ ...c, recipeId: recipe.id }));

    if (outputCreates.length === 0) throw new Error("Recipe edit has no output lines; refusing to apply.");

    await tx.recipe.update({
      where: { id: recipe.id },
      data: { workbench: snap.workbench, tier: snap.tier, craftTimeSeconds: snap.craftTimeSeconds },
    });
    await tx.recipeInput.deleteMany({ where: { recipeId: recipe.id } });
    await tx.recipeOutput.deleteMany({ where: { recipeId: recipe.id } });
    if (inputCreates.length) await tx.recipeInput.createMany({ data: inputCreates });
    if (outputCreates.length) await tx.recipeOutput.createMany({ data: outputCreates });

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}
