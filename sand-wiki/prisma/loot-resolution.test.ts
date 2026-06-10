import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Guards crate-loot import integrity. Mirrors the name→slug resolver in
 *  import-env-content.mjs: exact normalized displayName/name match (first wins) plus
 *  wiki-overrides.json. Catches wiki loot names that drift from the game catalog
 *  (e.g. the wiki's "Pneumatic Components" vs the game's "Pneumatic Parts") silently
 *  going unresolved, and stale slug targets. */

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const load = <T>(f: string): T => JSON.parse(readFileSync(join(__dirname, f), "utf-8")) as T;

interface ScrapItem { slug: string; name?: string; displayName?: string | null }
interface LootEntry { name: string; slug?: string }
interface EnvEntity { loot?: { tiers?: { tier: string; entries?: LootEntry[] }[] } }

describe("crate loot resolution", () => {
  const data = load<{ items: ScrapItem[] }>("data.json");
  const overrides = load<Record<string, string>>("wiki-overrides.json");
  const env = load<Record<string, EnvEntity>>("env-content.json");

  const slugs = new Set(data.items.map((i) => i.slug));
  const index = new Map<string, string>();
  for (const it of data.items) for (const n of [it.displayName, it.name]) {
    const k = norm(n ?? "");
    if (k && !index.has(k)) index.set(k, it.slug);
  }
  const resolve = (name: string) => overrides[norm(name)] ?? index.get(norm(name));

  const lootEntries: LootEntry[] = [];
  for (const e of Object.values(env)) for (const t of e.loot?.tiers ?? []) for (const ent of t.entries ?? []) lootEntries.push(ent);

  it("every crate loot entry name resolves to an item slug", () => {
    const unresolved = [...new Set(lootEntries.filter((e) => !resolve(e.name)).map((e) => e.name))].sort();
    expect(unresolved).toEqual([]);
  });

  it("every override target is a real item slug", () => {
    const bad = Object.entries(overrides).filter(([, slug]) => !slugs.has(slug)).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("every stored loot slug points at a real item", () => {
    const bad = [...new Set(lootEntries.filter((e) => e.slug && !slugs.has(e.slug)).map((e) => e.slug!))].sort();
    expect(bad).toEqual([]);
  });
});
