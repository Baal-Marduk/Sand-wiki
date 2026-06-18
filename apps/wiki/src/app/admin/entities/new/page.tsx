import { requireAdmin } from "@/lib/auth";
import { CreateEntityForm } from "@/components/CreateEntityForm";
import { editableFields, type SelectOption } from "@/lib/proposal-schema";
import { ITEM_CATEGORY_SLUGS, ENV_CATEGORY_SLUGS, TRAMPLER_CATEGORY_SLUGS, categoryLabel } from "@/lib/taxonomy";
import { KNOWN_RARITY_NAMES } from "@/lib/rarity";

type Kind = "item" | "environment" | "trampler-part";

export const metadata = { title: "Add entity" };

export default async function NewEntityPage() {
  await requireAdmin();

  // Field definitions + category option lists per creatable kind, passed to the client form.
  const config = {
    item: { fields: editableFields("item"), categories: ITEM_CATEGORY_SLUGS },
    environment: { fields: editableFields("envEntity"), categories: ENV_CATEGORY_SLUGS },
    "trampler-part": { fields: editableFields("tramplerPart"), categories: TRAMPLER_CATEGORY_SLUGS },
  };
  const toOptions = (slugs: readonly string[]): SelectOption[] =>
    slugs.map((slug) => ({ value: slug, label: categoryLabel(slug) }));
  // Built explicitly (not via Object.fromEntries) so the compiler checks every Kind is
  // covered and no cast is needed.
  const categoryOptions: Record<Kind, SelectOption[]> = {
    item: toOptions(config.item.categories),
    environment: toOptions(config.environment.categories),
    "trampler-part": toOptions(config["trampler-part"].categories),
  };

  return (
    <article className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">Add entity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates a curated row immediately. Curated rows are never overwritten or pruned by a re-seed.
        </p>
      </div>
      <CreateEntityForm
        config={config}
        categoryOptions={categoryOptions}
        rarities={KNOWN_RARITY_NAMES.map((n) => ({ value: n, label: n }))}
      />
    </article>
  );
}
