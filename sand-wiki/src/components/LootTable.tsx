import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";
import { SortableTable, type SortableTableRow, type SortColumn } from "@/components/SortableTable";
import { rarityColor } from "@/lib/rarity";
import type { LootEntryView } from "@/lib/loot";

const EM_DASH = "—";

/** Numeric sort token for a "min-max"/"n" range (uses the high end), null → sorts last. */
function rangeHigh(s: string | null): number | null {
  if (!s) return null;
  const nums = s.match(/\d+/g);
  if (!nums) return null;
  return Number(nums[nums.length - 1]);
}

/** Numeric sort token for a "50%" chance string. */
function pctValue(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** The dropped item: rarity-tinted icon + name, linked to the item/container when matched.
 *  Keeps the shared icon-tooltip pattern (name announced via the ItemIcon's role="img"). */
function ItemCell({ entry }: { entry: LootEntryView }) {
  const tint = rarityColor(entry.rarity);
  const label = (
    <span className="flex items-center gap-2.5">
      <ItemIcon name={entry.name} icon={entry.icon} size="recipe" rarity={entry.rarity} decorative />
      <span className="font-medium leading-tight" style={tint ? { color: tint } : undefined}>
        {entry.name}
      </span>
    </span>
  );
  return entry.href ? (
    <Link href={entry.href} className="group/loot inline-flex transition-opacity hover:opacity-90">
      <span className="border-b border-transparent group-hover/loot:border-current">{label}</span>
    </Link>
  ) : (
    label
  );
}

/** A quantity range as tabular mono digits; em-dash for legacy/empty rows. */
function Qty({ value }: { value: string | null }) {
  if (!value) return <span className="text-dim">{EM_DASH}</span>;
  return <span className="font-mono tabular-nums text-foreground">{value}</span>;
}

/** Storm quantity. When the storm yield beats the voyage yield, the cell is promoted with
 *  a warm "storm" accent, an up-arrow, and a ×bonus multiplier chip (tooltip on hover). */
function StormCell({ entry }: { entry: LootEntryView }) {
  if (!entry.storm) return <span className="text-dim">{EM_DASH}</span>;
  if (!entry.moreInStorm) {
    return <span className="font-mono tabular-nums text-foreground">{entry.storm}</span>;
  }
  return (
    <span className="group/storm relative inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <span className="font-mono tabular-nums font-semibold text-warning">{entry.storm}</span>
      <span
        aria-hidden="true"
        className="inline-flex items-center gap-0.5 border border-warning/40 bg-warning/10 px-1.5 py-px font-mono text-[10px] font-semibold leading-none text-warning"
      >
        <span className="text-[9px]">▲</span>
        {entry.stormBonus != null ? `×${entry.stormBonus}` : ""}
      </span>
      {entry.stormBonus != null && (
        <span
          role="tooltip"
          className="pointer-events-none invisible absolute bottom-full right-0 z-30 mb-2 whitespace-nowrap border border-border-strong bg-card-elevated px-2 py-1 text-xs text-foreground opacity-0 shadow-lg transition-opacity group-hover/storm:visible group-hover/storm:opacity-100 group-focus-within/storm:visible group-focus-within/storm:opacity-100"
        >
          {entry.stormBonus}× more in a storm
        </span>
      )}
    </span>
  );
}

/** One loot tier as a sortable table: the dropped item, its drop chance, and the
 *  per-voyage vs in-storm quantities — the storm column emphasised when it pays more.
 *  Legacy rows (null chance/quantities) render the item with em-dash cells. */
export function LootTable({ entries }: { entries: LootEntryView[] }) {
  if (entries.length === 0) return <p className="text-muted-foreground">{EM_DASH}</p>;

  const columns: SortColumn[] = [
    { label: "Item" },
    { label: "Chance", alignRight: true },
    { label: "Voyage", alignRight: true },
    { label: "Storm", alignRight: true },
  ];
  const rows: SortableTableRow[] = entries.map((e) => ({
    keys: [e.name.toLowerCase(), pctValue(e.chance), rangeHigh(e.voyage), rangeHigh(e.storm)],
    cells: [
      <ItemCell key="i" entry={e} />,
      e.chance
        ? <span key="c" className="font-mono tabular-nums text-muted-foreground">{e.chance}</span>
        : <span key="c" className="text-dim">{EM_DASH}</span>,
      <Qty key="v" value={e.voyage} />,
      <StormCell key="s" entry={e} />,
    ],
  }));
  return <SortableTable caption="Loot dropped in this tier" columns={columns} rows={rows} />;
}
