import Link from "next/link";
import { type TradeOption, formatCrowns, formatUnitPrice } from "@/lib/trades";

const VERB = { buy: "Buy", sell: "Sell" } as const;

export function TradeSection({ kind, options }: { kind: "buy" | "sell"; options: TradeOption[] }) {
  if (options.length === 0) return null;
  const verb = VERB[kind];
  return (
    <section>
      <h2 className="font-display text-xl font-semibold mb-2">{verb}</h2>
      <ul className="space-y-2">
        {options.map((o) => (
          <li
            key={o.recipeSlug}
            className="card bg-base-200 flex-row flex-wrap items-center gap-3 p-3 text-sm"
          >
            <span>
              {verb} <span className="font-medium">{o.quantity}×</span> for{" "}
              <span className="font-semibold">{formatCrowns(o.totalCrowns)} crowns</span>
              <span aria-hidden="true"> ◈</span>
            </span>
            <span className="text-base-content/70">{formatUnitPrice(o.unitPrice)} crowns each</span>
            {o.isBest && <span className="badge badge-success badge-sm ml-auto">Best</span>}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-base-content/60">
        Priced in <Link href="/items/coin-crown" className="link">Coin Crown</Link>.
      </p>
    </section>
  );
}
