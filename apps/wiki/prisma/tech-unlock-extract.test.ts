import { describe, it, expect } from "vitest";
import { planTechUnlockOptions, type UnlockPair, type ExistingUnlock } from "./tech-unlock-extract";

const pair = (itemId: string, nodeId: string): UnlockPair => ({
  itemId, itemName: `item-${itemId}`, nodeId, nodeName: `node-${nodeId}`,
});

describe("planTechUnlockOptions", () => {
  it("creates an option for a new (item, node) pair", () => {
    const planned = planTechUnlockOptions([pair("i1", "n1")], []);
    expect(planned).toEqual([{ itemId: "i1", itemName: "item-i1", nodeId: "n1", nodeName: "node-n1" }]);
  });

  it("skips a pair that already has a buy-unlock", () => {
    const existing: ExistingUnlock[] = [{ itemId: "i1", nodeId: "n1" }];
    expect(planTechUnlockOptions([pair("i1", "n1")], existing)).toEqual([]);
  });

  it("an item unlocked by two nodes yields two options", () => {
    const planned = planTechUnlockOptions([pair("i1", "n1"), pair("i1", "n2")], []);
    expect(planned.map((p) => p.nodeId)).toEqual(["n1", "n2"]);
  });

  it("de-dupes duplicate input pairs", () => {
    const planned = planTechUnlockOptions([pair("i1", "n1"), pair("i1", "n1")], []);
    expect(planned).toHaveLength(1);
  });
});
