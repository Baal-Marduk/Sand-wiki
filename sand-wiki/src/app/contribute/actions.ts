"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { editableFields, isEditableTarget, coerceValue, fieldDef, entityHref, baseType, resolveEnumSubmission, coerceFloat } from "@/lib/proposal-schema";
import { recipeToSnapshot, parseRecipeLines, snapshotsEqual, type RecipeSnapshot } from "@/lib/recipe-proposal";
import { computeDiff } from "@/lib/proposal-diff";
import { getEntityFields } from "@/lib/proposal-entity";
import { getOutgoingLinks, getIncomingLootLinks, listLootSources } from "@/lib/queries";
import { parseLinkRows, linksToSnapshot, incomingLootToDrafts, snapshotsEqual as linkSnapshotsEqual } from "@/lib/link-proposal";
import { linkFields } from "@/lib/entity-links";

const MAX_PENDING_PER_USER = 10;
const MAX_NOTE_LENGTH = 2000;
const MAX_NAME_LENGTH = 200;
const MAX_TARGET_TYPE_LENGTH = 50;

async function assertUnderQuota(proposerId: string) {
  const pending = await prisma.proposal.count({ where: { proposerId, status: "pending" } });
  if (pending >= MAX_PENDING_PER_USER) {
    throw new Error("You have too many pending proposals. Please wait for review.");
  }
}

function assertMaxLength(value: string, max: number, label: string) {
  if (value.length > max) throw new Error(`${label} is too long (max ${max} characters).`);
}

/** Read + trim the free-text note, enforcing a length cap. Empty → null. */
function readNote(formData: FormData): string | null {
  const note = String(formData.get("note") ?? "").trim();
  assertMaxLength(note, MAX_NOTE_LENGTH, "Note");
  return note || null;
}

export async function submitEdit(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const note = readNote(formData);

  if (!isEditableTarget(type)) throw new Error("Unknown target type.");
  const session = await requireUser(`/contribute/edit?type=${type}&slug=${slug}`);
  await assertUnderQuota(session.steamId);

  const current = await getEntityFields(type, slug);
  if (!current) throw new Error("Page not found.");

  const submitted: Record<string, string | number | null> = {};
  for (const f of editableFields(type)) {
    const def = fieldDef(type, f.field)!;
    let raw = String(formData.get(f.field) ?? "");
    if (def.type === "enum") {
      raw = resolveEnumSubmission(raw, String(formData.get(`${f.field}__custom`) ?? ""));
    }
    submitted[f.field] = coerceValue(baseType(def), raw);
  }

  const changes = computeDiff(current.values, submitted, editableFields(type));
  if (Object.keys(changes).length === 0) throw new Error("No changes to submit.");

  await prisma.proposal.create({
    data: { kind: "edit", targetType: type, targetSlug: slug, changes: changes as object, note, proposerId: session.steamId },
  });
  redirect(`${entityHref(type, slug)}?proposed=1`);
}

export async function submitNewPage(formData: FormData) {
  const proposedName = String(formData.get("proposedName") ?? "").trim();
  const targetType = String(formData.get("targetType") ?? "").trim();
  const note = readNote(formData);

  if (!proposedName || !note) throw new Error("Name and details are required.");
  assertMaxLength(proposedName, MAX_NAME_LENGTH, "Name");
  assertMaxLength(targetType, MAX_TARGET_TYPE_LENGTH, "Type");
  const session = await requireUser("/contribute/new");
  await assertUnderQuota(session.steamId);

  await prisma.proposal.create({
    data: { kind: "new_page", targetType: targetType || null, proposedName, note, proposerId: session.steamId },
  });
  redirect("/contribute/new?submitted=1");
}

export async function submitRecipeEdit(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const note = readNote(formData);
  if (!slug) throw new Error("Missing recipe.");

  const session = await requireUser(`/contribute/edit-recipe?slug=${slug}`);
  await assertUnderQuota(session.steamId);

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: {
      inputs: { include: { entity: { select: { slug: true, name: true } } } },
      outputs: { include: { entity: { select: { slug: true, name: true } } } },
    },
  });
  if (!recipe) throw new Error("Recipe not found.");

  const items = await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true } });
  const nameBySlug = new Map(items.map((i) => [i.slug, i.name]));

  const workbench = resolveEnumSubmission(
    String(formData.get("workbench") ?? ""),
    String(formData.get("workbench__custom") ?? ""),
  );
  const ip = parseRecipeLines(formData.getAll("inputSlug").map(String), formData.getAll("inputAmount").map(String), nameBySlug);
  if (ip.error) throw new Error(ip.error);
  const op = parseRecipeLines(formData.getAll("outputSlug").map(String), formData.getAll("outputAmount").map(String), nameBySlug);
  if (op.error) throw new Error(op.error);
  if (op.lines.length === 0) throw new Error("A recipe needs at least one output.");

  const newSnap: RecipeSnapshot = {
    workbench: coerceValue("string", workbench) as string | null,
    tier: coerceValue("int", String(formData.get("tier") ?? "")) as number | null,
    craftTimeSeconds: coerceFloat(String(formData.get("craftTimeSeconds") ?? "")),
    inputs: ip.lines,
    outputs: op.lines,
  };
  const oldSnap = recipeToSnapshot(recipe);
  if (snapshotsEqual(oldSnap, newSnap)) throw new Error("No changes to submit.");

  await prisma.proposal.create({
    data: {
      kind: "recipe_edit",
      targetType: "recipe",
      targetSlug: slug,
      changes: { old: oldSnap, new: newSnap } as object,
      note,
      proposerId: session.steamId,
    },
  });

  const out = newSnap.outputs[0]?.slug ?? oldSnap.outputs[0]?.slug;
  redirect(out ? `${entityHref("item", out)}?proposed=1` : "/items?proposed=1");
}

export async function submitNewRecipe(formData: FormData) {
  const note = readNote(formData);
  const backType = String(formData.get("backType") ?? "item");
  const backSlug = String(formData.get("backSlug") ?? "");

  const session = await requireUser("/contribute/new");
  await assertUnderQuota(session.steamId);

  const items = await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true } });
  const nameBySlug = new Map(items.map((i) => [i.slug, i.name]));

  const workbench = resolveEnumSubmission(
    String(formData.get("workbench") ?? ""),
    String(formData.get("workbench__custom") ?? ""),
  );
  const ip = parseRecipeLines(formData.getAll("inputSlug").map(String), formData.getAll("inputAmount").map(String), nameBySlug);
  if (ip.error) throw new Error(ip.error);
  const op = parseRecipeLines(formData.getAll("outputSlug").map(String), formData.getAll("outputAmount").map(String), nameBySlug);
  if (op.error) throw new Error(op.error);
  if (op.lines.length === 0) throw new Error("A recipe needs at least one output.");

  const newSnap: RecipeSnapshot = {
    workbench: coerceValue("string", workbench) as string | null,
    tier: coerceValue("int", String(formData.get("tier") ?? "")) as number | null,
    craftTimeSeconds: coerceFloat(String(formData.get("craftTimeSeconds") ?? "")),
    inputs: ip.lines,
    outputs: op.lines,
  };

  await prisma.proposal.create({
    data: {
      kind: "recipe_new",
      targetType: "recipe",
      changes: { new: newSnap } as object,
      note,
      proposerId: session.steamId,
    },
  });
  redirect(backSlug ? `${entityHref(backType, backSlug)}?proposed=1` : "/items?proposed=1");
}

export async function submitDeleteRecipe(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const backType = String(formData.get("backType") ?? "item");
  const backSlug = String(formData.get("backSlug") ?? "");
  const note = readNote(formData);
  if (!slug) throw new Error("Missing recipe.");

  const session = await requireUser(`/contribute/edit-tabs?type=${backType}&slug=${backSlug}`);
  await assertUnderQuota(session.steamId);

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: {
      inputs: { include: { entity: { select: { slug: true, name: true } } } },
      outputs: { include: { entity: { select: { slug: true, name: true } } } },
    },
  });
  if (!recipe) throw new Error("Recipe not found.");

  await prisma.proposal.create({
    data: {
      kind: "recipe_delete",
      targetType: "recipe",
      targetSlug: slug,
      changes: { old: recipeToSnapshot(recipe) } as object,
      note,
      proposerId: session.steamId,
    },
  });
  redirect(backSlug ? `${entityHref(backType, backSlug)}?proposed=1` : "/items?proposed=1");
}

export async function submitLinksEdit(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const role = String(formData.get("role") ?? "");
  const note = readNote(formData);

  if (!isEditableTarget(type)) throw new Error("Unknown target type.");
  if (linkFields(role).length === 0) throw new Error("Unknown tab.");

  const session = await requireUser(`/contribute/edit-tabs?type=${type}&slug=${slug}`);
  await assertUnderQuota(session.steamId);

  const entity = await getOutgoingLinks(slug, role);
  if (!entity) throw new Error("Page not found.");

  const items = await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true } });
  const nameBySlug = new Map(items.map((i) => [i.slug, i.name]));

  const parsed = parseLinkRows(role, {
    slugs: formData.getAll("linkSlug").map(String),
    customNames: formData.getAll("linkName").map(String),
    amounts: formData.getAll("linkAmount").map(String),
    tiers: formData.getAll("linkTier").map(String),
    value1s: formData.getAll("linkValue1").map(String),
  }, nameBySlug);
  if (parsed.error) throw new Error(parsed.error);

  const oldSnap = linksToSnapshot(role, entity.outgoingLinks);
  const newSnap = { role, rows: parsed.rows };
  if (linkSnapshotsEqual(oldSnap, newSnap)) throw new Error("No changes to submit.");

  await prisma.proposal.create({
    data: {
      kind: "links_edit",
      targetType: type,
      targetSlug: slug,
      changes: { role, old: oldSnap.rows, new: newSnap.rows } as object,
      note,
      proposerId: session.steamId,
    },
  });
  redirect(`${entityHref(type, slug)}?proposed=1`);
}

/** Item-side loot editing: reconcile which containers/landmarks an item is found in.
 *  Mirrors submitLinksEdit but inverse — each row selects a SOURCE (held in the row's
 *  targetSlug per the inversion convention). Free-text/unlinked sources are rejected. */
export async function submitItemLootEdit(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const role = "loot";
  const note = readNote(formData);

  const session = await requireUser(`/contribute/edit-tabs?type=item&slug=${slug}`);
  await assertUnderQuota(session.steamId);

  const oldRows = await getIncomingLootLinks(slug);
  if (oldRows === null) throw new Error("Item not found.");

  const sources = await listLootSources();
  const nameBySlug = new Map(sources.map((s) => [s.slug, s.name]));

  const parsed = parseLinkRows(role, {
    slugs: formData.getAll("linkSlug").map(String),
    customNames: formData.getAll("linkName").map(String),
    amounts: formData.getAll("linkAmount").map(String),
    tiers: formData.getAll("linkTier").map(String),
    value1s: formData.getAll("linkValue1").map(String),
  }, nameBySlug);
  if (parsed.error) throw new Error(parsed.error);
  if (parsed.rows.some((r) => r.targetSlug === null)) {
    throw new Error("Loot sources must be existing containers or landmarks.");
  }

  const oldSnap = { role, rows: incomingLootToDrafts(oldRows) };
  const newSnap = { role, rows: parsed.rows };
  if (linkSnapshotsEqual(oldSnap, newSnap)) throw new Error("No changes to submit.");

  await prisma.proposal.create({
    data: {
      kind: "loot_sources_edit",
      targetType: "item",
      targetSlug: slug,
      changes: { role, old: oldSnap.rows, new: newSnap.rows } as object,
      note,
      proposerId: session.steamId,
    },
  });

  redirect(`/contribute/edit-tabs?type=item&slug=${slug}&proposed=1`);
}
