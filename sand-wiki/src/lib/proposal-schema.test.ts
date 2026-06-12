import { describe, it, expect } from "vitest";
import { editableFields, fieldDef, coerceValue, isEditableTarget, entityHref } from "./proposal-schema";

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
    expect(fieldDef("item", "rarity")?.type).toBe("string");
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
});
