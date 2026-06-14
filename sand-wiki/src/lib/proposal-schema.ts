import { KNOWN_RARITY_NAMES } from "./rarity";
import { ITEM_CATEGORY_SLUGS, TRAMPLER_CATEGORY_SLUGS, ENV_CATEGORY_SLUGS, categoryLabel } from "./taxonomy";

export type FieldType = "string" | "text" | "int" | "enum";

export interface EditableField {
  field: string;
  label: string;
  type: FieldType;
  /** Only for type "enum": the scalar type the chosen value coerces to. */
  enumValueType?: "string" | "int";
}

/** Sentinel select value meaning "let me type a value not in the list". */
export const OTHER_OPTION = "__other__";

/** Whitelist of scalar fields a community edit may touch, per target type.
 *  Anything not listed here can never be proposed or applied. */
export const EDITABLE_FIELDS: Record<string, EditableField[]> = {
  item: [
    { field: "name", label: "Name", type: "string" },
    { field: "description", label: "Description", type: "text" },
    { field: "category", label: "Category", type: "enum", enumValueType: "string" },
    { field: "rarity", label: "Rarity", type: "enum", enumValueType: "string" },
    { field: "statType", label: "Type", type: "string" },
    { field: "storageStack", label: "Storage stack", type: "int" },
    { field: "workbenchTier", label: "Workbench tier", type: "enum", enumValueType: "int" },
    { field: "statValue", label: "Value", type: "int" },
    { field: "damage", label: "Damage", type: "int" },
    { field: "playerDamage", label: "Player damage", type: "int" },
    { field: "tramplerDamage", label: "Trampler damage", type: "int" },
    { field: "splashDamage", label: "Splash damage", type: "int" },
    { field: "magazine", label: "Magazine", type: "int" },
    { field: "ammoName", label: "Ammo", type: "string" },
  ],
  envEntity: [
    { field: "name", label: "Name", type: "string" },
    { field: "description", label: "Description", type: "text" },
    { field: "category", label: "Category", type: "enum", enumValueType: "string" },
    { field: "sourceUrl", label: "Source URL", type: "string" },
  ],
  tramplerPart: [
    { field: "name", label: "Name", type: "string" },
    { field: "description", label: "Description", type: "text" },
    { field: "category", label: "Category", type: "enum", enumValueType: "string" },
    { field: "dimensions", label: "Dimensions", type: "string" },
    { field: "health", label: "Health", type: "int" },
    { field: "weight", label: "Weight", type: "int" },
    { field: "weightCapacity", label: "Weight capacity", type: "int" },
    { field: "weightCompensation", label: "Weight compensation", type: "int" },
    { field: "energyConsumption", label: "Energy consumption", type: "int" },
    { field: "energyCapacity", label: "Energy capacity", type: "int" },
    { field: "ratedPower", label: "Rated power", type: "int" },
    { field: "crewSlots", label: "Crew slots", type: "int" },
    { field: "itemSlots", label: "Item slots", type: "int" },
    { field: "researchTier", label: "Research tier", type: "enum", enumValueType: "int" },
  ],
};

export function isEditableTarget(type: string): boolean {
  return type in EDITABLE_FIELDS;
}

export function editableFields(type: string): EditableField[] {
  return EDITABLE_FIELDS[type] ?? [];
}

export function fieldDef(type: string, field: string): EditableField | undefined {
  return editableFields(type).find((f) => f.field === field);
}

/** Upper bounds on stored free-text, enforced server-side so a proposal can't
 *  persist arbitrarily large blobs. `text` (descriptions) gets more room than a
 *  one-line `string` field. */
export const MAX_STRING_LENGTH = 500;
export const MAX_TEXT_LENGTH = 10_000;

/** Coerce a raw form string to the stored value type. Empty/blank → null.
 *  Throws if a string/text value exceeds its length cap. */
export function coerceValue(type: FieldType, raw: string): string | number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (type === "int") {
    const n = Number(trimmed);
    return Number.isInteger(n) ? n : null;
  }
  const max = type === "text" ? MAX_TEXT_LENGTH : MAX_STRING_LENGTH;
  if (trimmed.length > max) {
    throw new Error(`Value is too long (max ${max.toLocaleString("en-US")} characters).`);
  }
  return trimmed;
}

/** Underlying scalar type used to coerce a field's submitted value. Enum fields
 *  defer to their enumValueType (default string); others use their own type. */
export function baseType(def: EditableField): FieldType {
  return def.type === "enum" ? (def.enumValueType ?? "string") : def.type;
}

/** Resolve an enum submission: the free-text custom value wins when the select
 *  value is the OTHER_OPTION sentinel. */
export function resolveEnumSubmission(raw: string, custom: string): string {
  return raw === OTHER_OPTION ? custom : raw;
}

/** Coerce a raw form string to a float. Empty/blank/non-numeric → null. */
export function coerceFloat(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Public route for a correctable entity. Mirrors the segment names used by the
 *  app router (envEntity → /environment, item → /items, else /tramplers).
 *  NOTE: distinct from `entityHref` in entity-links.ts, which keys on `Entity.kind`
 *  ("environment"/"trampler-part") and returns null for unknown kinds. This one keys
 *  on the legacy proposal *type* names and always returns a string. Keep them separate
 *  unless you reconcile the two input vocabularies. */
export function entityHref(type: string, slug: string): string {
  const seg = type === "envEntity" ? "environment" : type === "item" ? "items" : "tramplers";
  return `/${seg}/${slug}`;
}

export interface SelectOption {
  value: string;
  label: string;
}

/** Option set/order/labels for a correction-form enum select. rarity → tier order
 *  (closed set); category → the entity type's canonical slugs in declaration order,
 *  labelled; any other field → its distinct DB values (already sorted) as value=label. */
export function enumOptionsFor(type: string, field: string, dbValues: string[]): SelectOption[] {
  if (field === "rarity") {
    return KNOWN_RARITY_NAMES.map((n) => ({ value: n, label: n }));
  }
  if (field === "category") {
    const slugs =
      type === "item" ? ITEM_CATEGORY_SLUGS
      : type === "tramplerPart" ? TRAMPLER_CATEGORY_SLUGS
      : type === "envEntity" ? ENV_CATEGORY_SLUGS
      : [];
    return slugs.map((slug) => ({ value: slug, label: categoryLabel(slug) }));
  }
  return dbValues.map((v) => ({ value: v, label: v }));
}
