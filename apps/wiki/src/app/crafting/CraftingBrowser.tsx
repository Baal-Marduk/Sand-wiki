"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ItemIcon } from "@/components/ItemIcon";
import { categoryLabel } from "@/lib/taxonomy";

export interface CraftLine {
  slug: string;
  name: string;
  icon: string | null;
  amount: number;
}
export interface CraftRecipe {
  id: string;
  category: string;
  outputs: CraftLine[];
  inputs: CraftLine[];
  bench: string;
  benchHref: string | null;
  tier: number | null;
  time: number | null;
}

function catLabel(c: string): string {
  try {
    return categoryLabel(c) || c;
  } catch {
    return c;
  }
}

function Chip({ line }: { line: CraftLine }) {
  return (
    <Link
      href={`/items/${line.slug}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-1.5 py-1 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
    >
      <ItemIcon name={line.name} icon={line.icon} size="sm" decorative />
      <span>{line.name}</span>
      {line.amount > 1 && <span className="text-muted-foreground">×{line.amount}</span>}
    </Link>
  );
}

export function CraftingBrowser({ recipes }: { recipes: CraftRecipe[] }) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (r: CraftRecipe) =>
      !needle ||
      r.outputs.some((o) => o.name.toLowerCase().includes(needle)) ||
      r.inputs.some((i) => i.name.toLowerCase().includes(needle)) ||
      catLabel(r.category).toLowerCase().includes(needle) ||
      r.bench.toLowerCase().includes(needle);

    const byCat = new Map<string, CraftRecipe[]>();
    for (const r of recipes) {
      if (!match(r)) continue;
      if (!byCat.has(r.category)) byCat.set(r.category, []);
      byCat.get(r.category)!.push(r);
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => (a.outputs[0]?.name ?? "").localeCompare(b.outputs[0]?.name ?? ""));
    }
    return [...byCat.entries()].sort((a, b) => catLabel(a[0]).localeCompare(catLabel(b[0])));
  }, [recipes, q]);

  const shown = groups.reduce((n, [, list]) => n + list.length, 0);

  const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const thR = "px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <div className="mt-5">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search items, ingredients, bench…"
        className="w-full max-w-sm rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      <p className="mt-1 text-xs text-muted-foreground">{shown} recipe{shown === 1 ? "" : "s"}</p>

      {groups.map(([cat, list]) => (
        <section key={cat} className="mt-6">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-primary">
            {catLabel(cat)} <span className="text-muted-foreground">· {list.length}</span>
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-card">
                  <th className={th}>Makes</th>
                  <th className={th}>Ingredients</th>
                  <th className={th}>Bench / Location</th>
                  <th className={thR}>Tier</th>
                  <th className={thR}>Time</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-t border-border/40 align-top">
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {r.outputs.map((o) => <Chip key={o.slug} line={o} />)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {r.inputs.length
                          ? r.inputs.map((i) => <Chip key={i.slug} line={i} />)
                          : <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {r.benchHref ? (
                        <Link href={r.benchHref} className="text-foreground hover:text-primary">
                          {r.bench}
                        </Link>
                      ) : (
                        <span className="text-foreground">{r.bench}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{r.tier ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {r.time != null ? `${r.time}s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {shown === 0 && <p className="mt-6 text-sm text-muted-foreground">No recipes match “{q}”.</p>}
    </div>
  );
}
