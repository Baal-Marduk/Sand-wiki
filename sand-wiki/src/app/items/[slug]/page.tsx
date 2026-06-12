import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemBySlug, getCratesContaining, getAmmoByCaliber, getWeaponsByCaliber } from "@/lib/queries";
import { ammoCaliber, weaponCaliber, caliberLabel } from "@/lib/ammo";
import { classifyTrades } from "@/lib/trades";
import { availableTabs, itemDetailRows, type TabId } from "@/lib/item-view";
import { CategoryTag } from "@/components/CategoryTag";
import { ItemIcon } from "@/components/ItemIcon";
import { StatBox } from "@/components/StatBox";
import { rarityColor } from "@/lib/rarity";
import { ItemTabs, type Tab } from "@/components/ItemTabs";
import { ItemDetailsPanel } from "@/components/ItemDetailsPanel";
import { CraftTable } from "@/components/CraftTable";
import { UsedInTable } from "@/components/UsedInTable";
import { CrateDropList } from "@/components/CrateDropList";
import { ItemLinkList } from "@/components/ItemLinkList";
import { SuggestCorrectionLink } from "@/components/SuggestCorrectionLink";

type Params = Promise<{ slug: string }>;

export default async function ItemDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  const trades = classifyTrades(item.slug, item.craftedBy, item.usedIn);
  const { crafts, usedInCrafts } = trades;
  const drops = await getCratesContaining(item.slug);
  // Caliber family drives both directions: a weapon/turret lists every ammo of its
  // caliber; an ammo lists every weapon/turret of its caliber.
  const isAmmo = item.category === "ammo";
  const caliber = isAmmo ? ammoCaliber(item.name) : weaponCaliber(item.slug, item.ammoName);
  const ammo = !isAmmo && caliber ? await getAmmoByCaliber(caliber) : [];
  const ammoUsers = isAmmo && caliber ? await getWeaponsByCaliber(caliber) : [];

  const tabContent: Partial<Record<TabId, React.ReactNode>> = {
    "crafted-by": <CraftTable recipes={crafts} />,
    "used-in": <UsedInTable recipes={usedInCrafts} />,
  };
  const tabs: Tab[] = availableTabs(trades).map((t) => ({
    id: t.id,
    label: t.label,
    content: tabContent[t.id],
  }));
  if (ammo.length > 0) {
    tabs.push({ id: "ammo", label: "Ammo", content: <ItemLinkList items={ammo} /> });
  }
  if (ammoUsers.length > 0) {
    tabs.push({ id: "used-by", label: "Used by", content: <ItemLinkList items={ammoUsers} /> });
  }
  if (drops.length > 0) {
    tabs.push({ id: "loot", label: "Loot", content: <CrateDropList drops={drops} /> });
  }

  const detailRows = itemDetailRows(
    {
      category: item.category,
      storageStack: item.storageStack,
      workbenchTier: item.workbenchTier,
      value: item.statValue,
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
          </div>
          {item.description && <p className="text-base-content/80 max-w-prose">{item.description}</p>}
          <StatBox item={item} typeLabel={isAmmo ? caliberLabel(caliber) ?? undefined : undefined} />
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

      <div className="flex gap-2">
        <Link href="/items" className="btn btn-ghost btn-sm">← Back to items</Link>
        <SuggestCorrectionLink type="item" slug={item.slug} />
      </div>
    </article>
  );
}
