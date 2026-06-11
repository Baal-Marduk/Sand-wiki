import { prisma } from "./db";
import { editableFields, isEditableTarget } from "./proposal-schema";

export interface EntityFields {
  name: string;
  values: Record<string, string | number | null>;
}

/** Current whitelisted field values for an entity, used to prefill the edit
 *  form and to show "current" in the admin diff. Returns null if not found. */
export async function getEntityFields(type: string, slug: string): Promise<EntityFields | null> {
  if (!isEditableTarget(type)) return null;
  const fields = editableFields(type).map((f) => f.field);
  const select = Object.fromEntries([...fields, "name"].map((f) => [f, true]));

  const row =
    type === "item"
      ? await prisma.item.findUnique({ where: { slug }, select: select as any })
      : type === "envEntity"
        ? await prisma.envEntity.findUnique({ where: { slug }, select: select as any })
        : await prisma.tramplerPart.findUnique({ where: { slug }, select: select as any });

  if (!row) return null;
  const r = row as unknown as Record<string, string | number | null>;
  const values: Record<string, string | number | null> = {};
  for (const f of fields) values[f] = r[f] ?? null;
  return { name: String(r.name ?? slug), values };
}
