"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { editableFields, isEditableTarget, coerceValue, fieldDef } from "@/lib/proposal-schema";
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
    submitted[f.field] = coerceValue(def.type, String(formData.get(f.field) ?? ""));
  }

  const changes = computeDiff(current.values, submitted, editableFields(type));
  if (Object.keys(changes).length === 0) throw new Error("No changes to submit.");

  await prisma.proposal.create({
    data: { kind: "edit", targetType: type, targetSlug: slug, changes: changes as object, note, proposerId: session.steamId },
  });
  redirect(`/${type === "envEntity" ? "environment" : type === "item" ? "items" : "tramplers"}/${slug}?proposed=1`);
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
