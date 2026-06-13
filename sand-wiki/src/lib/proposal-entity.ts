import { prisma } from "./db";
import { editableFields, isEditableTarget, enumOptionsFor, type SelectOption } from "./proposal-schema";

/** Proposal target type → Entity.kind. Proposal types are the legacy model names
 *  (item/envEntity/tramplerPart); the unified model stores them under `kind`. */
const KIND_FOR_TYPE: Record<string, string> = {
  item: "item",
  envEntity: "environment",
  tramplerPart: "trampler-part",
};

export interface EntityFields {
  name: string;
  values: Record<string, string | number | null>;
}

/** Current whitelisted field values for an entity, used to prefill the edit
 *  form and to show "current" in the admin diff. Returns null if not found. */
export async function getEntityFields(type: string, slug: string): Promise<EntityFields | null> {
  if (!isEditableTarget(type)) return null;
  const fields = editableFields(type).map((f) => f.field);

  // Fetch the Entity row plus its stat extension (whitelisted stat fields now live
  // on ItemStats/TramplerStats), then flatten and pick whitelisted fields below.
  // The proposal target type maps to the Entity `kind`.
  const row = await prisma.entity.findUnique({
    where: { slug },
    include: { itemStats: true, tramplerStats: true },
  });
  if (!row || row.kind !== KIND_FOR_TYPE[type]) return null;
  const { itemStats, tramplerStats, ...entity } = row;
  const flat = { ...entity, ...(itemStats ?? {}), ...(tramplerStats ?? {}) };
  const r = flat as unknown as Record<string, string | number | null>;
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
  if (!editableFields(type).some((f) => f.field === field)) return [];
  const rows = await prisma.entity.findMany({
    where: { kind: KIND_FOR_TYPE[type] },
    include: { itemStats: true, tramplerStats: true },
  });

  const set = new Set<string | number>();
  for (const row of rows) {
    const { itemStats, tramplerStats, ...entity } = row;
    const r = { ...entity, ...(itemStats ?? {}), ...(tramplerStats ?? {}) } as unknown as Record<string, unknown>;
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

/** Correction-form select options for an enum field: canonical order/labels for
 *  rarity & category (which ignore DB values), DB-derived values otherwise. The
 *  closed-set fields skip the table scan. */
export async function getEnumOptions(type: string, field: string): Promise<SelectOption[]> {
  const needsDb = field !== "rarity" && field !== "category";
  const dbValues = needsDb ? await getFieldOptions(type, field) : [];
  return enumOptionsFor(type, field, dbValues);
}

/** Distinct workbench names used by existing recipes (for the recipe editor). */
export async function getRecipeWorkbenches(): Promise<string[]> {
  const rows = await prisma.recipe.findMany({ select: { workbench: true } });
  const set = new Set<string>();
  for (const r of rows) if (r.workbench) set.add(r.workbench);
  return [...set].sort();
}
