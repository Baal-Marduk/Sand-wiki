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

  // Fetch the full row (single-row PK lookup) and pick whitelisted fields below;
  // avoids a dynamically-built `select` that can't be typed against Prisma.
  const row =
    type === "item"
      ? await prisma.item.findUnique({ where: { slug } })
      : type === "envEntity"
        ? await prisma.envEntity.findUnique({ where: { slug } })
        : await prisma.tramplerPart.findUnique({ where: { slug } });

  if (!row) return null;
  const r = row as unknown as Record<string, string | number | null>;
  const values: Record<string, string | number | null> = {};
  for (const f of fields) values[f] = r[f] ?? null;
  return { name: String(r.name ?? slug), values };
}

/** Distinct existing non-empty values for a whitelisted column, for building a
 *  select. Fetches full rows then plucks/dedupes (mirrors getEntityFields, which
 *  avoids a dynamically-built `select` that can't be typed against Prisma).
 *  Numeric values sort ascending; strings sort lexically. */
export async function getFieldOptions(type: string, field: string): Promise<string[]> {
  if (!isEditableTarget(type)) return [];
  const rows =
    type === "item"
      ? await prisma.item.findMany()
      : type === "envEntity"
        ? await prisma.envEntity.findMany()
        : await prisma.tramplerPart.findMany();

  const set = new Set<string | number>();
  for (const r of rows as unknown as Record<string, unknown>[]) {
    const v = r[field];
    if (v !== null && v !== undefined && v !== "") set.add(v as string | number);
  }
  const vals = [...set];
  const allNum = vals.every((v) => typeof v === "number");
  const sorted = allNum
    ? (vals as number[]).sort((a, b) => a - b)
    : (vals as (string | number)[]).map(String).sort();
  return sorted.map(String);
}

/** Distinct workbench names used by existing recipes (for the recipe editor). */
export async function getRecipeWorkbenches(): Promise<string[]> {
  const rows = await prisma.recipe.findMany({ select: { workbench: true } });
  const set = new Set<string>();
  for (const r of rows) if (r.workbench) set.add(r.workbench);
  return [...set].sort();
}
