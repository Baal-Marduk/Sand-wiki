import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnvEntityBySlug, getItemIconMap } from "@/lib/queries";
import { ItemTabs, type Tab } from "@/components/ItemTabs";
import { LootTable, type LootEntry } from "@/components/LootTable";

type Params = Promise<{ slug: string }>;

interface LootShape { tiers?: { tier: string; columns?: string[]; entries: LootEntry[] }[] }

export default async function EnvEntityPage({ params }: { params: Params }) {
  const { slug } = await params;
  const entity = await getEnvEntityBySlug(slug);
  if (!entity) notFound();

  const tiers = (entity.loot as LootShape | null)?.tiers ?? [];
  const lootSlugs = [...new Set(tiers.flatMap((t) => t.entries.map((e) => e.slug).filter(Boolean)))] as string[];
  const icons = await getItemIconMap(lootSlugs);
  const tabs: Tab[] = tiers.map((t) => ({
    id: t.tier.toLowerCase().replace(/\s+/g, "-"),
    label: t.tier,
    content: <LootTable entries={t.entries} icons={icons} />,
  }));

  return (
    <article className="py-6 space-y-4 max-w-3xl">
      <p><Link href="/environment" className="btn btn-ghost btn-sm">← Environment</Link></p>
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
