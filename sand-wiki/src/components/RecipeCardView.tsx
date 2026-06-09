import Link from "next/link";
import type { RecipeCard, RecipeCardRow } from "@/lib/recipes";

function RecipeLines({ rows }: { rows: RecipeCardRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-base-content/60">None</p>;
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.slug}>
          <span className="badge badge-ghost badge-sm mr-2">{r.amount}×</span>
          <Link className="link" href={`/items/${r.slug}`}>{r.name}</Link>
        </li>
      ))}
    </ul>
  );
}

export function RecipeCardView({ recipe }: { recipe: RecipeCard }) {
  return (
    <div className="card bg-base-200">
      <div className="card-body p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center text-sm">
          {recipe.workbench && (
            <span className="badge badge-outline">
              {recipe.workbench}{recipe.tier !== null ? ` · Tier ${recipe.tier}` : ""}
            </span>
          )}
          {recipe.craftTimeSeconds !== null && (
            <span className="badge badge-ghost">{recipe.craftTimeSeconds}s craft</span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium mb-1">Inputs</h3>
            <RecipeLines rows={recipe.inputs} />
          </div>
          <div>
            <h3 className="text-sm font-medium mb-1">Outputs</h3>
            <RecipeLines rows={recipe.outputs} />
          </div>
        </div>
      </div>
    </div>
  );
}
