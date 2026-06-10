import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow } from "@/components/SortableTable";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
// Sort token (not display text): a stable, monotonic key over (workbench, tier).
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function UsedInTable({ recipes }: { recipes: RecipeCard[] }) {
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.outputs), names(r.inputs), workbenchKey(r)],
    cells: [
      <IngredientList key="o" rows={r.outputs} />,
      <IngredientList key="i" rows={r.inputs} />,
      <WorkbenchBadge key="w" recipe={r} />,
    ],
  }));
  return (
    <SortableTable
      caption="Recipes that use this item"
      columns={[{ label: "Produces" }, { label: "Ingredients" }, { label: "Workbench" }]}
      rows={rows}
    />
  );
}
