import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge, LocationLink } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow, type SortColumn } from "@/components/SortableTable";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
// Sort token (not display text): a stable, monotonic key over (location | workbench, tier).
const sourceKey = (r: RecipeCard) =>
  r.location ? `@${r.location.name}` : r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function CraftTable({ recipes }: { recipes: RecipeCard[] }) {
  const columns: SortColumn[] = [
    { label: "Ingredients" }, { label: "Time" }, { label: "Source" },
  ];
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.inputs), r.craftTimeSeconds, sourceKey(r)],
    cells: [
      <IngredientList key="i" rows={r.inputs} />,
      <span key="t" className="whitespace-nowrap">{r.craftTimeSeconds !== null ? `${r.craftTimeSeconds} sec` : "—"}</span>,
      r.location
        ? <LocationLink key="s" location={r.location} />
        : <WorkbenchBadge key="s" recipe={r} />,
    ],
  }));
  return (
    <SortableTable caption="Recipes that craft this item" columns={columns} rows={rows} />
  );
}
