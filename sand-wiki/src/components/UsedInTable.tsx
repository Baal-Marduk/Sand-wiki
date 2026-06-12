import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow, type SortColumn } from "@/components/SortableTable";
import { SuggestRecipeLink } from "@/components/SuggestRecipeLink";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function UsedInTable({ recipes, canSuggest = false }: { recipes: RecipeCard[]; canSuggest?: boolean }) {
  const columns: SortColumn[] = [
    { label: "Produces" }, { label: "Ingredients" }, { label: "Workbench" },
    ...(canSuggest ? [{ label: "Edit", alignRight: true, sortable: false } as SortColumn] : []),
  ];
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.outputs), names(r.inputs), workbenchKey(r), ...(canSuggest ? [null] : [])],
    cells: [
      <IngredientList key="o" rows={r.outputs} />,
      <IngredientList key="i" rows={r.inputs} />,
      <WorkbenchBadge key="w" recipe={r} />,
      ...(canSuggest ? [<SuggestRecipeLink key="e" slug={r.slug} />] : []),
    ],
  }));
  return (
    <SortableTable caption="Recipes that use this item" columns={columns} rows={rows} />
  );
}
