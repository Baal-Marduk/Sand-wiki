import { notFound } from "next/navigation";
import { getTramplerPartBySlug } from "@/lib/queries";
import { categoryLabel } from "@/lib/taxonomy";
import { tramplerStatCells, tramplerDetailRows } from "@/lib/trampler-view";
import { EntityDetail } from "@/components/EntityDetail";
import { CategoryTag } from "@/components/CategoryTag";
import { ItemIconLink } from "@/components/ItemIconLink";
import { type Tab } from "@/components/ItemTabs";

type Params = Promise<{ slug: string }>;

export default async function TramplerPartPage({ params }: { params: Params }) {
  const { slug } = await params;
  const part = await getTramplerPartBySlug(slug);
  if (!part) notFound();

  const cost = part.costEntries;

  const tabs: Tab[] = [];
  if (cost.length > 0) {
    tabs.push({
      id: "build-cost",
      label: "Build Cost",
      content: (
        <div className="flex flex-wrap gap-4">
          {cost.map((c) => (
            <ItemIconLink
              key={c.name}
              slug={c.item?.slug ?? undefined}
              name={c.name}
              icon={c.item?.icon ?? null}
              amount={c.amount}
              rarity={c.item?.rarity ?? null}
            />
          ))}
        </div>
      ),
    });
  }

  return (
    <EntityDetail
      breadcrumb={[
        { label: "Tramplers", href: "/tramplers" },
        { label: categoryLabel(part.category), href: `/tramplers?category=${part.category}` },
        { label: part.name },
      ]}
      suggest={{ type: "tramplerPart", slug }}
      icon={{ name: part.name, icon: part.icon, decorative: true }}
      title={part.name}
      badges={<CategoryTag slug={part.category} />}
      description={part.description}
      stats={tramplerStatCells(part)}
      detailRows={tramplerDetailRows(part)}
      tabs={tabs}
      sourceUrl={part.sourceUrl}
    />
  );
}
