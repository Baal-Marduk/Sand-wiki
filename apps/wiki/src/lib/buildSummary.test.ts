import { describe, it, expect } from "vitest";
import { buildSummary } from "@/components/builder/builderCore.js";

const base = {
  v: 2,
  name: "T",
  chassisId: "compChassis_Medium4_Metal_4x4",
  placements: [
    { id: "a", partId: "compChassis_Medium4_Metal_4x4", x: 0, y: 0, z: 0, rot: 0, conns: {} },
  ],
};

describe("buildSummary", () => {
  it("counts placed parts and a base hull of 1", () => {
    const s = buildSummary(base);
    expect(s.partCount).toBe(1);
    expect(s.hull).toBe(1);
    expect(s.crowns).toBeGreaterThanOrEqual(0);
    expect(typeof s.crowns).toBe("number");
  });

  it("derives hull from the number of distinct vertical floors used", () => {
    const s = buildSummary({
      ...base,
      placements: [
        { id: "a", partId: "compChassis_Medium4_Metal_4x4", x: 0, y: 0, z: 0, rot: 0, conns: {} },
        { id: "b", partId: "compChassis_Medium4_Metal_4x4", x: 0, y: 2, z: 0, rot: 0, conns: {} },
      ],
    });
    expect(s.hull).toBe(2);
  });

  it("returns a stable chassis label string", () => {
    expect(typeof buildSummary(base).chassisLabel).toBe("string");
  });
});
