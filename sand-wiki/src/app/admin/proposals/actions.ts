"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { applyProposal, applyRecipeProposal, applyLinksProposal, applyRecipeNew, applyRecipeDelete } from "@/lib/proposal-apply";

export async function approveProposal(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const p = await prisma.proposal.findUnique({ where: { id } });
  if (!p) throw new Error("Not found.");

  if (p.kind === "edit") {
    await applyProposal(id, session.steamId); // writes canonical row + marks applied
  } else if (p.kind === "recipe_edit") {
    await applyRecipeProposal(id, session.steamId); // rewrites relation rows + marks applied
  } else if (p.kind === "links_edit") {
    await applyLinksProposal(id, session.steamId);
  } else if (p.kind === "recipe_new") {
    await applyRecipeNew(id, session.steamId);
  } else if (p.kind === "recipe_delete") {
    await applyRecipeDelete(id, session.steamId);
  } else {
    // new_page: admin creates the row in Directus manually; just close it out.
    await prisma.proposal.update({
      where: { id },
      data: { status: "applied", reviewedById: session.steamId, reviewedAt: new Date() },
    });
  }
  redirect("/admin/proposals");
}

export async function rejectProposal(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim() || null;
  await prisma.proposal.update({
    where: { id },
    data: { status: "rejected", reviewNote, reviewedById: session.steamId, reviewedAt: new Date() },
  });
  redirect("/admin/proposals");
}
