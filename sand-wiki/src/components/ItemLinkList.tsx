import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

export interface LinkListItem { slug: string; name: string; icon: string | null; rarity: string | null }

/** Vertical list of items shown as icon + visible name, each row linking to the item page.
 *  Shared by an ammo's "Used by" tab (the weapons that fire it) and a weapon's "Ammo" tab
 *  (the ammo it fires). The icon is decorative since the name sits beside it as text. */
export function ItemLinkList({ items }: { items: LinkListItem[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => (
        <li key={it.slug}>
          <Link
            href={`/items/${it.slug}`}
            className="row-link flex items-center gap-3 border border-transparent p-1.5 transition-colors hover:border-border-strong"
          >
            <ItemIcon name={it.name} icon={it.icon} size="recipe" decorative rarity={it.rarity} />
            <span className="font-medium">{it.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
