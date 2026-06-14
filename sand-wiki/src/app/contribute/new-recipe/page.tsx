import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { entityHref } from "@/lib/proposal-schema";
import { getRecipeWorkbenches } from "@/lib/proposal-entity";
import { submitNewRecipe } from "@/app/contribute/actions";
import { RecipeEditForm } from "@/components/RecipeEditForm";
import type { RecipeSnapshot } from "@/lib/recipe-proposal";

type SP = Promise<{ type?: string; slug?: string; side?: string }>;

export default async function NewRecipePage({ searchParams }: { searchParams: SP }) {
  const { type = "item", slug = "", side = "output" } = await searchParams;
  if (!slug) notFound();
  await requireUser(`/contribute/new-recipe?type=${type}&slug=${slug}&side=${side}`);

  const entity = await prisma.entity.findUnique({ where: { slug }, select: { slug: true, name: true } });
  if (!entity) notFound();

  const items = await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true }, orderBy: { name: "asc" } });
  const workbenches = await getRecipeWorkbenches();
  const back = entityHref(type, slug);

  // Pre-fill the originating entity on the relevant side.
  const seedLine = { slug: entity.slug, name: entity.name, amount: 1 };
  const snapshot: RecipeSnapshot = {
    workbench: null, tier: null, craftTimeSeconds: null,
    inputs: side === "input" ? [seedLine] : [],
    outputs: side === "output" ? [seedLine] : [],
  };

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-6">
      <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">Propose a new recipe — {entity.name}</h1>
      <p className="text-muted-foreground">Describe the recipe. An admin reviews every change before it goes live.</p>
      <RecipeEditForm
        snapshot={snapshot}
        items={items}
        workbenches={workbenches}
        backHref={back}
        action={submitNewRecipe}
        submitLabel="Submit new recipe"
        hiddenFields={{ backType: type, backSlug: slug }}
      />
    </article>
  );
}
