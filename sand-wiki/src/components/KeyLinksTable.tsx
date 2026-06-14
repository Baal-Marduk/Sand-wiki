import { ItemIconLink } from "@/components/ItemIconLink";

export interface KeyLinkView {
  href: string | null;
  name: string;
  icon: string | null;
  rarity: string | null;
  /** Falls back to this category's glyph (castle / chest) when `icon` is missing —
   *  landmarks and loot containers have no sprite, so this is what actually renders. */
  categorySlug: string | null;
}

export interface KeyLinkSection {
  label: string;
  rows: KeyLinkView[];
}

/** Icon-grid panel for key-progression relationships, grouped into labelled sections —
 *  e.g. "Required to open" / "Rewards" on a location page, or "Opens" / "Rewarded by" on a
 *  key's item page. Each row links to its target (item or location). Empty sections are omitted. */
export function KeyLinksTable({ sections }: { sections: KeyLinkSection[] }) {
  const visible = sections.filter((s) => s.rows.length > 0);
  if (visible.length === 0) return <p className="text-muted-foreground">—</p>;
  return (
    <div className="space-y-4">
      {visible.map((s) => (
        <div key={s.label} className="space-y-2">
          <h3 className="font-display text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{s.label}</h3>
          <div className="flex flex-wrap gap-3">
            {s.rows.map((r, i) => (
              <ItemIconLink
                key={`${r.href ?? r.name}-${i}`}
                href={r.href ?? undefined}
                name={r.name}
                icon={r.icon}
                rarity={r.rarity}
                categorySlug={r.categorySlug}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
