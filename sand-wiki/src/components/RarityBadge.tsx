import { rarityColor } from "@/lib/rarity";

/** Outline pill with a rarity-colored dot. Mirrors CategoryTag so the two read as a pair. */
export function RarityBadge({ rarity, size }: { rarity: string; size?: "sm" }) {
  return (
    <span className={`badge badge-outline gap-1.5 ${size === "sm" ? "badge-sm" : ""}`}>
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: rarityColor(rarity) ?? "transparent" }}
        aria-hidden="true"
      />
      {rarity}
    </span>
  );
}
