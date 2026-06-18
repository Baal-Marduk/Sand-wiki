import { Fragment } from "react";
import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/** Mono uppercase breadcrumb trail with slash separators. The last crumb is the
 *  current page (plain text); earlier crumbs with an href are links. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground"
    >
      {items.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden className="text-border-strong">
              /
            </span>
          )}
          {c.href ? (
            <Link href={c.href} className="transition-colors hover:text-primary">
              {c.label}
            </Link>
          ) : (
            <span className="text-foreground">{c.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
