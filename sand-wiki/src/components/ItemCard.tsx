import Link from "next/link";

export interface ItemCardData {
  slug: string; name: string; type: string; workbenchLevel: number | null;
}

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <li className="rounded border border-neutral-800 p-4 hover:border-amber-600">
      <Link href={`/items/${item.slug}`} className="block">
        <span className="font-medium">{item.name}</span>
        <span className="block text-sm text-neutral-400">
          {item.type}
          {item.workbenchLevel !== null ? ` · Workbench ${item.workbenchLevel}` : ""}
        </span>
      </Link>
    </li>
  );
}
