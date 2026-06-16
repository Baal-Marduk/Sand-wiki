import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { entityHref } from "@/lib/proposal-schema";
import { getRecipeWorkbenches } from "@/lib/proposal-entity";
import { submitNewRecipe } from "@/app/contribute/actions";
import { RecipeEditForm } from "@/components/RecipeEditForm";
import type { RecipeSnapshot } from "@/lib/recipe-proposal";

type SP = Promise<{ type?: string; slug?: string; side?: string; location?: string }>;

export default async function NewRecipePage({ searchParams }: { searchParams: SP }) {
  const { type = "item", slug = "", side = "output", location } = await searchParams;
  if (!slug) notFound();
  await requireUser(`/contribute/new-recipe?type=${type}&slug=${slug}&side=${side}${location ? `&location=${location}` : ""}`);

  const entity = await prisma.entity.findUnique({ where: { slug }, select: { slug: true, name: true } });
  if (!entity) notFound();

  const items = await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true, rarity: true, icon: true, category: true }, orderBy: { name: "asc" } });
  const workbenches = await getRecipeWorkbenches();
  const back = entityHref(type, slug);

  // A location recipe carries its location as a hidden field and seeds no line.
  // A normal recipe pre-fills the originating item on the relevant side.
  const seedLine = { slug: entity.slug, name: entity.name, amount: 1 };
  const snapshot: RecipeSnapshot = location
    ? { workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] }
    : {
        workbench: null, tier: null, craftTimeSeconds: null,
        inputs: side === "input" ? [seedLine] : [],
        outputs: side === "output" ? [seedLine] : [],
      };
  const hiddenFields: Record<string, string> = location
    ? { backType: type, backSlug: slug, locationSlug: location }
    : { backType: type, backSlug: slug };
  const heading = location ? `Propose a new recipe made at ${entity.name}` : `Propose a new recipe — ${entity.name}`;

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-6">
      <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">{heading}</h1>
      <p className="text-muted-foreground">Describe the recipe. An admin reviews every change before it goes live.</p>
      <RecipeEditForm
        snapshot={snapshot}
        items={items}
        workbenches={workbenches}
        backHref={back}
        action={submitNewRecipe}
        submitLabel="Submit new recipe"
        hiddenFields={hiddenFields}
      />
    </article>
  );
}
