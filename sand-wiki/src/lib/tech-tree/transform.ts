import type { RawTechRow, TechTree, TechNode, TechFaction } from "./types";

// Cost resource shown on the card and excluded from the materials list.
export const CROWNS_NAME = "Crowns";

const FACTIONS: TechFaction[] = [
  { id: "godlewski", name: "Godlewski's Expedition", accent: "#4493f8" },
  { id: "kaiser", name: "Kaiser's Friends", accent: "#e3a008" },
  { id: "landwehr", name: "K.K. Landwehr", accent: "#6fb24a" },
];

/** Sub-column letter from a tech slug (`tech-<fac>-t<tier><letter>-…`). Defaults to "a". */
export function parseLetter(slug: string): string {
  return slug.match(/-t\d+([a-z])-/)?.[1] ?? "a";
}

export function toTechTree(rows: RawTechRow[]): TechTree {
  const nodes: TechNode[] = rows
    .filter((r) => r.techNodeStats)
    .map((r) => {
      const faction = r.techNodeStats!.faction;
      const costLinks = r.outgoingLinks
        .filter((l) => l.role === "tech-unlock-cost")
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const unlockLinks = r.outgoingLinks
        .filter((l) => l.role === "tech-unlocks")
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const prereqs = r.outgoingLinks
        .filter((l) => l.role === "tech-prereq" && l.target?.techNodeStats?.faction === faction)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => l.target!.slug);

      const costs = costLinks.map((l) => ({ name: l.name, amount: l.amount ?? 0, icon: l.target?.icon ?? null }));
      const crowns = costs.find((c) => c.name === CROWNS_NAME)?.amount ?? 0;
      const unlocks = unlockLinks.map((l) => ({ name: l.name, slug: l.target?.slug ?? null, icon: l.target?.icon ?? null }));

      return {
        slug: r.slug,
        name: r.name,
        faction,
        tier: r.techNodeStats!.tier,
        letter: parseLetter(r.slug),
        crowns,
        costs,
        unlocks,
        glyphIcon: unlocks.find((u) => u.icon)?.icon ?? null,
        prereqs,
      };
    });

  const defaultUnlocked = nodes.filter((n) => n.prereqs.length === 0).map((n) => n.slug);
  const present = new Set(nodes.map((n) => n.faction));
  return { nodes, factions: FACTIONS.filter((f) => present.has(f.id)), defaultUnlocked };
}
