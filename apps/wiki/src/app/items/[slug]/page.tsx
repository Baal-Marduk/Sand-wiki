import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemBySlug, getCratesContaining, getAmmoByCaliber, getWeaponsByCaliber, getUnlockingNode, getKeyUsage, getBuyOptions } from "@/lib/queries";
import { entityHref } from "@/lib/entity-links";
import { metaDescription } from "@/lib/site";
import { caliberLabel } from "@/lib/ammo";
import { classifyTrades } from "@/lib/trades";
import { availableTabs, itemDetailRows, type TabId } from "@/lib/item-view";
import { pricedOptions } from "@/lib/buy-options";
import { categoryLabel } from "@/lib/taxonomy";
import { EntityDetail } from "@/components/EntityDetail";
import { actionButtonClass } from "@/components/ui/button";
import { CategoryTag } from "@/components/CategoryTag";
import { RarityBadge } from "@/components/RarityBadge";
import { itemStatCells, EMPTY_ITEM_STATS } from "@/components/StatBox";
import { type Tab } from "@/components/ItemTabs";
import { CraftTable } from "@/components/CraftTable";
import { UsedInTable } from "@/components/UsedInTable";
import { CrateDropList } from "@/components/CrateDropList";
import { ItemLinkList } from "@/components/ItemLinkList";
import { KeyLinksTable } from "@/components/KeyLinksTable";
import { sessionIsAdmin } from "@/lib/auth";
import { AdminEntityControls } from "@/components/AdminEntityControls";
import { BuyOptions } from "@/components/BuyOptions";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) return {};
  const description = metaDescription(
    item.description,
    `${item.name} — stats, crafting, and where to find it in SAND: Raiders of Sophie.`,
  );
  const canonical = `/items/${item.slug}`;
  return {
    title: item.name,
    description,
    alternates: { canonical },
    openGraph: {
      title: item.name,
      description,
      url: canonical,
      images: item.icon ? [{ url: item.icon }] : undefined,
    },
  };
}

export default async function ItemDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  const admin = await sessionIsAdmin();
  if (item.disabled && !admin) notFound();

  const techNode = await getUnlockingNode(slug);

  const trades = classifyTrades(item.slug, item.craftedBy, item.usedIn);
  const { crafts, usedInCrafts } = trades;
  const drops = await getCratesContaining(item.slug);
  const keyUsage = await getKeyUsage(item.slug);
  // Caliber family drives both directions: a weapon/turret lists every ammo of its
  // caliber; an ammo lists every weapon/turret of its caliber.
  const isAmmo = item.category === "ammo";
  const stats = item.itemStats;
  const caliber = stats?.ammoType ?? null;
  const ammo = !isAmmo && caliber ? await getAmmoByCaliber(caliber) : [];
  const ammoUsers = isAmmo && caliber ? await getWeaponsByCaliber(caliber) : [];

  const buyOptions = await getBuyOptions(slug);
  const priced = pricedOptions(buyOptions);
  const tabContent: Partial<Record<TabId, React.ReactNode>> = {
    buy: <BuyOptions options={priced} />,
    "crafted-by": <CraftTable recipes={crafts} />,
    "used-in": <UsedInTable recipes={usedInCrafts} />,
  };
  const tabs: Tab[] = availableTabs(trades, priced.length > 0).map((t) => ({
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
  if (keyUsage.opens.length > 0 || keyUsage.rewardedBy.length > 0) {
    const toLoc = (l: typeof keyUsage.opens[number]) => ({
      href: entityHref("environment", l.slug), name: l.name, icon: l.icon, rarity: l.rarity, categorySlug: l.category,
    });
    tabs.push({
      id: "keys",
      label: "Keys",
      content: <KeyLinksTable sections={[
        { label: "Opens", rows: keyUsage.opens.map(toLoc) },
        { label: "Rewarded by", rows: keyUsage.rewardedBy.map(toLoc) },
      ]} />,
    });
  }
  if (drops.length > 0) {
    tabs.push({ id: "loot", label: "Loot", content: <CrateDropList drops={drops} /> });
  }

  const detailRows = itemDetailRows({
    category: item.category,
    storageStack: stats?.storageStack ?? null,
    workbenchTier: stats?.workbenchTier ?? null,
    value: stats?.statValue ?? null,
  });

  return (
    <EntityDetail
      breadcrumb={[
        { label: "Items", href: "/items" },
        { label: categoryLabel(item.category), href: `/items?category=${item.category}` },
        { label: item.name },
      ]}
      icon={{ name: item.name, icon: item.icon, rarity: item.rarity }}
      title={item.name}
      badges={
        <>
          {item.rarity && <RarityBadge rarity={item.rarity} />}
          <CategoryTag slug={item.category} />
          {techNode && (
            <Link href={`/tech?select=${techNode.slug}`} className={actionButtonClass}>
              Show in tech tree
            </Link>
          )}
        </>
      }
      description={item.description}
      stats={itemStatCells(
        stats ?? EMPTY_ITEM_STATS,
        isAmmo ? caliberLabel(caliber) ?? undefined : undefined,
      )}
      detailRows={detailRows}
      disabled={item.disabled}
      adminControls={
        admin ? (
          <AdminEntityControls slug={item.slug} icon={item.icon} imageAlt={item.imageAlt} disabled={item.disabled} />
        ) : undefined
      }
      tabs={tabs}
      tabsEmptyFallback={
        <p className="text-muted-foreground">No crafting, usage, or trade data for this item.</p>
      }
    />
  );
}
