import { describe, it, expect } from "vitest";
import { editableFields, fieldDef, coerceValue, isEditableTarget, entityHref, baseType, resolveEnumSubmission, coerceFloat, OTHER_OPTION } from "./proposal-schema";

describe("proposal schema", () => {
  it("exposes editable fields per known type", () => {
    expect(editableFields("item").length).toBeGreaterThan(0);
    expect(editableFields("unknown")).toEqual([]);
  });

  it("identifies known target types", () => {
    expect(isEditableTarget("item")).toBe(true);
    expect(isEditableTarget("envEntity")).toBe(true);
    expect(isEditableTarget("recipe")).toBe(false);
  });

  it("looks up a field definition", () => {
    expect(fieldDef("item", "rarity")?.type).toBe("enum");
    expect(fieldDef("item", "nope")).toBeUndefined();
  });

  it("coerces ints, blanking empties to null", () => {
    expect(coerceValue("int", "240")).toBe(240);
    expect(coerceValue("int", "")).toBeNull();
    expect(coerceValue("int", "  ")).toBeNull();
  });

  it("coerces strings, trimming and blanking empties to null", () => {
    expect(coerceValue("string", "  Rare ")).toBe("Rare");
    expect(coerceValue("string", "")).toBeNull();
  });

  it("returns NaN sentinel as null for non-numeric int input", () => {
    expect(coerceValue("int", "abc")).toBeNull();
  });

  it("maps target types to their public route", () => {
    expect(entityHref("item", "iron")).toBe("/items/iron");
    expect(entityHref("envEntity", "cave")).toBe("/environment/cave");
    expect(entityHref("tramplerPart", "wheel")).toBe("/tramplers/wheel");
  });

  it("marks rarity/workbenchTier/category as enum and exposes value type", () => {
    expect(fieldDef("item", "rarity")).toMatchObject({ type: "enum", enumValueType: "string" });
    expect(fieldDef("item", "workbenchTier")).toMatchObject({ type: "enum", enumValueType: "int" });
    expect(fieldDef("item", "category")?.type).toBe("enum");
    expect(fieldDef("tramplerPart", "researchTier")).toMatchObject({ type: "enum", enumValueType: "int" });
  });

  it("reduces an enum field to its underlying scalar type for coercion", () => {
    expect(baseType(fieldDef("item", "rarity")!)).toBe("string");
    expect(baseType(fieldDef("item", "workbenchTier")!)).toBe("int");
    expect(baseType(fieldDef("item", "description")!)).toBe("text");
  });

  it("resolves an enum submission, preferring custom text when Other is picked", () => {
    expect(resolveEnumSubmission("Rare", "")).toBe("Rare");
    expect(resolveEnumSubmission(OTHER_OPTION, "Mythic")).toBe("Mythic");
  });

  it("coerces floats, blanking empties and non-numbers to null", () => {
    expect(coerceFloat("2.5")).toBe(2.5);
    expect(coerceFloat("")).toBeNull();
    expect(coerceFloat("  ")).toBeNull();
    expect(coerceFloat("0")).toBe(0);
    expect(coerceFloat("abc")).toBeNull();
  });
});
