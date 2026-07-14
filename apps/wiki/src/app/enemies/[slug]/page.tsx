import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEnemyBySlug } from "@/lib/queries";
import { metaDescription } from "@/lib/site";
import { lootEntryView } from "@/lib/loot";
import { groupLootByTier, type LinkRow } from "@/lib/entity-links";
import { categoryLabel } from "@/lib/taxonomy";
import { byRarityThenName } from "@/lib/rarity";
import { enemyStatCells } from "@/lib/enemy-view";
import { EntityDetail } from "@/components/EntityDetail";
import { CategoryTag } from "@/components/CategoryTag";
import { LootTable } from "@/components/LootTable";
import { type Tab } from "@/components/ItemTabs";
import { sessionIsAdmin } from "@/lib/auth";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const entity = await getEnemyBySlug(slug);
  if (!entity) return {};
  const description = metaDescription(
    entity.description,
    `${entity.name} — enemy stats and loot drops in SAND: Raiders of Sophie.`,
  );
  const canonical = `/enemies/${entity.slug}`;
  return {
    title: entity.name,
    description,
    alternates: { canonical },
    openGraph: {
      title: entity.name,
      description,
      url: canonical,
      images: entity.icon ? [{ url: entity.icon }] : undefined,
    },
  };
}

export default async function EnemyPage({ params }: { params: Params }) {
  const { slug } = await params;
  const entity = await getEnemyBySlug(slug);
  if (!entity) notFound();

  const admin = await sessionIsAdmin();
  if (entity.disabled && !admin) notFound();

  const lootRows: LinkRow[] = entity.outgoingLinks.map((l) => ({
    targetSlug: l.target?.slug ?? null,
    targetKind: l.target?.kind ?? null,
    name: l.target?.name ?? l.name,
    icon: l.target?.icon ?? null,
    rarity: l.target?.rarity ?? null,
    amount: l.amount,
    tier: l.tier,
    value1: l.value1,
    value2: l.value2,
    value3: l.value3,
    sortOrder: l.sortOrder,
  }));

  const tierGroups = groupLootByTier(lootRows);
  const tabs: Tab[] = tierGroups.map((g) => ({
    id: `loot-${g.tier || "all"}`,
    label: g.tier || "Loot",
    content: <LootTable entries={g.rows.map(lootEntryView).sort(byRarityThenName)} />,
  }));

  const stats = enemyStatCells(entity.enemyStats?.variants ?? []);

  return (
    <EntityDetail
      breadcrumb={[
        { label: "Enemies", href: "/enemies" },
        { label: categoryLabel(entity.category), href: `/enemies?category=${entity.category}` },
        { label: entity.name },
      ]}
      icon={{ name: entity.name, icon: entity.icon, decorative: true, categorySlug: entity.category }}
      title={entity.name}
      badges={<CategoryTag slug={entity.category} />}
      description={entity.description}
      stats={stats}
      disabled={entity.disabled}
      tabs={tabs}
      sourceUrl={entity.sourceUrl}
    />
  );
}
