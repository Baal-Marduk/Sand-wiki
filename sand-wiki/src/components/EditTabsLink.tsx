import Link from "next/link";

export function EditTabsLink({ type, slug }: { type: string; slug: string }) {
  return (
    <Link
      href={`/contribute/edit-tabs?type=${type}&slug=${slug}`}
      className="inline-flex shrink-0 items-center whitespace-nowrap border border-border-strong px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.05em] text-foreground transition-colors hover:border-primary hover:bg-card-elevated hover:text-primary-hover"
    >
      Edit tabs
    </Link>
  );
}
