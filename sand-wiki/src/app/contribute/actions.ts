"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { editableFields, isEditableTarget, coerceValue, fieldDef, entityHref, baseType, resolveEnumSubmission, coerceFloat } from "@/lib/proposal-schema";
import { recipeToSnapshot, parseRecipeLines, snapshotsEqual, type RecipeSnapshot } from "@/lib/recipe-proposal";
import { computeDiff } from "@/lib/proposal-diff";
import { getEntityFields } from "@/lib/proposal-entity";

const MAX_PENDING_PER_USER = 10;

async function assertUnderQuota(proposerId: string) {
  const pending = await prisma.proposal.count({ where: { proposerId, status: "pending" } });
  if (pending >= MAX_PENDING_PER_USER) {
    throw new Error("You have too many pending proposals. Please wait for review.");
  }
}

export async function submitEdit(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const note = (String(formData.get("note") ?? "").trim() || null) as string | null;

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
  const note = String(formData.get("note") ?? "").trim();

  if (!proposedName || !note) throw new Error("Name and details are required.");
  const session = await requireUser("/contribute/new");
  await assertUnderQuota(session.steamId);

  await prisma.proposal.create({
    data: { kind: "new_page", targetType: targetType || null, proposedName, note, proposerId: session.steamId },
  });
  redirect("/contribute/new?submitted=1");
}

export async function submitRecipeEdit(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const note = (String(formData.get("note") ?? "").trim() || null) as string | null;
  if (!slug) throw new Error("Missing recipe.");

  const session = await requireUser(`/contribute/edit-recipe?slug=${slug}`);
  await assertUnderQuota(session.steamId);

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: {
      inputs: { include: { item: { select: { slug: true, name: true } } } },
      outputs: { include: { item: { select: { slug: true, name: true } } } },
    },
  });
  if (!recipe) throw new Error("Recipe not found.");

  const items = await prisma.item.findMany({ select: { slug: true, name: true } });
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
