import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

export interface ItemCardData {
  slug: string; name: string; icon?: string | null; workbenchTier: number | null;
  buyable?: boolean; sellable?: boolean;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="list-none">
      <Link
        href={`/items/${item.slug}`}
        className="card card-side bg-base-200 hover:bg-base-300 transition-colors h-full items-center gap-3 p-3"
      >
        <ItemIcon name={item.name} icon={item.icon} size="card" decorative />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{item.name}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {item.workbenchTier !== null && (
            <span className="badge badge-ghost badge-sm">T{item.workbenchTier}</span>
          )}
          {item.buyable && (
            <span className="badge badge-success badge-sm" aria-label="Buyable">◈ Buy</span>
          )}
          {item.sellable && (
            <span className="badge badge-warning badge-sm" aria-label="Sellable">◈ Sell</span>
          )}
        </div>
      </Link>
    </li>
  );
}
