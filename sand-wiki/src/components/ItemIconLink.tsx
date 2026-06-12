import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

/** A single item shown as an icon with a hover/focus tooltip of its name, linked to the item
 *  page when a slug is known (or to an explicit `href`). Optional ×amount below it (recipes).
 *  Shared by recipes + loot. */
export function ItemIconLink({
  slug, href, name, icon, amount, rarity,
}: { slug?: string; href?: string; name: string; icon?: string | null; amount?: number; rarity?: string | null }) {
  const target = href ?? (slug ? `/items/${slug}` : undefined);
  return (
    <div className="group relative flex flex-col items-center gap-0.5">
      {target ? (
        <Link href={target} aria-label={name} className="block">
          <ItemIcon name={name} icon={icon} size="recipe" rarity={rarity} />
        </Link>
      ) : (
        <ItemIcon name={name} icon={icon} size="recipe" rarity={rarity} />
      )}
      {amount != null && <span className="text-sm font-bold text-base-content">×{amount}</span>}
      <span
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 whitespace-nowrap rounded-field border border-base-300 bg-base-100 px-2 py-1 text-xs text-base-content shadow-lg"
      >
        {name}
      </span>
    </div>
  );
}
