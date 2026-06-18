import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Entity, TramplerStats } from "@sandlabs/data";

const SEK = resolve(import.meta.dirname, "../sek-out");

/** One datamined walker compartment's gameplay stats. `epbId` is the prefab id
 *  (e.g. compArmor_Framed_Metal_1x1); `name` is the localized compartment name used to
 *  match the baseline trampler-part entity. Stat fields are null when the prefab lacked them. */
export interface CompartmentStat {
  epbId: string;
  name: string;
  health: number | null;
  weight: number | null;
  weightCapacity: number | null;
  weightCompensation: number | null;
  energyConsumption: number | null;
  energyCapacity: number | null;
  ratedPower: number | null;
  crewSlots: number | null;
  itemSlots: number | null;
}

/** Load compartment_stats.json if it exists (produced by extract_compartment_stats.py +
 *  the final mapping). Returns [] when absent so the transform can skip the step. */
export function loadCompartmentStats(dir = SEK): CompartmentStat[] {
  const p = resolve(dir, "compartment_stats.json");
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf-8")) as CompartmentStat[];
}

/** Datamine-owned TramplerStats fields. Research fields stay baseline (tech tree, out of
 *  scope this pass). dimensions stays baseline (geometry derived elsewhere). */
type TramplerPatch = Partial<Pick<TramplerStats,
  "health" | "weight" | "weightCapacity" | "weightCompensation" |
  "energyConsumption" | "energyCapacity" | "ratedPower" | "crewSlots" | "itemSlots">>;

const STAT_FIELDS = [
  "health", "weight", "weightCapacity", "weightCompensation",
  "energyConsumption", "energyCapacity", "ratedPower", "crewSlots", "itemSlots",
] as const;

/** Build a patch with only the numeric fields the datamine actually provides. */
export function tramplerPatch(s: CompartmentStat): TramplerPatch {
  const p: TramplerPatch = {};
  for (const f of STAT_FIELDS) {
    const v = s[f];
    if (v !== null && v !== undefined) p[f] = v;
  }
  return p;
}

/** Merge datamined compartment stats over the baseline trampler-part entities.
 *  Match by compartment name (case-insensitive) → baseline slug, else partOverrides
 *  (compartment name → slug). Refreshes provided fields, preserves the rest (incl. research).
 *  Non-part entities and unmatched compartments pass through untouched. */
export function mergeTrampler(
  baseline: Entity[],
  stats: CompartmentStat[],
  partOverrides: Record<string, string>,
): Entity[] {
  const byName = new Map(
    baseline.filter((e) => e.kind === "trampler-part").map((e) => [e.name.toLowerCase(), e.slug]),
  );
  const patchBySlug = new Map<string, TramplerPatch>();
  for (const s of stats) {
    const slug = partOverrides[s.name] ?? byName.get(s.name.toLowerCase());
    if (!slug || patchBySlug.has(slug)) continue; // unmatched or already patched
    patchBySlug.set(slug, tramplerPatch(s));
  }
  return baseline.map((e) => {
    const patch = patchBySlug.get(e.slug);
    if (!patch || !e.tramplerStats) return e;
    return { ...e, tramplerStats: { ...e.tramplerStats, ...patch } };
  });
}
