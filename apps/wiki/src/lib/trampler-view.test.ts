import { test, expect } from "vitest";
import { tramplerStatCells, tramplerDetailRows } from "@/lib/trampler-view";

const base = {
  dimensions: null, health: null, weight: null, weightCapacity: null,
  weightCompensation: null, energyConsumption: null, energyCapacity: null,
  ratedPower: null, crewSlots: null, itemSlots: null,
  researchNode: null, researchName: null, researchTier: null,
};

test("tramplerStatCells includes only the stats that have a value, in order", () => {
  const cells = tramplerStatCells({ ...base, dimensions: "4x6", health: 2400, crewSlots: 2 });
  expect(cells).toEqual([
    { label: "Dimensions", value: "4x6" },
    { label: "Health", value: 2400 },
    { label: "Crew Slots", value: 2 },
  ]);
});

test("tramplerStatCells keeps zero values (only null/empty are dropped)", () => {
  const cells = tramplerStatCells({ ...base, weight: 0, dimensions: "" });
  // weight 0 is kept; empty-string dimensions is dropped
  expect(cells).toEqual([{ label: "Weight", value: 0 }]);
});

test("tramplerDetailRows joins research node + name and adds a tier row", () => {
  const rows = tramplerDetailRows({ ...base, researchNode: "Hulls", researchName: "Steel Frame", researchTier: 3 });
  expect(rows).toEqual([
    { label: "Research", value: "Hulls. Steel Frame" },
    { label: "Research Tier", value: "3" },
  ]);
});

test("tramplerDetailRows omits rows with no data", () => {
  expect(tramplerDetailRows(base)).toEqual([]);
  expect(tramplerDetailRows({ ...base, researchTier: 0 })).toEqual([{ label: "Research Tier", value: "0" }]);
});
