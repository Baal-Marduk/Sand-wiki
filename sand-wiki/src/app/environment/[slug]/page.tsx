import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnvEntityBySlug } from "@/lib/queries";
import { ItemTabs, type Tab } from "@/components/ItemTabs";
import { LootTable } from "@/components/LootTable";
import { byRarityThenName } from "@/lib/rarity";
import { SuggestCorrectionLink } from "@/components/SuggestCorrectionLink";

type Params = Promise<{ slug: string }>;

export default async function EnvEntityPage({ params }: { params: Params }) {
  const { slug } = await params;
  const entity = await getEnvEntityBySlug(slug);
  if (!entity) notFound();

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
    <article className="py-6 space-y-4 max-w-3xl">
      <div className="flex gap-2">
        <Link href="/environment" className="btn btn-ghost btn-sm">← Environment</Link>
        <SuggestCorrectionLink type="envEntity" slug={slug} />
      </div>
      <h1 className="font-display text-3xl font-bold">{entity.name}</h1>
      {entity.description &&
        entity.description.split(/\n+/).map((p, i) => (
          <p key={i} className="text-base-content/80">{p}</p>
        ))}
      {tabs.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-2">Loot</h2>
          <ItemTabs tabs={tabs} />
        </section>
      )}
      {entity.sourceUrl && (
        <p className="text-sm text-base-content/60">
          Source:{" "}
          <a href={entity.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
            sandgame.wiki ↗
          </a>
        </p>
      )}
    </article>
  );
}
