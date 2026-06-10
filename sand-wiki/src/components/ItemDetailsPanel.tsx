import type { DetailRow } from "@/lib/item-view";
import { CoinIcon } from "@/components/CoinIcon";

export function ItemDetailsPanel({ rows }: { rows: DetailRow[] }) {
  return (
    <aside className="card bg-base-200">
      <div className="card-body p-0">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-base-content/60 px-4 pt-3 pb-1">
          Details
        </h2>
        <table className="table table-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="text-base-content/70">{r.label}</td>
                <td className="text-right font-medium">
                  {r.value}{r.coin && <> <CoinIcon /></>}{r.unit && ` ${r.unit}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
