// Typed loaders for the committed sek-out datasets (the datamine inputs).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEK = resolve(import.meta.dirname, "../sek-out");

export interface SekItem {
  id: string; name: string; icon: string | null; rarity: string | null;
  type: string | null; pawnValue: number | null; short: string | null; desc: string | null;
}

export interface LocEntry { name: string; short?: string | null; desc: string | null }
export interface Localization {
  locales: string[];
  items: Record<string, { locales: Record<string, LocEntry> }>;
  compartments: Record<string, { locales: Record<string, LocEntry> }>;
  factions: string[];
}

function read<T>(file: string, dir = SEK): T {
  return JSON.parse(readFileSync(resolve(dir, file), "utf-8")) as T;
}

export function loadSekItems(dir = SEK): SekItem[] { return read("items.json", dir); }
export function loadLocalization(dir = SEK): Localization { return read("localization.json", dir); }

// --- container loot (already reconciled to wiki slugs + tier-collapse by build_container_loot.py) ---
export interface LootEntry { slug: string; name: string; chance: number; voyage: string | null; storm: string | null }
export interface LootTier { tier: string; rollSets: number; loot: LootEntry[] }
export interface Container { name: string; icon: string; category: string; tiers: LootTier[] }
export type ContainerLoot = Record<string, Container>;  // keyed by SEK container slug

export function loadContainerLoot(dir = SEK): ContainerLoot {
  // build_container_loot.py emits a { meta, containers } envelope; tolerate a bare map too.
  const raw = read<Record<string, unknown>>("container_loot.json", dir);
  return (raw.containers ?? raw) as ContainerLoot;
}
