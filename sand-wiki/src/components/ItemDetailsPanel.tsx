import type { DetailRow } from "@/lib/item-view";
import { CoinIcon } from "@/components/CoinIcon";

/** Facts panel for the EntityDetail sidebar: a "Details" title over label/value
 *  rows. Coin-suffixed rows render the Crowns sprite; unit-suffixed rows append
 *  their unit. */
export function ItemDetailsPanel({ rows }: { rows: DetailRow[] }) {
  return (
    <div>
      <h2 className="mb-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Details
      </h2>
      <dl className="text-[13px]">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
          >
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="text-right font-medium text-foreground">
              {r.value}
              {r.coin && (
                <>
                  {" "}
                  <CoinIcon />
                </>
              )}
              {r.unit && ` ${r.unit}`}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
