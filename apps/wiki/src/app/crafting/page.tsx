import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminBack } from "@/components/AdminBack";
import { CraftingBrowser, type CraftRecipe } from "./CraftingBrowser";

export const metadata = {
  title: "Crafting — Sand Help",
  robots: { index: false, follow: false },
};

export default async function CraftingPage() {
  await requireAdmin();

  const recipes = await prisma.recipe.findMany({
    include: {
      location: { select: { slug: true, name: true } },
      inputs: { include: { entity: { select: { slug: true, name: true, icon: true } } } },
      outputs: { include: { entity: { select: { slug: true, name: true, icon: true, category: true } } } },
    },
    orderBy: [{ tier: "asc" }],
  });

  const data: CraftRecipe[] = recipes.map((r) => ({
    id: r.id,
    category: r.outputs[0]?.entity.category ?? "Other",
    outputs: r.outputs.map((o) => ({ slug: o.entity.slug, name: o.entity.name, icon: o.entity.icon, amount: o.amount })),
    inputs: r.inputs.map((i) => ({ slug: i.entity.slug, name: i.entity.name, icon: i.entity.icon, amount: i.amount })),
    bench: r.workbench || r.location?.name || "—",
    benchSlug: r.location?.slug ?? null,
    tier: r.tier,
    time: r.craftTimeSeconds,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AdminBack />
      <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide text-primary">Crafting</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Admin · every recipe, grouped by item type — what it makes, ingredients, bench/location, tier and time.
      </p>
      <CraftingBrowser recipes={data} />
    </div>
  );
}
