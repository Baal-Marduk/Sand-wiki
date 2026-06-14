import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

/** A single item shown as an icon with a hover/focus tooltip of its name, linked to the item
 *  page when a slug is known (or to an explicit `href`). Optional ×amount below it (recipes).
 *  Shared by recipes + loot. */
export function ItemIconLink({
  slug, href, name, icon, amount, rarity, categorySlug,
}: { slug?: string; href?: string; name: string; icon?: string | null; amount?: number; rarity?: string | null; categorySlug?: string | null }) {
  const target = href ?? (slug ? `/items/${slug}` : undefined);
  return (
    <div className="group relative flex flex-col items-center gap-0.5">
      {target ? (
        <Link href={target} aria-label={name} className="block">
          <ItemIcon name={name} icon={icon} size="recipe" rarity={rarity} categorySlug={categorySlug} />
        </Link>
      ) : (
        <ItemIcon name={name} icon={icon} size="recipe" rarity={rarity} categorySlug={categorySlug} />
      )}
      {amount != null && <span className="font-mono text-sm font-bold text-foreground">×{amount}</span>}
      <span
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap border border-border-strong bg-card-elevated px-2 py-1 text-xs text-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {name}
      </span>
    </div>
  );
}
