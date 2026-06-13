import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { fieldDef } from "./proposal-schema";
import { norm, type Diff } from "./proposal-diff";
import { buildLineCreates, type RecipeProposalChange } from "./recipe-proposal";

/** Proposal target type → Entity.kind (proposal types are the legacy model names). */
const KIND_FOR_TYPE: Record<string, string> = {
  item: "item",
  envEntity: "environment",
  tramplerPart: "trampler-part",
};

/** Whitelisted fields that live on the Entity row (everything else for item/
 *  tramplerPart targets lives on the per-kind stat extension table). */
const ENTITY_OWN_FIELDS = new Set(["name", "description", "category", "rarity", "sourceUrl"]);

/** Split a whitelisted-field update into Entity columns vs stat-extension columns. */
function partitionUpdate(
  type: string,
  update: Record<string, string | number | null>,
): { entityData: Record<string, string | number | null>; statData: Record<string, string | number | null> } {
  const entityData: Record<string, string | number | null> = {};
  const statData: Record<string, string | number | null> = {};
  // envEntity has no stat extension, so all its fields are Entity-owned.
  const splitToStats = type === "item" || type === "tramplerPart";
  for (const [field, value] of Object.entries(update)) {
    if (!splitToStats || ENTITY_OWN_FIELDS.has(field)) entityData[field] = value;
    else statData[field] = value;
  }
  return { entityData, statData };
}

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
    if (!(p.targetType in KIND_FOR_TYPE)) throw new Error("Unknown target type.");

    // Whitelisted fields are split between the Entity row and its per-kind stat
    // extension. Partition `update` accordingly, then write the Entity columns plus
    // a nested upsert of the stat columns in one update.
    const { entityData, statData } = partitionUpdate(p.targetType, update);
    const statRelation = p.targetType === "item" ? "itemStats" : "tramplerStats";
    const data: Record<string, unknown> = { ...entityData };
    if (Object.keys(statData).length > 0) {
      data[statRelation] = { upsert: { create: statData, update: statData } };
    }
    await tx.entity.update({
      where: { slug: p.targetSlug },
      data: data as unknown as Prisma.EntityUpdateInput,
    });

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
    const items = await tx.entity.findMany({ where: { kind: "item", slug: { in: slugs } }, select: { id: true, slug: true } });
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
