import Link from "next/link";
import { CategoryIcon } from "@/components/CategoryIcon";
import { WipBadge } from "@/components/WipBadge";

export interface CategoryEntry {
  /** Stable key + the CategoryIcon slug. */
  icon: string;
  title: string;
  meta?: string;
  /** Live destination; omitted for WIP/disabled entries. */
  href?: string;
  wip?: boolean;
}

/** Squared category entry card (icon tile + title + meta line) used by the Home
 *  browse grid and the Tramplers / Environment landing grids. WIP entries render
 *  as a disabled tile with a badge instead of a link. */
export function CategoryEntryCard({ entry }: { entry: CategoryEntry }) {
  const disabled = entry.wip || !entry.href;

  const body = (
    <span className="min-w-0">
      <span className="flex items-center gap-2 truncate font-display text-[17px] font-semibold uppercase tracking-[0.02em] text-foreground group-hover:text-primary-hover">
        {entry.title}
        {entry.wip && <WipBadge />}
      </span>
      {entry.meta && (
        <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{entry.meta}</span>
      )}
    </span>
  );

  if (disabled) {
    return (
      <div
        aria-disabled="true"
        className="grid cursor-not-allowed grid-cols-[48px_1fr] items-center gap-3.5 border border-border bg-card p-4 opacity-60"
      >
        <span className="grid size-12 place-items-center border border-border bg-card-elevated text-dim">
          <CategoryIcon slug={entry.icon} className="size-5" />
        </span>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={entry.href!}
      className="group grid grid-cols-[48px_1fr] items-center gap-3.5 border border-border bg-card p-4 transition-[color,background-color,border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary hover:bg-card-elevated hover:shadow-[0_10px_28px_-20px_rgba(232,137,59,0.4)]"
    >
      <span className="grid size-12 place-items-center border border-border bg-card-elevated text-primary">
        <CategoryIcon slug={entry.icon} className="size-5" />
      </span>
      {body}
    </Link>
  );
}
