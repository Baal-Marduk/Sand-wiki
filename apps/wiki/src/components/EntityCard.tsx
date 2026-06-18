import Link from "next/link";
import { rarityColor, rarityGradient } from "@/lib/rarity";
import { categoryColor } from "@/lib/taxonomy";
import { CategoryIcon } from "@/components/CategoryIcon";

/** Neutral inventory slot for icons with no rarity — matches ItemIcon. */
const NEUTRAL_SLOT = "linear-gradient(135deg, #2A2E37 0%, #181B22 45%, #11131A 100%)";

export interface EntityStat {
  k: string;
  v: string;
}

export interface EntityCardData {
  slug: string;
  name: string;
  href: string;
  icon?: string | null;
  /** When `icon` is missing, falls back to this category's glyph (e.g. a chest for
   *  loot containers) instead of the generic ▦. */
  categorySlug?: string | null;
  /** Rarity name → rail color + type-line dot + rarity label. */
  rarity?: string | null;
  /** Optional secondary label shown before the rarity in the type line (e.g. weapon class). */
  typeLabel?: string | null;
  /** Optional right-aligned key/value stats. */
  stats?: EntityStat[];
  /** Admin browse only: marks the row as admin-hidden. */
  disabled?: boolean;
}

/** The workhorse browse card (items / tramplers / environments): rarity rail +
 *  rarity-gradient sprite tile + name/type + optional right-aligned stats. The
 *  sprite tile carries the same colored gradient as the detail/recipe icons. */
export function EntityCard({ entity }: { entity: EntityCardData }) {
  const color = rarityColor(entity.rarity);
  const gradient = rarityGradient(entity.rarity);
  const typeBits = [entity.typeLabel, entity.rarity].filter(Boolean).join(" · ");

  return (
    <li className="list-none">
      <Link
        href={entity.href}
        className="group grid grid-cols-[64px_1fr_auto] overflow-hidden border border-border bg-card transition-colors hover:border-border-strong hover:bg-card-elevated"
      >
        <span
          className="item-sprite grid size-16 place-items-center border-r border-border"
          style={{ background: gradient ?? NEUTRAL_SLOT }}
        >
          {entity.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entity.icon}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="size-[80%] object-contain [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.45))]"
            />
          ) : entity.categorySlug ? (
            <span
              aria-hidden
              className={gradient ? "text-background" : "text-dim"}
              style={gradient ? undefined : { color: categoryColor(entity.categorySlug) }}
            >
              <CategoryIcon slug={entity.categorySlug} className="size-7" />
            </span>
          ) : (
            <span aria-hidden className={`text-2xl ${gradient ? "text-background" : "text-dim"}`}>
              ▦
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col justify-center gap-1 px-3.5 py-2.5">
          <span className="truncate font-display text-base font-semibold leading-tight text-foreground group-hover:text-primary-hover">
            {entity.name}
            {entity.disabled && (
              <span className="ml-2 align-middle border border-warning/60 px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.05em] text-warning">
                Disabled
              </span>
            )}
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
