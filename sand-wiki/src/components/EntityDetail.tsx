import { Breadcrumb, type Crumb } from "@/components/Breadcrumb";
import { SuggestCorrectionLink } from "@/components/SuggestCorrectionLink";
import { ItemIcon } from "@/components/ItemIcon";
import { StatGrid } from "@/components/StatGrid";
import { ItemTabs, type Tab } from "@/components/ItemTabs";
import { ItemDetailsPanel } from "@/components/ItemDetailsPanel";
import type { StatCell, DetailRow } from "@/lib/item-view";

export interface EntityIcon {
  name: string;
  icon: string | null;
  rarity?: string | null;
  decorative?: boolean;
}

export interface EntityDetailProps {
  breadcrumb: Crumb[];
  suggest: { type: string; slug: string };
  icon?: EntityIcon;
  title: string;
  badges?: React.ReactNode;
  description?: string | null;
  stats?: StatCell[];
  detailRows?: DetailRow[];
  tabs?: Tab[];
  /** Shown in the main column when there are no tabs (e.g. the item "no data" message). */
  tabsEmptyFallback?: React.ReactNode;
  sourceUrl?: string | null;
}

/** Shared shell for item / trampler-part / environment-entity detail pages.
 *  Adaptive layout: a Details sidebar (and the wider max-width) appears only when
 *  `detailRows` are provided; otherwise a single centered column. */
export function EntityDetail({
  breadcrumb,
  suggest,
  icon,
  title,
  badges,
  description,
  stats,
  detailRows,
  tabs,
  tabsEmptyFallback,
  sourceUrl,
}: EntityDetailProps) {
  const hasSidebar = !!detailRows && detailRows.length > 0;
  const paragraphs = description ? description.split(/\n+/).filter(Boolean) : [];
  const main = tabs && tabs.length > 0 ? <ItemTabs tabs={tabs} /> : tabsEmptyFallback ?? null;

  return (
    <article className={`py-6 space-y-6 mx-auto ${hasSidebar ? "max-w-5xl" : "max-w-3xl"}`}>
      <div className="flex items-center justify-between gap-2">
        <Breadcrumb items={breadcrumb} />
        <SuggestCorrectionLink type={suggest.type} slug={suggest.slug} />
      </div>

      <header className="flex flex-wrap items-start gap-4">
        {icon && (
          <ItemIcon
            name={icon.name}
            icon={icon.icon}
            size="lg"
            rarity={icon.rarity ?? undefined}
            decorative={icon.decorative ?? false}
          />
        )}
        <div className="flex-1 min-w-[16rem] space-y-2">
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          {badges && <div className="flex flex-wrap gap-2">{badges}</div>}
          {paragraphs.map((p, i) => (
            <p key={i} className="text-base-content/80 max-w-prose">{p}</p>
          ))}
          {stats && stats.length > 0 && <StatGrid cells={stats} />}
        </div>
      </header>

      {hasSidebar ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px] items-start">
          <div className="min-w-0">{main}</div>
          <ItemDetailsPanel rows={detailRows!} />
        </div>
      ) : (
        main && <div className="min-w-0">{main}</div>
      )}

      {sourceUrl && (
        <p className="text-sm text-base-content/60">
          Source:{" "}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
            sandgame.wiki ↗
          </a>
        </p>
      )}
    </article>
  );
}
