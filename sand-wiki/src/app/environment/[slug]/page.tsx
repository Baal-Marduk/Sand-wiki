import { notFound } from "next/navigation";
import { getEnvEntityBySlug } from "@/lib/queries";
import { categoryLabel } from "@/lib/taxonomy";
import { byRarityThenName } from "@/lib/rarity";
import { EntityDetail } from "@/components/EntityDetail";
import { CategoryTag } from "@/components/CategoryTag";
import { LootTable } from "@/components/LootTable";
import { type Tab } from "@/components/ItemTabs";
import { getSession } from "@/lib/auth";

type Params = Promise<{ slug: string }>;

export default async function EnvEntityPage({ params }: { params: Params }) {
  const { slug } = await params;
  const entity = await getEnvEntityBySlug(slug);
  if (!entity) notFound();

  const canSuggest = !!(await getSession());
  const tabs: Tab[] = entity.lootTiers.map((t) => ({
    id: t.tier.toLowerCase().replace(/\s+/g, "-"),
    label: t.tier,
    content: (
      <LootTable
        entries={t.entries
          .map((e) => ({ slug: e.item?.slug ?? null, name: e.name, icon: e.item?.icon ?? null, rarity: e.item?.rarity ?? null }))
          .sort(byRarityThenName)}
      />
    ),
  }));

  return (
    <EntityDetail
      breadcrumb={[
        { label: "Environment", href: "/environment" },
        { label: categoryLabel(entity.category), href: `/environment?category=${entity.category}` },
        { label: entity.name },
      ]}
      suggest={{ type: "envEntity", slug }}
      canSuggest={canSuggest}
      icon={{ name: entity.name, icon: entity.icon, decorative: true }}
      title={entity.name}
      badges={<CategoryTag slug={entity.category} />}
      description={entity.description}
      tabs={tabs}
      sourceUrl={entity.sourceUrl}
    />
  );
}
