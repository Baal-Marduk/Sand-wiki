import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";
import { CoinIcon } from "@/components/CoinIcon";
import { formatCrowns, CURRENCY_SLUG } from "@/lib/trades";
import type { BuyOptionView } from "@/lib/buy-options";

/** Renders an item's buy options as a card list. Each card: the price components
 *  (icon + amount, joined with +), the yield ("You receive: N×"), and an optional
 *  "Unlocked by" chip linking to the tech page. */
export function BuyOptions({ options, itemName }: { options: BuyOptionView[]; itemName: string }) {
  if (options.length === 0) return null;
  return (
    <ul className="space-y-3">
      {options.map((o) => (
        <li key={o.group} className="border border-border bg-card p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Option {o.group + 1}</div>
          <div className="flex flex-wrap items-center gap-2">
            {o.costs.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 border border-border bg-background px-2 py-1 text-sm">
                {c.slug === CURRENCY_SLUG
                  ? <><span>{formatCrowns(c.amount)}</span><CoinIcon /></>
                  : <><ItemIcon name={c.name} size="sm" decorative icon={c.icon} rarity={c.rarity} /> <span>{c.amount}× {c.name}</span></>}
                {i < o.costs.length - 1 && <span className="ml-1 text-muted-foreground">+</span>}
              </span>
            ))}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">You receive: {o.yield}× {itemName}</div>
          {o.unlock && (
            <Link href={`/tech?select=${o.unlock.slug}`} className="mt-2 inline-flex items-center gap-1.5 border border-dashed border-primary/50 px-2 py-1 text-xs text-primary">
              Unlocked by: {o.unlock.name}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
