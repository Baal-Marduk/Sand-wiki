import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

/** Card for an environment entity (loot container, etc.), linking to its detail page. */
export function EnvCard({ entity }: { entity: { slug: string; name: string; icon?: string | null } }) {
  return (
    <li className="list-none">
      <Link
        href={`/environment/${entity.slug}`}
        className="card card-side bg-base-200 hover:bg-base-300 transition-colors h-full items-center gap-3 p-3"
      >
        <ItemIcon name={entity.name} icon={entity.icon} size="card" decorative />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{entity.name}</div>
        </div>
      </Link>
    </li>
  );
}
