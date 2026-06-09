import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";
import type { RecipeCard, RecipeCardRow } from "@/lib/recipes";

export function IngredientList({ rows }: { rows: RecipeCardRow[] }) {
  if (rows.length === 0) return <span className="text-base-content/50">—</span>;
  return (
    <div className="flex flex-wrap gap-3">
      {rows.map((r, i) => (
        <div key={`${r.slug}-${i}`} className="group relative flex flex-col items-center gap-0.5">
          <Link href={`/items/${r.slug}`} aria-label={r.name} className="block">
            <ItemIcon name={r.name} icon={r.icon} size="recipe" />
          </Link>
          <span className="text-xs text-base-content/60">×{r.amount}</span>
          <span
            role="tooltip"
            aria-hidden="true"
            className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 whitespace-nowrap rounded-field border border-base-300 bg-base-100 px-2 py-1 text-xs text-base-content shadow-lg"
          >
            {r.name}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WorkbenchBadge({ recipe }: { recipe: RecipeCard }) {
  if (!recipe.workbench) return <span className="text-base-content/50">—</span>;
  return (
    <span className="badge badge-outline whitespace-nowrap">
      {recipe.workbench}{recipe.tier !== null ? ` · T${recipe.tier}` : ""}
    </span>
  );
}
