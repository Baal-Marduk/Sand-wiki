import { rarityColor } from "@/lib/rarity";

/** Outline badge in the rarity color with a matching dot. Reads as a pair with
 *  CategoryTag. The rarity color passes AA on dark surfaces as border/text. */
export function RarityBadge({ rarity, size }: { rarity: string; size?: "sm" }) {
  const color = rarityColor(rarity) ?? "var(--muted-foreground)";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border font-mono font-bold uppercase tracking-[0.06em] ${
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      }`}
      style={{ color, borderColor: color }}
    >
      <span className="size-[7px] shrink-0" style={{ background: color }} aria-hidden="true" />
      {rarity}
    </span>
  );
}
