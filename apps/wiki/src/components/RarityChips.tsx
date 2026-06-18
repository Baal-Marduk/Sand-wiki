"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { rarityColor } from "@/lib/rarity";

/** URL-driven rarity filter rendered as toggle chips. Single-select (maps to the
 *  existing single `?rarity=` param — no domain change): clicking the active chip
 *  clears it, clicking another switches. All other params are preserved; the
 *  server re-renders and does the filtering. */
export function RarityChips({ rarities, current }: { rarities: string[]; current?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(name: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (name === current) next.delete("rarity");
    else next.set("rarity", name);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-0.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Rarity
      </span>
      {rarities.map((name) => {
        const active = name === current;
        const color = rarityColor(name);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={active}
            onClick={() => select(name)}
            className={`inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.02em] transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong text-muted-foreground hover:border-primary hover:text-foreground"
            }`}
          >
            {color && <span aria-hidden className="size-[7px] shrink-0" style={{ background: color }} />}
            {name}
          </button>
        );
      })}
      {current && (
        <button
          type="button"
          onClick={() => select(current)}
          className="ml-auto inline-flex items-center font-display text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground hover:text-primary-hover"
        >
          Clear
        </button>
      )}
    </div>
  );
}
