import { notFound } from "next/navigation";
import { getEnvEntityBySlug, getLastEditor } from "@/lib/queries";
import { editorDisplayName } from "@/lib/steam";
import { lootEntryView } from "@/lib/loot";
import { groupLootByTier, type LinkRow } from "@/lib/entity-links";
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
  const editor = await getLastEditor("envEntity", slug);
  const lootRows: LinkRow[] = entity.outgoingLinks.map((l) => ({
    targetSlug: l.target?.slug ?? null,
    targetKind: l.target?.kind ?? null,
    name: l.name,
    icon: l.target?.icon ?? null,
    rarity: l.target?.rarity ?? null,
    amount: l.amount,
    tier: l.tier,
    value1: l.value1,
    sortOrder: l.sortOrder,
  }));
  // One tab per loot tier (Normal / Rare / …); environments with no tiered loot
  // simply have no tabs.
  const tierGroups = groupLootByTier(lootRows);
  const tabs: Tab[] = tierGroups.map((g) => ({
    id: `loot-${g.tier || "all"}`,
    label: g.tier || "Loot",
    content: <LootTable entries={g.rows.map(lootEntryView).sort(byRarityThenName)} />,
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
      lastEditedBy={editor ? { steamId: editor.steamId, name: editorDisplayName(editor.personaName) } : null}
      tabs={tabs}
      sourceUrl={entity.sourceUrl}
    />
  );
}
