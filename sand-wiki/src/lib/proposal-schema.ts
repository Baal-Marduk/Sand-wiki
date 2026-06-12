export type FieldType = "string" | "text" | "int";

export interface EditableField {
  field: string;
  label: string;
  type: FieldType;
}

/** Whitelist of scalar fields a community edit may touch, per target type.
 *  Anything not listed here can never be proposed or applied. */
export const EDITABLE_FIELDS: Record<string, EditableField[]> = {
  item: [
    { field: "name", label: "Name", type: "string" },
    { field: "description", label: "Description", type: "text" },
    { field: "rarity", label: "Rarity", type: "string" },
    { field: "storageStack", label: "Storage stack", type: "int" },
    { field: "workbenchTier", label: "Workbench tier", type: "int" },
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
    { field: "sourceUrl", label: "Source URL", type: "string" },
  ],
  tramplerPart: [
    { field: "name", label: "Name", type: "string" },
    { field: "description", label: "Description", type: "text" },
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

/** Coerce a raw form string to the stored value type. Empty/blank → null. */
export function coerceValue(type: FieldType, raw: string): string | number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (type === "int") {
    const n = Number(trimmed);
    return Number.isInteger(n) ? n : null;
  }
  return trimmed;
}

/** Public route for a correctable entity. Mirrors the segment names used by the
 *  app router (envEntity → /environment, item → /items, else /tramplers). */
export function entityHref(type: string, slug: string): string {
  const seg = type === "envEntity" ? "environment" : type === "item" ? "items" : "tramplers";
  return `/${seg}/${slug}`;
}
