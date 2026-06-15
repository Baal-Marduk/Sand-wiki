"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { typeForKind, buildImageChanges, buildEntityCreateData } from "@/lib/admin-entity";
import { entityHref } from "@/lib/entity-links";

/** Detail-page path for an entity by kind+slug, for revalidation. Falls back to "/". */
function detailPath(kind: string, slug: string): string {
  return entityHref(kind, slug) ?? "/";
}

/** List path for a kind, for revalidation. Tech-nodes have no list page → "/". */
function listPath(kind: string): string {
  if (kind === "item") return "/items";
  if (kind === "environment") return "/environment";
  if (kind === "trampler-part") return "/tramplers";
  return "/";
}

/** Set/clear an entity's image + alt text. Applies the change directly AND records a
 *  pre-applied `edit` proposal whose `changes` keys (`icon`/`imageAlt`) feed the seed's
 *  lock map, so a future re-seed won't overwrite the icon. */
export async function setEntityImage(formData: FormData) {
  const session = await requireAdmin();
  const slug = String(formData.get("slug") ?? "");
  const icon = String(formData.get("icon") ?? "");
  const imageAlt = String(formData.get("imageAlt") ?? "");

  const entity = await prisma.entity.findUnique({
    where: { slug },
    select: { kind: true, icon: true, imageAlt: true },
  });
  if (!entity) throw new Error("Entity not found.");

  const changes = buildImageChanges({ icon: entity.icon, imageAlt: entity.imageAlt }, { icon, imageAlt });
  if (changes) {
    const targetType = typeForKind(entity.kind);
    await prisma.$transaction([
      prisma.entity.update({
        where: { slug },
        data: {
          icon: changes.icon ? changes.icon.new : undefined,
          imageAlt: changes.imageAlt ? changes.imageAlt.new : undefined,
        },
      }),
      prisma.proposal.create({
        data: {
          kind: "edit",
          status: "applied",
          targetType,
          targetSlug: slug,
          changes: changes as object,
          note: "Admin image update",
          proposerId: session.steamId,
          reviewedById: session.steamId,
          reviewedAt: new Date(),
        },
      }),
    ]);
    revalidatePath(detailPath(entity.kind, slug));
    revalidatePath(listPath(entity.kind));
  }
  // No-change → no DB write; still return the admin to the detail page (a "Save" with
  // nothing edited is a harmless no-op, not an error).
  redirect(detailPath(entity.kind, slug));
}

/** Toggle an entity's disabled flag. No lock record needed — the seed never writes
 *  the `disabled` column. */
export async function setEntityDisabled(formData: FormData) {
  await requireAdmin();
  const slug = String(formData.get("slug") ?? "");
  const disabled = String(formData.get("disabled") ?? "") === "true";

  const entity = await prisma.entity.findUnique({ where: { slug }, select: { kind: true } });
  if (!entity) throw new Error("Entity not found.");

  await prisma.entity.update({ where: { slug }, data: { disabled } });
  revalidatePath(detailPath(entity.kind, slug));
  revalidatePath(listPath(entity.kind));
  redirect(detailPath(entity.kind, slug));
}

/** Create a new entity (item / environment / trampler-part), curated so the seed never
 *  prunes it. Validates + partitions via buildEntityCreateData, then inserts with the
 *  nested stat sub-row for item/trampler. */
export async function createEntity(formData: FormData) {
  await requireAdmin();
  const kind = String(formData.get("kind") ?? "");

  const raw: Record<string, string | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") raw[key] = value;
  }

  const { entityData, statData, statRelation } = buildEntityCreateData(kind, raw);

  const existing = await prisma.entity.findUnique({ where: { slug: entityData.slug as string }, select: { slug: true } });
  if (existing) throw new Error(`Slug "${entityData.slug}" is already taken.`);

  const data: Record<string, unknown> = { ...entityData };
  if (statRelation && Object.keys(statData).length > 0) {
    data[statRelation] = { create: statData };
  }
  await prisma.entity.create({ data: data as never });

  revalidatePath(listPath(kind));
  redirect(detailPath(kind, entityData.slug as string));
}
