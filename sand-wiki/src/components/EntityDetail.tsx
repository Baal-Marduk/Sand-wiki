import { Breadcrumb, type Crumb } from "@/components/Breadcrumb";
import { SuggestCorrectionLink } from "@/components/SuggestCorrectionLink";
import { EditTabsLink } from "@/components/EditTabsLink";
import { StatGrid } from "@/components/StatGrid";
import { ItemTabs, type Tab } from "@/components/ItemTabs";
import { ItemDetailsPanel } from "@/components/ItemDetailsPanel";
import { DescriptionText } from "@/components/DescriptionText";
import { ItemIcon } from "@/components/ItemIcon";
import type { StatCell, DetailRow } from "@/lib/item-view";
import { steamProfileUrl } from "@/lib/steam";

export interface EntityIcon {
  name: string;
  icon: string | null;
  rarity?: string | null;
  decorative?: boolean;
}

export interface EntityDetailProps {
  breadcrumb: Crumb[];
  suggest: { type: string; slug: string };
  canSuggest?: boolean;
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
  /** Most recent contributor credit, shown at the bottom of the sidebar. */
  lastEditedBy?: { steamId: string; name: string } | null;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </h2>
  );
}

/** Shared shell for item / trampler-part / environment-entity detail pages.
 *  Adaptive layout: a Details sidebar (and the wider max-width) appears only when
 *  `detailRows` are provided; otherwise a single centered column. */
export function EntityDetail({
  breadcrumb,
  suggest,
  canSuggest,
  icon,
  title,
  badges,
  description,
  stats,
  detailRows,
  tabs,
  tabsEmptyFallback,
  sourceUrl,
  lastEditedBy,
}: EntityDetailProps) {
  const hasDetails = !!detailRows && detailRows.length > 0;
  const hasSidebar = hasDetails || !!lastEditedBy;

  const editorCredit = lastEditedBy ? (
    <div className={hasDetails ? "mt-5" : undefined}>
      <SectionTitle>Last edited by</SectionTitle>
      <a
        href={steamProfileUrl(lastEditedBy.steamId)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[13px] font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
      >
        {lastEditedBy.name}
      </a>
    </div>
  ) : null;
  const main = tabs && tabs.length > 0 ? <ItemTabs tabs={tabs} /> : tabsEmptyFallback ?? null;
  const hasStats = !!stats && stats.length > 0;

  const statsBlock = hasStats ? (
    <section>
      <SectionTitle>Statistics</SectionTitle>
      <StatGrid cells={stats!} />
    </section>
  ) : null;

  const source = sourceUrl ? (
    <p className="text-sm text-muted-foreground">
      Source:{" "}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary-hover"
      >
        sandgame.wiki ↗
      </a>
    </p>
  ) : null;

  return (
    <article className={`mx-auto space-y-6 py-6 ${hasSidebar ? "max-w-5xl" : "max-w-3xl"}`}>
      <div className="flex items-center justify-between gap-3">
        <Breadcrumb items={breadcrumb} />
        {canSuggest && (
          <div className="flex gap-2">
            <SuggestCorrectionLink type={suggest.type} slug={suggest.slug} />
            <EditTabsLink type={suggest.type} slug={suggest.slug} />
          </div>
        )}
      </div>

      <header className="flex flex-wrap items-start gap-5">
        {icon && (
          <ItemIcon
            name={icon.name}
            icon={icon.icon}
            size="lg"
            rarity={icon.rarity ?? undefined}
            decorative={icon.decorative ?? false}
          />
        )}
        <div className="min-w-[16rem] flex-1 space-y-3">
          {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
          <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-[0.01em] sm:text-4xl">
            {title}
          </h1>
          {description && <DescriptionText text={description} />}
        </div>
      </header>

      {hasSidebar ? (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-6">
            {statsBlock}
            {main}
          </div>
          <aside>
            {hasDetails && <ItemDetailsPanel rows={detailRows!} />}
            {editorCredit}
          </aside>
        </div>
      ) : (
        <div className="space-y-6">
          {statsBlock}
          {main !== null && <div className="min-w-0">{main}</div>}
        </div>
      )}

      {source}
    </article>
  );
}
