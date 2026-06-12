import Link from "next/link";
import { notFound } from "next/navigation";
import { getTramplerPartBySlug } from "@/lib/queries";
import { ItemIcon } from "@/components/ItemIcon";
import { ItemIconLink } from "@/components/ItemIconLink";
import { CategoryTag } from "@/components/CategoryTag";
import { SuggestCorrectionLink } from "@/components/SuggestCorrectionLink";

type Params = Promise<{ slug: string }>;

export default async function TramplerPartPage({ params }: { params: Params }) {
  const { slug } = await params;
  const part = await getTramplerPartBySlug(slug);
  if (!part) notFound();

  const cost = part.costEntries;

  const stats: { label: string; value: React.ReactNode }[] = [];
  if (part.dimensions) stats.push({ label: "Dimensions", value: part.dimensions });
  if (part.health != null) stats.push({ label: "Health", value: part.health });
  if (part.weight != null) stats.push({ label: "Weight", value: part.weight });
  if (part.weightCapacity != null) stats.push({ label: "Weight Capacity", value: part.weightCapacity });
  if (part.weightCompensation != null) stats.push({ label: "Weight Compensation", value: part.weightCompensation });
  if (part.energyConsumption != null) stats.push({ label: "Energy Consumption", value: part.energyConsumption });
  if (part.energyCapacity != null) stats.push({ label: "Energy Capacity", value: part.energyCapacity });
  if (part.ratedPower != null) stats.push({ label: "Rated Power", value: part.ratedPower });
  if (part.crewSlots != null) stats.push({ label: "Crew Slots", value: part.crewSlots });
  if (part.itemSlots != null) stats.push({ label: "Item Slots", value: part.itemSlots });

  const research = [part.researchNode, part.researchName].filter(Boolean).join(". ");

  return (
    <article className="py-6 space-y-6 max-w-3xl">
      <div className="flex gap-2">
        <Link href="/tramplers" className="btn btn-ghost btn-sm">← Tramplers</Link>
        <SuggestCorrectionLink type="tramplerPart" slug={slug} />
      </div>
      <header className="flex flex-wrap items-start gap-4">
        <ItemIcon name={part.name} icon={part.icon} size="lg" decorative />
        <div className="flex-1 min-w-[16rem] space-y-2">
          <h1 className="font-display text-3xl font-bold">{part.name}</h1>
          <CategoryTag slug={part.category} />
          {part.description && <p className="text-base-content/80 max-w-prose">{part.description}</p>}
        </div>
      </header>

      {stats.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-base-300 rounded-box overflow-hidden">
          {stats.map((s) => (
            <div key={s.label} className="bg-base-200 px-3 py-2">
              <dt className="text-[0.65rem] uppercase tracking-wide text-base-content/60">{s.label}</dt>
              <dd className="font-medium">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(research || part.researchTier != null) && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-1">Research</h2>
          <p className="text-base-content/80">
            {research || "—"}
            {part.researchTier != null && <span className="badge badge-outline ml-2">Tier {part.researchTier}</span>}
          </p>
        </section>
      )}

      {cost.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-2">Build Cost</h2>
          <div className="flex flex-wrap gap-4">
            {cost.map((c) => (
              <ItemIconLink key={c.name} slug={c.item?.slug ?? undefined} name={c.name} icon={c.item?.icon ?? null} amount={c.amount} rarity={c.item?.rarity ?? null} />
            ))}
          </div>
        </section>
      )}

      {part.sourceUrl && (
        <p className="text-sm text-base-content/60">
          Source:{" "}
          <a href={part.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
            sandgame.wiki ↗
          </a>
        </p>
      )}
    </article>
  );
}
