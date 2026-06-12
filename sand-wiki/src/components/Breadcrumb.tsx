import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/** DaisyUI breadcrumb trail. The last crumb is the current page and renders
 *  as plain text; earlier crumbs with an href are links. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <div className="breadcrumbs text-sm min-w-0">
      <ul>
        {items.map((c, i) => (
          <li key={i}>
            {c.href ? (
              <Link href={c.href} className="link link-hover">{c.label}</Link>
            ) : (
              <span className="text-base-content/70">{c.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
