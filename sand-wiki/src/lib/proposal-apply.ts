import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { fieldDef } from "./proposal-schema";
import { norm, type Diff } from "./proposal-diff";
import { buildLineCreates, uniqueRecipeSlug, type RecipeProposalChange, type RecipeSnapshot } from "./recipe-proposal";
import { diffLootSources, type LinkProposalChange, type ExistingLootLink } from "./link-proposal";
type RecipeNewChange = { new: RecipeSnapshot };

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
      data: { workbench: snap.workbench, tier: snap.tier, craftTimeSeconds: snap.craftTimeSeconds, curated: true },
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

/** Apply an approved recipe_new proposal: create a curated Recipe (so reseed won't
 *  clobber it) with a unique slug derived from its primary output. */
export async function applyRecipeNew(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "recipe_new" || !p.changes) {
      throw new Error("Proposal is not an applyable pending new recipe.");
    }
    const snap = (p.changes as unknown as RecipeNewChange).new;
    if (snap.outputs.length === 0) throw new Error("New recipe has no outputs.");

    const slugs = [...new Set([...snap.inputs, ...snap.outputs].map((l) => l.slug))];
    const items = await tx.entity.findMany({ where: { kind: "item", slug: { in: slugs } }, select: { id: true, slug: true } });
    const idBySlug = new Map(items.map((i) => [i.slug, i.id]));

    const inputCreates = buildLineCreates(snap.inputs, idBySlug);
    const outputCreates = buildLineCreates(snap.outputs, idBySlug);

    const existing = await tx.recipe.findMany({ select: { slug: true } });
    const slug = uniqueRecipeSlug(snap.outputs[0].slug, new Set(existing.map((r) => r.slug)));

    await tx.recipe.create({
      data: {
        slug,
        curated: true,
        workbench: snap.workbench,
        tier: snap.tier,
        craftTimeSeconds: snap.craftTimeSeconds,
        inputs: { create: inputCreates },
        outputs: { create: outputCreates },
      },
    });

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}

/** Apply an approved recipe_delete proposal: delete the Recipe (cascades lines). */
export async function applyRecipeDelete(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "recipe_delete" || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending recipe deletion.");
    }
    const recipe = await tx.recipe.findUnique({ where: { slug: p.targetSlug }, select: { id: true } });
    if (recipe) await tx.recipe.delete({ where: { id: recipe.id } });

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}

/** Apply an approved links_edit proposal: full-replace the entity's outgoing
 *  EntityLink rows for the proposal's role. Resolves target slugs to ids;
 *  unlinked rows keep targetId null + their name. Marks the source entity
 *  lootCurated so a reseed won't clobber community loot/cost edits. */
export async function applyLinksProposal(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "links_edit" || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending links edit.");
    }
    const change = p.changes as unknown as LinkProposalChange;
    const role = change.role;

    const source = await tx.entity.findUnique({ where: { slug: p.targetSlug }, select: { id: true } });
    if (!source) throw new Error("Entity not found.");

    const slugs = [...new Set(change.new.map((r) => r.targetSlug).filter((s): s is string => !!s))];
    const targets = await tx.entity.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    const idBySlug = new Map(targets.map((t) => [t.slug, t.id]));

    // Resolve before any write so a missing target aborts cleanly.
    const creates = change.new.map((r, i) => {
      const targetId = r.targetSlug ? idBySlug.get(r.targetSlug) : null;
      if (r.targetSlug && !targetId) throw new Error(`Cannot resolve target ${r.targetSlug}`);
      return {
        sourceId: source.id,
        targetId: targetId ?? null,
        role,
        name: r.name,
        amount: r.amount,
        tier: r.tier,
        value1: r.value1,
        sortOrder: i,
      };
    });

    await tx.entityLink.deleteMany({ where: { sourceId: source.id, role } });
    if (creates.length) await tx.entityLink.createMany({ data: creates });
    await tx.entity.update({ where: { id: source.id }, data: { lootCurated: true } });

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}

/** Apply an approved loot_sources_edit proposal: reconcile an ITEM's incoming loot
 *  links across many sources. Rows use the inversion convention (targetSlug = source
 *  slug). Deletes removed (source,tier) pairs, updates value1 on kept pairs, appends
 *  created pairs after each source's existing loot rows. Marks every touched source
 *  lootCurated so a reseed won't clobber the edit. */
export async function applyItemLootProposal(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "loot_sources_edit" || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending loot-sources edit.");
    }
    const change = p.changes as unknown as LinkProposalChange;

    const item = await tx.entity.findUnique({
      where: { slug: p.targetSlug },
      select: { id: true, name: true, kind: true },
    });
    if (!item || item.kind !== "item") throw new Error("Item not found.");

    const existingLinks = await tx.entityLink.findMany({
      where: { role: "loot", targetId: item.id },
      select: { id: true, tier: true, value1: true, sortOrder: true, source: { select: { slug: true } } },
    });
    const existing: ExistingLootLink[] = existingLinks.map((l) => ({
      id: l.id,
      sourceSlug: l.source.slug,
      tier: l.tier,
      value1: l.value1,
      sortOrder: l.sortOrder,
    }));

    // targetSlug holds the SOURCE slug for this proposal kind. Resolve all before writing.
    const newSourceSlugs = [...new Set(change.new.map((r) => r.targetSlug).filter((s): s is string => !!s))];
    const sources = await tx.entity.findMany({ where: { slug: { in: newSourceSlugs } }, select: { id: true, slug: true } });
    const idBySlug = new Map(sources.map((s) => [s.slug, s.id]));
    for (const slug of newSourceSlugs) {
      if (!idBySlug.has(slug)) throw new Error(`Cannot resolve loot source ${slug}`);
    }

    const { creates, updates, deletes } = diffLootSources(existing, change.new);

    if (deletes.length) await tx.entityLink.deleteMany({ where: { id: { in: deletes } } });
    for (const u of updates) {
      await tx.entityLink.update({ where: { id: u.id }, data: { value1: u.value1 } });
    }
    for (const r of creates) {
      const sourceId = idBySlug.get(r.targetSlug!)!;
      const max = await tx.entityLink.aggregate({ where: { sourceId, role: "loot" }, _max: { sortOrder: true } });
      await tx.entityLink.create({
        data: {
          sourceId,
          targetId: item.id,
          role: "loot",
          name: item.name,
          amount: null,
          tier: r.tier,
          value1: r.value1,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
        },
      });
    }

    const touchedSlugs = new Set<string>([
      ...change.old.map((r) => r.targetSlug).filter((s): s is string => !!s),
      ...change.new.map((r) => r.targetSlug).filter((s): s is string => !!s),
    ]);
    if (touchedSlugs.size) {
      await tx.entity.updateMany({ where: { slug: { in: [...touchedSlugs] } }, data: { lootCurated: true } });
    }

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}
