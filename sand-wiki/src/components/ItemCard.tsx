import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

export interface ItemCardData {
  slug: string; name: string; icon?: string | null; rarity?: string | null;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="list-none">
      <Link
        href={`/items/${item.slug}`}
        className="card card-side bg-base-200 h-full items-center gap-3 p-3"
      >
        <ItemIcon name={item.name} icon={item.icon} size="card" decorative rarity={item.rarity} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{item.name}</div>
        </div>
      </Link>
    </li>
  );
}
