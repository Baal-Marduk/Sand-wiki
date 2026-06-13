import { notFound } from "next/navigation";
import { getItemBySlug, getCratesContaining, getAmmoByCaliber, getWeaponsByCaliber } from "@/lib/queries";
import { ammoCaliber, weaponCaliber, caliberLabel } from "@/lib/ammo";
import { classifyTrades } from "@/lib/trades";
import { availableTabs, itemDetailRows, type TabId } from "@/lib/item-view";
import { categoryLabel } from "@/lib/taxonomy";
import { rarityColor } from "@/lib/rarity";
import { EntityDetail } from "@/components/EntityDetail";
import { CategoryTag } from "@/components/CategoryTag";
import { itemStatCells } from "@/components/StatBox";
import { type Tab } from "@/components/ItemTabs";
import { CraftTable } from "@/components/CraftTable";
import { UsedInTable } from "@/components/UsedInTable";
import { CrateDropList } from "@/components/CrateDropList";
import { ItemLinkList } from "@/components/ItemLinkList";
import { getSession } from "@/lib/auth";

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
  const stats = item.itemStats;
  const caliber = isAmmo ? ammoCaliber(item.name) : weaponCaliber(item.slug, stats?.ammoName ?? null);
  const ammo = !isAmmo && caliber ? await getAmmoByCaliber(caliber) : [];
  const ammoUsers = isAmmo && caliber ? await getWeaponsByCaliber(caliber) : [];

  const canSuggest = !!(await getSession());
  const tabContent: Partial<Record<TabId, React.ReactNode>> = {
    "crafted-by": <CraftTable recipes={crafts} canSuggest={canSuggest} />,
    "used-in": <UsedInTable recipes={usedInCrafts} canSuggest={canSuggest} />,
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
      storageStack: stats?.storageStack ?? null,
      workbenchTier: stats?.workbenchTier ?? null,
      value: stats?.statValue ?? null,
    },
    trades,
  );

  return (
    <EntityDetail
      breadcrumb={[
        { label: "Items", href: "/items" },
        { label: categoryLabel(item.category), href: `/items?category=${item.category}` },
        { label: item.name },
      ]}
      suggest={{ type: "item", slug: item.slug }}
      canSuggest={canSuggest}
      icon={{ name: item.name, icon: item.icon, rarity: item.rarity }}
      title={item.name}
      badges={
        <>
          {item.rarity && (
            <span className="badge badge-outline gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: rarityColor(item.rarity) ?? "transparent" }}
                aria-hidden="true"
              />
              {item.rarity}
            </span>
          )}
          <CategoryTag slug={item.category} />
        </>
      }
      description={item.description}
      stats={itemStatCells(
        stats ?? { statType: null, damage: null, playerDamage: null, tramplerDamage: null, splashDamage: null, magazine: null },
        isAmmo ? caliberLabel(caliber) ?? undefined : undefined,
      )}
      detailRows={detailRows}
      tabs={tabs}
      tabsEmptyFallback={
        <p className="text-base-content/70">No crafting, usage, or trade data for this item.</p>
      }
    />
  );
}
