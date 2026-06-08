import { describe, it, expect } from "vitest";
import { collectPrerequisites, calculateTotalCost, type TechGraph } from "./tech-tree";

// A -> requires B -> requires C.  D shares prerequisite C (diamond via B and D).
const graph: TechGraph = new Map([
  ["A", { id: "A", costs: [{ resourceId: "iron", quantity: 10 }], prerequisiteIds: ["B", "D"] }],
  ["B", { id: "B", costs: [{ resourceId: "iron", quantity: 5 }], prerequisiteIds: ["C"] }],
  ["D", { id: "D", costs: [{ resourceId: "fuel", quantity: 2 }], prerequisiteIds: ["C"] }],
  ["C", { id: "C", costs: [{ resourceId: "iron", quantity: 1 }, { resourceId: "fuel", quantity: 3 }], prerequisiteIds: [] }],
]);

describe("collectPrerequisites", () => {
  it("includes the target and all transitive prerequisites", () => {
    expect(collectPrerequisites(graph, "A")).toEqual(new Set(["A", "B", "D", "C"]));
  });

  it("counts a shared prerequisite once (diamond)", () => {
    expect([...collectPrerequisites(graph, "A")].filter((id) => id === "C")).toHaveLength(1);
  });

  it("returns just the node when it has no prerequisites", () => {
    expect(collectPrerequisites(graph, "C")).toEqual(new Set(["C"]));
  });

  it("throws for an unknown node", () => {
    expect(() => collectPrerequisites(graph, "Z")).toThrow(/unknown tech node/i);
  });

  it("does not loop forever on a cycle", () => {
    const cyclic: TechGraph = new Map([
      ["X", { id: "X", costs: [], prerequisiteIds: ["Y"] }],
      ["Y", { id: "Y", costs: [], prerequisiteIds: ["X"] }],
    ]);
    expect(collectPrerequisites(cyclic, "X")).toEqual(new Set(["X", "Y"]));
  });
});

describe("calculateTotalCost", () => {
  it("sums costs across the closure, grouped by resource, counting shared nodes once", () => {
    // A:10 iron; B:5 iron; D:2 fuel; C:1 iron + 3 fuel  => iron 16, fuel 5
    const total = calculateTotalCost(graph, "A");
    expect(total).toEqual(new Map([["iron", 16], ["fuel", 5]]));
  });

  it("returns a node's own cost when it has no prerequisites", () => {
    expect(calculateTotalCost(graph, "C")).toEqual(new Map([["iron", 1], ["fuel", 3]]));
  });
});
