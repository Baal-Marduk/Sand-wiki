import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow } from "@/components/SortableTable";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function CraftTable({ recipes }: { recipes: RecipeCard[] }) {
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.inputs), r.craftTimeSeconds, workbenchKey(r)],
    cells: [
      <IngredientList key="i" rows={r.inputs} />,
      r.craftTimeSeconds !== null ? `${r.craftTimeSeconds} sec` : "—",
      <WorkbenchBadge key="w" recipe={r} />,
    ],
  }));
  return (
    <SortableTable
      caption="Recipes that craft this item"
      columns={[{ label: "Ingredients" }, { label: "Time" }, { label: "Workbench" }]}
      rows={rows}
    />
  );
}
