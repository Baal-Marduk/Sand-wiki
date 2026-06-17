import Link from "next/link";
import { ItemIconLink } from "@/components/ItemIconLink";
import { SortableTable, type SortableTableRow, type SortColumn } from "@/components/SortableTable";
import { techNodeOptionLabel } from "@/lib/tech-node-label";
import type { BuyOptionView } from "@/lib/buy-options";

const costNames = (o: BuyOptionView) => o.costs.map((c) => c.name).join(", ").toLowerCase();

/** Price components as recipe-style icon tiles (icon + ×amount below, linked to the item),
 *  with a "× N" note appended only when a purchase yields more than one. */
function PriceCell({ option }: { option: BuyOptionView }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {option.costs.map((c, i) => (
        <ItemIconLink
          key={`${c.slug ?? c.name}-${i}`}
          slug={c.slug ?? undefined}
          name={c.name}
          icon={c.icon}
          amount={c.amount}
          rarity={c.rarity}
        />
      ))}
      {option.yield > 1 && (
        <span className="self-center whitespace-nowrap font-mono text-xs text-muted-foreground">→ ×{option.yield}</span>
      )}
    </div>
  );
}

/** The unlocking tech node as a bordered badge (tier + letter), linking to the tech tree. */
function UnlockCell({ unlock }: { unlock: BuyOptionView["unlock"] }) {
  if (!unlock) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      href={`/tech?select=${unlock.slug}`}
      className="inline-flex items-center whitespace-nowrap border border-border-strong bg-card-elevated px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground hover:text-foreground"
    >
      {techNodeOptionLabel({ name: unlock.name, slug: unlock.slug, tier: null })}
    </Link>
  );
}

/** An item's buy options as a crafted-by-style sortable table: one row per option,
 *  Price (icon + ×amount tiles) and the optional Unlocked-by tech badge. */
export function BuyOptions({ options }: { options: BuyOptionView[] }) {
  if (options.length === 0) return null;
  const columns: SortColumn[] = [{ label: "Price" }, { label: "Unlocked by" }];
  const rows: SortableTableRow[] = options.map((o) => ({
    keys: [costNames(o), o.unlock ? o.unlock.name.toLowerCase() : null],
    cells: [<PriceCell key="p" option={o} />, <UnlockCell key="u" unlock={o.unlock} />],
  }));
  return <SortableTable caption="Ways to buy this item" columns={columns} rows={rows} />;
}
