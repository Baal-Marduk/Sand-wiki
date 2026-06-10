import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

/** Card for a trampler part, linking to its detail page. Shows the module image,
 *  name, dimensions, and research tier. */
export function TramplerCard({
  part,
}: {
  part: { slug: string; name: string; icon?: string | null; dimensions?: string | null; researchTier?: number | null };
}) {
  return (
    <li className="list-none">
      <Link
        href={`/tramplers/${part.slug}`}
        className="card card-side bg-base-200 h-full items-center gap-3 p-3"
      >
        <ItemIcon name={part.name} icon={part.icon} size="card" decorative />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{part.name}</div>
          <div className="text-xs text-base-content/60">
            {part.dimensions && <span>{part.dimensions}</span>}
            {part.dimensions && part.researchTier != null && <span> · </span>}
            {part.researchTier != null && <span>Tier {part.researchTier}</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}
