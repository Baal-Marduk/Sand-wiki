import Link from "next/link";
import { CategoryTag } from "@/components/CategoryTag";

export interface ItemCardData {
  slug: string; name: string; category: string; workbenchTier: number | null;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="list-none">
      <Link href={`/items/${item.slug}`} className="card bg-base-200 hover:bg-base-300 transition-colors h-full">
        <div className="card-body p-4">
          <span className="font-medium">{item.name}</span>
          <div className="flex flex-wrap gap-2 items-center">
            <CategoryTag slug={item.category} size="sm" />
            {item.workbenchTier !== null && (
              <span className="badge badge-ghost badge-sm">Tier {item.workbenchTier}</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
