// Loads the current committed wiki artifact — the lossless merge target.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Entity, Recipe, EntityLink } from "@sandlabs/data";

const GEN = resolve(import.meta.dirname, "../../data/generated");

export interface Baseline {
  entities: Entity[];
  recipes: Recipe[];
  links: EntityLink[];
}

export function loadBaseline(dir = GEN): Baseline {
  const r = (f: string) => JSON.parse(readFileSync(resolve(dir, f), "utf-8"));
  return {
    entities: r("entities.json"),
    recipes: r("recipes.json"),
    links: r("links.json"),
  };
}
