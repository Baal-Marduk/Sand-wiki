import type { DataSet, Entity, EntityLink, Recipe } from "./types";

export interface Store {
  entities: Entity[];
  recipes: Recipe[];
  links: EntityLink[];
  bySlug: Map<string, Entity>;
  byKind: Map<string, Entity[]>;
  linksFrom: Map<string, EntityLink[]>;
  linksTo: Map<string, EntityLink[]>;
  recipesByOutput: Map<string, Recipe[]>;
  recipesByInput: Map<string, Recipe[]>;
  recipesByLocation: Map<string, Recipe[]>;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

/** Build all in-memory indexes from a dataset. Pure — no I/O. */
export function createStore(data: DataSet): Store {
  const bySlug = new Map<string, Entity>();
  const byKind = new Map<string, Entity[]>();
  for (const e of data.entities) {
    bySlug.set(e.slug, e);
    push(byKind, e.kind, e);
  }

  const linksFrom = new Map<string, EntityLink[]>();
  const linksTo = new Map<string, EntityLink[]>();
  for (const l of data.links) {
    push(linksFrom, l.sourceSlug, l);
    if (l.targetSlug !== null) push(linksTo, l.targetSlug, l);
  }

  const recipesByOutput = new Map<string, Recipe[]>();
  const recipesByInput = new Map<string, Recipe[]>();
  const recipesByLocation = new Map<string, Recipe[]>();
  for (const r of data.recipes) {
    for (const o of r.outputs) push(recipesByOutput, o.itemSlug, r);
    for (const i of r.inputs) push(recipesByInput, i.itemSlug, r);
    if (r.locationSlug !== null) push(recipesByLocation, r.locationSlug, r);
  }

  return {
    entities: data.entities, recipes: data.recipes, links: data.links,
    bySlug, byKind, linksFrom, linksTo,
    recipesByOutput, recipesByInput, recipesByLocation,
  };
}
