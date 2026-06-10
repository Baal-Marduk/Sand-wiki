import { ItemIconLink } from "@/components/ItemIconLink";
import type { RecipeCard, RecipeCardRow } from "@/lib/recipes";

export function IngredientList({ rows }: { rows: RecipeCardRow[] }) {
  if (rows.length === 0) return <span className="text-base-content/50">—</span>;
  return (
    <div className="flex flex-wrap gap-3">
      {rows.map((r, i) => (
        <ItemIconLink key={`${r.slug}-${i}`} slug={r.slug} name={r.name} icon={r.icon} amount={r.amount} />
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
