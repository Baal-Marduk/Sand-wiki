import { describe, it, expect } from "vitest";
import { costBreakdown, buildSummary } from "@/components/builder/builderCore.js";

const base = {
  v: 2,
  name: "T",
  chassisId: "compChassis_Medium4_Metal_4x4",
  placements: [
    { id: "a", partId: "compChassis_Medium4_Metal_4x4", x: 0, y: 0, z: 0, rot: 0, conns: {} },
  ],
};

describe("costBreakdown", () => {
  it("returns the four resource keys as non-negative numbers", () => {
    const c = costBreakdown(base);
    for (const k of ["crowns", "mechanical", "pneumatic", "computing"]) {
      expect(typeof c[k]).toBe("number");
      expect(c[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it("matches buildSummary's crowns for the same state", () => {
    expect(costBreakdown(base).crowns).toBe(buildSummary(base).crowns);
  });
});
