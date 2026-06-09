import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";
import type { RecipeCard, RecipeCardRow } from "@/lib/recipes";

export function IngredientList({ rows }: { rows: RecipeCardRow[] }) {
  if (rows.length === 0) return <span className="text-base-content/50">—</span>;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {rows.map((r, i) => (
        <span key={`${r.slug}-${i}`} className="inline-flex items-center gap-1">
          <ItemIcon name={r.name} icon={r.icon} size="sm" />
          <Link href={`/items/${r.slug}`} className="link">{r.name}</Link>
          <span className="text-xs text-base-content/60">×{r.amount}</span>
        </span>
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
