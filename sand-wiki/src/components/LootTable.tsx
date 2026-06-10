import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";

export interface LootEntry { slug?: string; name: string; values: string[] }

/** One tier's loot: an Item column (icon + linked name when matched) plus the tier table's
 *  dynamic amount columns. */
export function LootTable({ columns, entries }: { columns: string[]; entries: LootEntry[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Item</th>
          {columns.map((c) => <th key={c}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={`${e.slug ?? e.name}-${i}`}>
            <td>
              <span className="inline-flex items-center gap-2">
                <ItemIcon name={e.name} size="recipe" decorative />
                {e.slug
                  ? <Link href={`/items/${e.slug}`} className="link">{e.name}</Link>
                  : <span>{e.name}</span>}
              </span>
            </td>
            {columns.map((c, ci) => (
              <td key={c} className="whitespace-nowrap">{e.values[ci] ?? "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
