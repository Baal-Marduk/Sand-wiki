import { describe, it, expect } from "vitest";
import { tramplerPatch, mergeTrampler, type CompartmentStat } from "./trampler";
import type { Entity, TramplerStats } from "@sandlabs/data";

const baseStats = (o: Partial<TramplerStats> = {}): TramplerStats => ({
  dimensions: "1x1", health: 1000, weight: 500, weightCapacity: null, weightCompensation: null,
  energyConsumption: 100, energyCapacity: null, ratedPower: null, crewSlots: null, itemSlots: null,
  researchNode: "II(c)", researchName: "Cargo Bay", researchTier: 4, ...o,
});

const part = (slug: string, name: string, stats: TramplerStats): Entity => ({
  id: slug, slug, kind: "trampler-part", name, description: null, category: "trampler",
  rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: stats, techNodeStats: null,
});

const stat = (o: Partial<CompartmentStat>): CompartmentStat => ({
  epbId: "compX", name: "X", health: null, weight: null, weightCapacity: null,
  weightCompensation: null, energyConsumption: null, energyCapacity: null, ratedPower: null,
  crewSlots: null, itemSlots: null, ...o,
});

describe("tramplerPatch", () => {
  it("emits only datamine-provided numeric fields, never research fields", () => {
    const p = tramplerPatch(stat({ health: 3500, weight: 1500, ratedPower: 50 }));
    expect(p).toEqual({ health: 3500, weight: 1500, ratedPower: 50 });
  });
  it("omits null fields so the merge keeps the baseline", () => {
    expect(tramplerPatch(stat({}))).toEqual({});
  });
});

describe("mergeTrampler", () => {
  it("refreshes matched part stats by name, preserving research + unprovided fields", () => {
    const baseline = [part("cargo-bay", "S&H Cargo Bay", baseStats({ health: 1000 }))];
    const out = mergeTrampler(baseline, [stat({ epbId: "compCargo", name: "S&H Cargo Bay", health: 3500, ratedPower: 50 })], {});
    const ts = out.find((e) => e.slug === "cargo-bay")!.tramplerStats!;
    expect(ts.health).toBe(3500);     // refreshed
    expect(ts.ratedPower).toBe(50);   // refreshed
    expect(ts.weight).toBe(500);      // baseline kept (not provided)
    expect(ts.researchName).toBe("Cargo Bay"); // research never touched
  });

  it("matches case-insensitively and via the part override map", () => {
    const baseline = [part("cargo-bay", "S&H Cargo Bay", baseStats())];
    const out = mergeTrampler(baseline, [stat({ name: "s&h cargo bay", health: 4000 })], {});
    expect(out[0].tramplerStats!.health).toBe(4000);

    const out2 = mergeTrampler(baseline, [stat({ name: "Renamed In Game", health: 7000 })], { "Renamed In Game": "cargo-bay" });
    expect(out2[0].tramplerStats!.health).toBe(7000);
  });

  it("leaves unmatched compartments and non-part entities untouched", () => {
    const item: Entity = { ...part("x", "X", baseStats()), kind: "item", tramplerStats: null };
    const baseline = [item, part("cargo-bay", "S&H Cargo Bay", baseStats())];
    const out = mergeTrampler(baseline, [stat({ name: "Unknown Part", health: 9 })], {});
    expect(out).toHaveLength(2);
    expect(out[0].tramplerStats).toBeNull(); // item untouched
    expect(out[1].tramplerStats!.health).toBe(1000); // unchanged baseline
  });
});
