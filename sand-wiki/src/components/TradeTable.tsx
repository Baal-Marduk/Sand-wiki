import { type TradeOption, formatCrowns, formatUnitPrice } from "@/lib/trades";

export function TradeTable({ options }: { options: TradeOption[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr><th>Quantity</th><th>Price</th><th>Per unit</th></tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr key={o.recipeSlug}>
              <td className="whitespace-nowrap">×{o.quantity}</td>
              <td className="whitespace-nowrap">{formatCrowns(o.totalCrowns)} ◈</td>
              <td className="whitespace-nowrap">
                {formatUnitPrice(o.unitPrice)} ◈
                {o.isBest && <span className="badge badge-success badge-sm ml-2">Best</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
