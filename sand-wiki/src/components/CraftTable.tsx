import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";

export function CraftTable({ recipes }: { recipes: RecipeCard[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr><th>Ingredients</th><th>Time</th><th>Workbench</th></tr>
        </thead>
        <tbody>
          {recipes.map((r) => (
            <tr key={r.slug}>
              <td><IngredientList rows={r.inputs} /></td>
              <td className="whitespace-nowrap">{r.craftTimeSeconds !== null ? `${r.craftTimeSeconds} sec` : "—"}</td>
              <td><WorkbenchBadge recipe={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
