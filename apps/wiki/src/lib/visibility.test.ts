import { describe, it, expect } from "vitest";
import { visibilityWhere, linkTargetEnabled } from "./visibility";

describe("visibilityWhere", () => {
  it("hides disabled rows for non-admins", () => {
    expect(visibilityWhere(false)).toEqual({ disabled: false });
  });

  it("shows everything to admins", () => {
    expect(visibilityWhere(true)).toEqual({});
  });
});

describe("linkTargetEnabled", () => {
  it("keeps name-only links and links to enabled targets, drops disabled targets", () => {
    expect(linkTargetEnabled).toEqual({
      OR: [{ targetId: null }, { target: { disabled: false } }],
    });
  });
});
