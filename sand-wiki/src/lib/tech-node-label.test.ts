import { describe, it, expect } from "vitest";
import { techNodeOptionLabel } from "./tech-node-label";

describe("techNodeOptionLabel", () => {
  it("appends tier + letter parsed from the slug", () => {
    expect(techNodeOptionLabel({ name: "Cannon", slug: "tech-kaiser-t2a-cannon", tier: 2 })).toBe("Cannon (T2a)");
    expect(techNodeOptionLabel({ name: "Cannon", slug: "tech-kaiser-t3b-cannon", tier: 3 })).toBe("Cannon (T3b)");
  });

  it("derives tier from the slug when tier is not supplied", () => {
    expect(techNodeOptionLabel({ name: "Cannon", slug: "tech-kaiser-t2a-cannon", tier: null })).toBe("Cannon (T2a)");
  });

  it("falls back to tier only when the slug has no parseable letter", () => {
    expect(techNodeOptionLabel({ name: "X", slug: "not-a-tech-slug", tier: 4 })).toBe("X (T4)");
  });

  it("returns the bare name when neither tier nor letter is available", () => {
    expect(techNodeOptionLabel({ name: "X", slug: "not-a-tech-slug", tier: null })).toBe("X");
  });
});
