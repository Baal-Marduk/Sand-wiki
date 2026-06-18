import type { SekItem, Localization } from "./sek";
import { canonicalSekId } from "./variants";

/** Enumerate the COMPLETE item set for reconcile: SEK items.json (99, back-derived from
 *  loot∪recipes) UNIONED with the localization registry (~249) as synthesized stubs.
 *
 *  - dedup by canonical id (collapses _Melee/_Ranged);
 *  - real SEK items win over loc stubs (they carry icon/rarity/type/pawnValue);
 *  - loc-only items become stubs with null icon/rarity (so the merge keeps the baseline's
 *    icon/rarity) and desc/short from EN localization;
 *  - the synthesized id is the CANONICAL id (so override slug-map keys + i18n stay aligned). */
export function enumerateItems(loc: Localization, sekItems: SekItem[]): SekItem[] {
  const byCanonical = new Map<string, SekItem>();
  const add = (it: SekItem) => {
    const id = canonicalSekId(it.id);
    if (!byCanonical.has(id)) byCanonical.set(id, { ...it, id });
  };
  for (const it of sekItems) add(it); // real SEK items first (richer fields)
  for (const [id, v] of Object.entries(loc.items)) {
    const en = v.locales?.en;
    if (!en?.name) continue; // skip nameless terms
    add({ id, name: en.name, icon: null, rarity: null, type: null,
          pawnValue: null, short: en.short ?? null, desc: en.desc ?? null });
  }
  return [...byCanonical.values()];
}
