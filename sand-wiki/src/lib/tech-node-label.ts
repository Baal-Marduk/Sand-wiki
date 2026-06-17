/** Build a disambiguating picker label for a tech node: "<name> (T<tier><letter>)".
 *  The letter is parsed from the slug (`tech-<faction>-t<tier><letter>-...`); the tier
 *  comes from TechNodeStats. Falls back gracefully when tier/letter are unavailable
 *  (so duplicate node names like "Cannon" become "Cannon (T2a)" / "Cannon (T3b)"). */
export function techNodeOptionLabel(node: { name: string; slug: string; tier: number | null }): string {
  const m = node.slug.match(/^tech-[^-]+-t(\d+)([a-z])-/);
  const letter = m?.[2] ?? "";
  const tier = node.tier ?? (m ? Number(m[1]) : null);
  if (tier == null && !letter) return node.name;
  const suffix = tier != null ? `T${tier}${letter}` : letter.toUpperCase();
  return `${node.name} (${suffix})`;
}
