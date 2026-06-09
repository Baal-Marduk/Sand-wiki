import Link from "next/link";
import { categoryLabel } from "@/lib/taxonomy";

export interface ItemCardData {
  slug: string; name: string; category: string; workbenchLevel: number | null;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="list-none">
      <Link href={`/items/${item.slug}`} className="card bg-base-200 hover:bg-base-300 transition-colors h-full">
        <div className="card-body p-4">
          <span className="font-medium">{item.name}</span>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="badge badge-outline badge-sm">{categoryLabel(item.category)}</span>
            {item.workbenchLevel !== null && (
              <span className="badge badge-ghost badge-sm">Workbench {item.workbenchLevel}</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
