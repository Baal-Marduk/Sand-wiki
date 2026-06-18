import { createStore, type Store } from "./store";
import type { DataSet } from "./types";
import entities from "../generated/entities.json";
import recipes from "../generated/recipes.json";
import links from "../generated/links.json";
import * as accessors from "./accessors";

// Singleton store, built once per process at module load (the Node server caches it
// across requests). The JSON is imported (build-time static), never read at runtime.
const store: Store = createStore({ entities, recipes, links } as unknown as DataSet);

export * from "./types";
export { store };

// Bound accessors — same names as accessors.ts but with the singleton store applied.
export const getEntity = (slug: string) => accessors.getEntity(store, slug);
export const listByKind = (kind: string) => accessors.listByKind(store, kind);
export const listByCategory = (kind: string, category: string) => accessors.listByCategory(store, kind, category);
export const categoryCounts = (kind: string) => accessors.categoryCounts(store, kind);
export const outgoingLinks = (slug: string, roles: string[]) => accessors.outgoingLinks(store, slug, roles);
export const incomingLinks = (slug: string, roles: string[]) => accessors.incomingLinks(store, slug, roles);
export const recipesProducing = (slug: string) => accessors.recipesProducing(store, slug);
export const recipesUsing = (slug: string) => accessors.recipesUsing(store, slug);
export const recipesAtLocation = (slug: string) => accessors.recipesAtLocation(store, slug);
export const isEntityEnabled = (slug: string) => accessors.isEntityEnabled(store, slug);
export const entityPaths = () => accessors.entityPaths(store);
