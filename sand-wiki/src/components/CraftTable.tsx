import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow } from "@/components/SortableTable";
import { SuggestRecipeLink } from "@/components/SuggestRecipeLink";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
// Sort token (not display text): a stable, monotonic key over (workbench, tier).
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function CraftTable({ recipes }: { recipes: RecipeCard[] }) {
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.inputs), r.craftTimeSeconds, workbenchKey(r), null],
    cells: [
      <IngredientList key="i" rows={r.inputs} />,
      <span key="t" className="whitespace-nowrap">{r.craftTimeSeconds !== null ? `${r.craftTimeSeconds} sec` : "—"}</span>,
      <WorkbenchBadge key="w" recipe={r} />,
      <SuggestRecipeLink key="e" slug={r.slug} />,
    ],
  }));
  return (
    <SortableTable
      caption="Recipes that craft this item"
      columns={[{ label: "Ingredients" }, { label: "Time" }, { label: "Workbench" }, { label: "Edit", alignRight: true }]}
      rows={rows}
    />
  );
}
