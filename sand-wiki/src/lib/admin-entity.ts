import { editableFields, fieldDef, coerceValue, baseType } from "./proposal-schema";
import { isItemCategory, isEnvCategory, isTramplerCategory } from "./taxonomy";

/** Creatable Entity.kind → legacy proposal target-type name (the vocabulary used by
 *  EDITABLE_FIELDS / Proposal.targetType). Tech-nodes are not creatable. */
const TYPE_FOR_KIND: Record<string, "item" | "envEntity" | "tramplerPart"> = {
  item: "item",
  environment: "envEntity",
  "trampler-part": "tramplerPart",
};

export const CREATABLE_KINDS = ["item", "environment", "trampler-part"] as const;
export type CreatableKind = (typeof CREATABLE_KINDS)[number];

export function typeForKind(kind: string): "item" | "envEntity" | "tramplerPart" {
  const t = TYPE_FOR_KIND[kind];
  if (!t) throw new Error(`Kind "${kind}" cannot be created here.`);
  return t;
}

/** Whitelisted fields stored on the Entity row itself; all other editable fields for
 *  item/trampler targets live on the per-kind stat extension table. Mirrors the set in
 *  proposal-apply.ts (kept local so this module stays pure / server-import-free). */
const ENTITY_OWN_FIELDS = new Set(["name", "description", "category", "rarity", "sourceUrl"]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ImageFields = { icon: string | null; imageAlt: string | null };
type ChangeMap = Record<string, { old: string | null; new: string | null }>;

/** Normalize a raw image value: trim; empty → null. */
function normImage(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Diff current vs submitted image fields. Returns a {field:{old,new}} map of only the
 *  changed fields, or null if nothing changed. Used both to update the row and as the
 *  `changes` payload of the pre-applied lock proposal. */
export function buildImageChanges(
  current: ImageFields,
  submitted: { icon: string; imageAlt: string },
): ChangeMap | null {
  const next = { icon: normImage(submitted.icon), imageAlt: normImage(submitted.imageAlt) };
  const out: ChangeMap = {};
  if (next.icon !== current.icon) out.icon = { old: current.icon, new: next.icon };
  if (next.imageAlt !== current.imageAlt) out.imageAlt = { old: current.imageAlt, new: next.imageAlt };
  return Object.keys(out).length === 0 ? null : out;
}

function categoryOkForKind(kind: CreatableKind, category: string): boolean {
  if (kind === "item") return isItemCategory(category);
  if (kind === "environment") return isEnvCategory(category);
  return isTramplerCategory(category);
}

export interface EntityCreateData {
  entityData: Record<string, string | number | boolean | null>;
  statData: Record<string, string | number | null>;
  statRelation: "itemStats" | "tramplerStats" | null;
}

/** Validate + shape raw form values into a create payload split between the Entity row
 *  and its stat extension. Throws Error (message shown to admin) on invalid input. The
 *  row is always marked `curated: true` so the seed never prunes it. */
export function buildEntityCreateData(
  kind: string,
  raw: Record<string, string | undefined>,
): EntityCreateData {
  if (!(CREATABLE_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Kind "${kind}" cannot be created here.`);
  }
  const k = kind as CreatableKind;
  const type = typeForKind(k);

  const slug = (raw.slug ?? "").trim();
  if (!SLUG_RE.test(slug)) throw new Error("Slug must be lowercase letters, digits, and single hyphens (e.g. test-rifle).");

  const name = (raw.name ?? "").trim();
  if (!name) throw new Error("Name is required.");

  const category = (raw.category ?? "").trim();
  if (!categoryOkForKind(k, category)) throw new Error(`Category "${category}" is not valid for ${kind}.`);

  const entityData: Record<string, string | number | boolean | null> = {
    slug,
    kind: k,
    name,
    category,
    curated: true,
    icon: normImage(raw.icon),
    imageAlt: normImage(raw.imageAlt),
  };
  const statData: Record<string, string | number | null> = {};
  const splitToStats = k === "item" || k === "trampler-part";

  // Walk the kind's whitelisted scalar fields; name/category already handled above.
  for (const f of editableFields(type)) {
    if (f.field === "name" || f.field === "category") continue;
    const def = fieldDef(type, f.field)!;
    const value = coerceValue(baseType(def), String(raw[f.field] ?? ""));
    if (value === null) continue; // omit blanks so defaults / nulls apply cleanly
    if (!splitToStats || ENTITY_OWN_FIELDS.has(f.field)) entityData[f.field] = value;
    else statData[f.field] = value;
  }

  const statRelation = k === "item" ? "itemStats" : k === "trampler-part" ? "tramplerStats" : null;
  return { entityData, statData, statRelation };
}
