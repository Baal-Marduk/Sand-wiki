import { ItemIconLink } from "@/components/ItemIconLink";
import type { AmmoUser } from "@/lib/queries";

/** "Used by" tab on an ammo page: the weapons/artillery that fire this ammo, as an icon grid
 *  (icon + name tooltip, linked to each weapon). Mirrors the loot grid; no amounts. */
export function AmmoUsedByGrid({ items }: { items: AmmoUser[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((w) => (
        <ItemIconLink key={w.slug} slug={w.slug} name={w.name} icon={w.icon} />
      ))}
    </div>
  );
}
