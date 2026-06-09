import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";

export function UsedInTable({ recipes }: { recipes: RecipeCard[] }) {
  return (
    <table className="table">
      <thead>
        <tr><th>Produces</th><th>Ingredients</th><th>Workbench</th></tr>
      </thead>
      <tbody>
        {recipes.map((r) => (
          <tr key={r.slug}>
            <td><IngredientList rows={r.outputs} /></td>
            <td><IngredientList rows={r.inputs} /></td>
            <td><WorkbenchBadge recipe={r} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
