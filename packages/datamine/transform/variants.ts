// Item-id canonicalization for the enumerate step.
//
// SAND splits some items into _Melee / _Ranged usage-mode entries in the localization
// table (54 such ids) that are the SAME inventory item (e.g. the flare gun, smoke grenade
// can be thrown OR fired). Collapse them to one canonical id so the wiki gets one page.
//
// Element / ballistic suffixes (_Fire, _Toxic, _Armor, _EMP, _slug, _highVelocity, …) are
// DISTINCT wiki items (the missing report wants pistol-ammo-fire etc. separately) — never
// collapse those. We therefore strip ONLY the two usage-mode suffixes, nothing else.
const USAGE_MODE_SUFFIX = /_(Melee|Ranged)$/i;

/** Canonical item id: drop a trailing _Melee/_Ranged usage-mode suffix; otherwise unchanged. */
export function canonicalSekId(id: string): string {
  return id.replace(USAGE_MODE_SUFFIX, "");
}
