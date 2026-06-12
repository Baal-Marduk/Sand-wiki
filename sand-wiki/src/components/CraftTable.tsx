import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow, type SortColumn } from "@/components/SortableTable";
import { SuggestRecipeLink } from "@/components/SuggestRecipeLink";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
// Sort token (not display text): a stable, monotonic key over (workbench, tier).
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function CraftTable({ recipes, canSuggest = false }: { recipes: RecipeCard[]; canSuggest?: boolean }) {
  const columns: SortColumn[] = [
    { label: "Ingredients" }, { label: "Time" }, { label: "Workbench" },
    ...(canSuggest ? [{ label: "Edit", alignRight: true, sortable: false } as SortColumn] : []),
  ];
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.inputs), r.craftTimeSeconds, workbenchKey(r), ...(canSuggest ? [null] : [])],
    cells: [
      <IngredientList key="i" rows={r.inputs} />,
      <span key="t" className="whitespace-nowrap">{r.craftTimeSeconds !== null ? `${r.craftTimeSeconds} sec` : "—"}</span>,
      <WorkbenchBadge key="w" recipe={r} />,
      ...(canSuggest ? [<SuggestRecipeLink key="e" slug={r.slug} />] : []),
    ],
  }));
  return (
    <SortableTable caption="Recipes that craft this item" columns={columns} rows={rows} />
  );
}
