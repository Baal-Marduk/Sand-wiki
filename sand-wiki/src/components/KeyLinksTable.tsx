import { ItemIconLink } from "@/components/ItemIconLink";

export interface KeyLinkView {
  slug: string | null;
  name: string;
  icon: string | null;
  rarity: string | null;
}

/** The key-progression panel for a location: the key(s) needed to open it and the
 *  key(s) it rewards. Each key links to its item page. Mirrors LootTable's icon grid. */
export function KeyLinksTable({ requires, rewards }: { requires: KeyLinkView[]; rewards: KeyLinkView[] }) {
  const section = (label: string, rows: KeyLinkView[]) =>
    rows.length === 0 ? null : (
      <div className="space-y-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</h3>
        <div className="flex flex-wrap gap-3">
          {rows.map((r, i) => (
            <ItemIconLink
              key={`${r.slug ?? r.name}-${i}`}
              slug={r.slug ?? undefined}
              name={r.name}
              icon={r.icon}
              rarity={r.rarity}
            />
          ))}
        </div>
      </div>
    );
  return (
    <div className="space-y-4">
      {section("Required to open", requires)}
      {section("Rewards", rewards)}
    </div>
  );
}
