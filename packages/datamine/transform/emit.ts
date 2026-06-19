import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Entity, Recipe, EntityLink } from "@sandlabs/data";

const GEN = resolve(import.meta.dirname, "../../data/generated");
const REPORTS = resolve(import.meta.dirname, "../reports");

/** Lightweight runtime shape check (compile-time is guaranteed by TS; this catches
 *  accidental nulls in required fields after the merge). Throws on violation. */
export function validateEntities(entities: Entity[]): void {
  for (const e of entities) {
    if (!e.slug || !e.name || !e.kind) {
      throw new Error(`emit: entity missing slug/name/kind: ${JSON.stringify(e).slice(0, 120)}`);
    }
  }
  const slugs = new Set<string>();
  for (const e of entities) {
    if (slugs.has(e.slug)) throw new Error(`emit: duplicate slug ${e.slug}`);
    slugs.add(e.slug);
  }
}

export function writeArtifact(entities: Entity[], recipes: Recipe[], links: EntityLink[]): void {
  mkdirSync(GEN, { recursive: true });
  const w = (f: string, d: unknown) => writeFileSync(resolve(GEN, f), JSON.stringify(d, null, 2) + "\n");
  w("entities.json", entities);
  w("recipes.json", recipes);
  w("links.json", links);
}

export function writeMissingReport(missing: unknown): void {
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(resolve(REPORTS, "missing-from-datamine.json"), JSON.stringify(missing, null, 2) + "\n");
}

export function writeImagesReport(report: unknown): void {
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(resolve(REPORTS, "missing-images.json"), JSON.stringify(report, null, 2) + "\n");
}

export function writeRecipesMissingReport(missing: unknown): void {
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(resolve(REPORTS, "missing-recipes.json"), JSON.stringify(missing, null, 2) + "\n");
}
