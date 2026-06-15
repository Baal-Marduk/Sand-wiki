import { describe, it, expect } from "vitest";
import { visibilityWhere } from "./visibility";

describe("visibilityWhere", () => {
  it("hides disabled rows for non-admins", () => {
    expect(visibilityWhere(false)).toEqual({ disabled: false });
  });

  it("shows everything to admins", () => {
    expect(visibilityWhere(true)).toEqual({});
  });
});
