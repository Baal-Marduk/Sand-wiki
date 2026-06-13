import Link from "next/link";
import { ITEM_CATEGORIES } from "@/lib/taxonomy";
import { SearchBox } from "@/components/SearchBox";
import { CategoryIcon } from "@/components/CategoryIcon";
import { itemCategoryCounts, envCategoryCounts, tramplerCategoryCounts } from "@/lib/queries";

// Desert-glow + faint blueprint grid. The home hero is the only screen that uses
// the radial glow; every other surface stays flat. Values mirror the approved
// `.superpowers/design` reference (`.hero` / `.hero-grid`).
const heroBackground =
  "radial-gradient(120% 120% at 80% -10%, color-mix(in srgb, var(--secondary) 30%, transparent), transparent 55%), " +
  "linear-gradient(180deg, var(--card) 0%, var(--background) 100%)";
const gridStyle: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
  backgroundSize: "44px 44px",
  WebkitMaskImage: "radial-gradient(circle at 50% 0%, #000 30%, transparent 75%)",
  maskImage: "radial-gradient(circle at 50% 0%, #000 30%, transparent 75%)",
};

interface Entry {
  key: string;
  title: string;
  meta: string;
  icon: string;
  href: string;
}

function EntryCard({ entry }: { entry: Entry }) {
  return (
    <Link
      href={entry.href}
      className="group grid grid-cols-[48px_1fr] items-center gap-3.5 border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-card-elevated"
    >
      <span className="grid size-12 place-items-center border border-border bg-card-elevated text-primary">
        <CategoryIcon slug={entry.icon} className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[17px] font-semibold uppercase tracking-[0.02em] text-foreground group-hover:text-primary-hover">
          {entry.title}
        </span>
        <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{entry.meta}</span>
      </span>
    </Link>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function HomePage() {
  const [itemCounts, envCounts, tramplerCounts] = await Promise.all([
    itemCategoryCounts(),
    envCategoryCounts(),
    tramplerCategoryCounts(),
  ]);

  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const itemTotal = sum(itemCounts);
  const tramplerTotal = sum(tramplerCounts);
  const envTotal = sum(envCounts);

  const itemEntries: Entry[] = ITEM_CATEGORIES.map((c) => ({
    key: `item-${c.slug}`,
    title: c.label,
    icon: c.slug,
    href: `/items?category=${c.slug}`,
    meta: plural(itemCounts[c.slug] ?? 0, "entry", "entries"),
  }));

  const sectionEntries: Entry[] = [
    { key: "tramplers", title: "Tramplers", icon: "chassis", href: "/tramplers", meta: plural(tramplerTotal, "part", "parts") },
    { key: "environment", title: "Environment", icon: "landmarks", href: "/environment", meta: plural(envTotal, "entry", "entries") },
  ];

  const entries = [...itemEntries, ...sectionEntries];

  return (
    <div className="-m-4">
      {/* Hero */}
      <section
        className="relative overflow-hidden border-b border-border px-6 py-16 sm:py-20"
        style={{ background: heroBackground }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-35" style={gridStyle} />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Unofficial database
          </span>
          <h1 className="font-display text-4xl font-bold uppercase leading-[0.98] tracking-[0.02em] sm:text-5xl">
            Everything in the Wastes
          </h1>
          <p className="max-w-md text-[15px] text-muted-foreground">
            {itemTotal} items, {tramplerTotal} trampler parts and {envTotal} environments — crafting trees,
            loot tables and stats for <em>SAND: Raiders of Sophie</em>.
          </p>
          <div className="w-full max-w-md">
            <SearchBox variant="hero" />
          </div>
        </div>
      </section>

      {/* Browse by category */}
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <h2 className="mb-4 font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Browse by category
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <EntryCard key={e.key} entry={e} />
          ))}
        </div>
      </section>
    </div>
  );
}
