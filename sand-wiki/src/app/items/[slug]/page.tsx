import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemBySlug } from "@/lib/queries";
import { classifyTrades } from "@/lib/trades";
import { availableTabs, itemDetailRows, type TabId } from "@/lib/item-view";
import { CategoryTag } from "@/components/CategoryTag";
import { ItemIcon } from "@/components/ItemIcon";
import { StatBox, type ItemStats } from "@/components/StatBox";
import { rarityColor } from "@/lib/rarity";
import { ItemTabs, type Tab } from "@/components/ItemTabs";
import { ItemDetailsPanel } from "@/components/ItemDetailsPanel";
import { CraftTable } from "@/components/CraftTable";
import { UsedInTable } from "@/components/UsedInTable";
import { TradeTable } from "@/components/TradeTable";

type Params = Promise<{ slug: string }>;

export default async function ItemDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  const trades = classifyTrades(item.slug, item.craftedBy, item.usedIn);
  const { buy, sell, crafts, usedInCrafts } = trades;

  const tabContent: Record<TabId, React.ReactNode> = {
    "crafted-by": <CraftTable recipes={crafts} />,
    "used-in": <UsedInTable recipes={usedInCrafts} />,
    buy: <TradeTable options={buy} />,
    sell: <TradeTable options={sell} />,
  };
  const tabs: Tab[] = availableTabs(trades).map((t) => ({
    id: t.id,
    label: t.label,
    content: tabContent[t.id],
  }));

  const detailRows = itemDetailRows(
    {
      category: item.category,
      isResource: item.isResource,
      storageStack: item.storageStack,
      workbenchTier: item.workbenchTier,
    },
    trades,
  );

  return (
    <article className="py-6 space-y-6 max-w-5xl">
      <header className="flex flex-wrap items-start gap-4">
        <ItemIcon name={item.name} icon={item.icon} size="lg" rarity={item.rarity} />
        <div className="flex-1 min-w-[16rem] space-y-2">
          <h1 className="font-display text-3xl font-bold">{item.name}</h1>
          <div className="flex flex-wrap gap-2">
            {item.rarity && (
              <span className="badge badge-outline gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: rarityColor(item.rarity) ?? "transparent" }} aria-hidden="true" />
                {item.rarity}
              </span>
            )}
            <CategoryTag slug={item.category} />
            {buy.length > 0 && <span className="badge badge-success" aria-label="Buyable">◈ Buyable</span>}
            {sell.length > 0 && <span className="badge badge-warning" aria-label="Sellable">◈ Sellable</span>}
          </div>
          {item.description && <p className="text-base-content/80 max-w-prose">{item.description}</p>}
          <StatBox stats={item.stats as unknown as ItemStats | null} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px] items-start">
        <div className="min-w-0">
          {tabs.length === 0 ? (
            <p className="text-base-content/70">No crafting, usage, or trade data for this item.</p>
          ) : (
            <ItemTabs tabs={tabs} />
          )}
        </div>
        <ItemDetailsPanel rows={detailRows} />
      </div>

      <p><Link href="/items" className="btn btn-ghost btn-sm">← Back to items</Link></p>
    </article>
  );
}
