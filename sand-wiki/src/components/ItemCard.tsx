import Link from "next/link";
import { CategoryTag } from "@/components/CategoryTag";
import { ItemIcon } from "@/components/ItemIcon";

export interface ItemCardData {
  slug: string; name: string; icon?: string | null; category: string; workbenchTier: number | null;
  buyable?: boolean; sellable?: boolean;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="list-none">
      <Link href={`/items/${item.slug}`} className="card bg-base-200 hover:bg-base-300 transition-colors h-full">
        <div className="card-body p-4">
          <div className="flex items-center gap-2">
            <ItemIcon name={item.name} icon={item.icon} size="sm" decorative />
            <span className="font-medium">{item.name}</span>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <CategoryTag slug={item.category} size="sm" />
            {item.workbenchTier !== null && (
              <span className="badge badge-ghost badge-sm">Tier {item.workbenchTier}</span>
            )}
            {item.buyable && (
              <span className="badge badge-success badge-sm" aria-label="Buyable">◈ Buy</span>
            )}
            {item.sellable && (
              <span className="badge badge-warning badge-sm" aria-label="Sellable">◈ Sell</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
