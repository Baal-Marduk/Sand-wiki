// Serialized, client-safe tech-tree graph (no Prisma types leak to the client).
/** A link to an entity detail page (item / trampler-part / environment). */
export interface TechEntityRef {
  slug: string;
  name: string;
  icon: string | null;
  href: string | null;
}

export interface TechCost {
  name: string;
  amount: number;
  icon: string | null;
}

export interface TechUnlock {
  name: string;
  slug: string | null;
  icon: string | null;
  href: string | null;
}

export interface TechNode {
  slug: string;
  name: string;
  faction: string; // "godlewski" | "kaiser" | "landwehr"
  tier: number; // 1-4
  letter: string; // a-d (sub-column)
  crowns: number; // Crowns cost shown on the card (0 if none)
  crownsIcon: string | null; // icon for the Crowns cost (real coin icon shown on the card)
  costs: TechCost[]; // all resources (tooltip + planner); Crowns first
  unlocks: TechUnlock[];
  glyphIcon: string | null; // first unlock's icon
  prereqs: string[]; // same-faction prerequisite node slugs
}

export interface TechFaction {
  id: string;
  name: string;
  accent: string;
  rootPart?: TechEntityRef | null;
}

export interface TechTree {
  nodes: TechNode[];
  factions: TechFaction[];
  defaultUnlocked: string[]; // slugs unlocked on a fresh start (none — faction roots are free parts, not nodes)
}

// Shape returned by the Prisma query, consumed by toTechTree().
export interface RawTechLinkTarget {
  slug: string;
  name: string;
  icon: string | null;
  kind?: string | null;
  techNodeStats: { faction: string } | null;
}
export interface RawTechLink {
  role: string;
  name: string;
  amount: number | null;
  sortOrder: number;
  target: RawTechLinkTarget | null;
}
export interface RawTechRow {
  slug: string;
  name: string;
  techNodeStats: { faction: string; tier: number; sortOrder: number | null } | null;
  outgoingLinks: RawTechLink[];
}
