import { ItemIconLink } from "@/components/ItemIconLink";
import type { RecipeCard, RecipeCardRow } from "@/lib/recipes";

export function IngredientList({ rows }: { rows: RecipeCardRow[] }) {
  if (rows.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-3">
      {rows.map((r, i) => (
        <ItemIconLink key={`${r.slug}-${i}`} slug={r.slug} name={r.name} icon={r.icon} amount={r.amount} rarity={r.rarity} />
      ))}
    </div>
  );
}

export function WorkbenchBadge({ recipe }: { recipe: RecipeCard }) {
  if (!recipe.workbench) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center whitespace-nowrap border border-border-strong bg-card-elevated px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
      {recipe.workbench}{recipe.tier !== null ? ` · T${recipe.tier}` : ""}
    </span>
  );
}
