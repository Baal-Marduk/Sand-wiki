import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { entityHref } from "@/lib/proposal-schema";
import { getRecipeWorkbenches } from "@/lib/proposal-entity";
import { recipeToSnapshot } from "@/lib/recipe-proposal";
import { RecipeEditForm } from "@/components/RecipeEditForm";

type SP = Promise<{ slug?: string }>;

export default async function EditRecipePage({ searchParams }: { searchParams: SP }) {
  const { slug = "" } = await searchParams;
  if (!slug) notFound();
  await requireUser(`/contribute/edit-recipe?slug=${slug}`);

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: {
      inputs: { include: { entity: { select: { slug: true, name: true } } } },
      outputs: { include: { entity: { select: { slug: true, name: true } } } },
    },
  });
  if (!recipe) notFound();

  const snapshot = recipeToSnapshot(recipe);
  const items = await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true }, orderBy: { name: "asc" } });
  const workbenches = await getRecipeWorkbenches();
  const primaryOutput = snapshot.outputs[0];
  const title = primaryOutput?.name ?? slug;
  const backHref = primaryOutput ? entityHref("item", primaryOutput.slug) : "/items";

  return (
    <article className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">
          Suggest a recipe correction — {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the workbench, timing, ingredients, or outputs. An admin reviews every change before it goes live.
        </p>
      </div>
      <RecipeEditForm slug={slug} snapshot={snapshot} items={items} workbenches={workbenches} backHref={backHref} />
    </article>
  );
}
