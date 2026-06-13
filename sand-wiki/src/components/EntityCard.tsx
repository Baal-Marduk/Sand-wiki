import Link from "next/link";
import { rarityColor } from "@/lib/rarity";

export interface EntityStat {
  k: string;
  v: string;
}

export interface EntityCardData {
  slug: string;
  name: string;
  href: string;
  icon?: string | null;
  /** Rarity name → rail color + type-line dot + rarity label. */
  rarity?: string | null;
  /** Optional secondary label shown before the rarity in the type line (e.g. weapon class). */
  typeLabel?: string | null;
  /** Optional right-aligned key/value stats. */
  stats?: EntityStat[];
}

/** The workhorse browse card (items / tramplers / environments): rarity rail +
 *  neutral squared sprite tile + name/type + optional right-aligned stats. The
 *  rail carries the rarity color; the sprite tile stays neutral so names keep AA
 *  contrast and the grid reads calm (per the design deviation note). */
export function EntityCard({ entity }: { entity: EntityCardData }) {
  const color = rarityColor(entity.rarity);
  const railColor = color ?? "var(--border-strong)";
  const typeBits = [entity.typeLabel, entity.rarity].filter(Boolean).join(" · ");

  return (
    <li className="list-none">
      <Link
        href={entity.href}
        className="group grid grid-cols-[4px_64px_1fr_auto] overflow-hidden border border-border bg-card transition-colors hover:border-border-strong hover:bg-card-elevated"
      >
        <span aria-hidden className="block" style={{ background: railColor }} />
        <span className="grid size-16 place-items-center border-r border-border bg-card-elevated">
          {entity.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entity.icon}
              alt=""
              aria-hidden
              className="size-[80%] object-contain [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.45))]"
            />
          ) : (
            <span aria-hidden className="text-2xl text-dim">
              ▦
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col justify-center gap-1 px-3.5 py-2.5">
          <span className="truncate font-display text-base font-semibold leading-tight text-foreground group-hover:text-primary-hover">
            {entity.name}
          </span>
          {typeBits && (
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              {color && (
                <span aria-hidden className="size-[7px] shrink-0" style={{ background: color }} />
              )}
              {typeBits}
            </span>
          )}
        </span>
        {entity.stats && entity.stats.length > 0 && (
          <span className="flex flex-col items-end justify-center gap-1 border-l border-border px-3.5 py-2.5">
            {entity.stats.map((s) => (
              <span key={s.k} className="flex items-baseline gap-1.5 font-mono text-xs">
                <span className="text-[10px] uppercase tracking-[0.03em] text-muted-foreground">{s.k}</span>
                <span className="text-[13px] font-semibold text-foreground">{s.v}</span>
              </span>
            ))}
          </span>
        )}
      </Link>
    </li>
  );
}
