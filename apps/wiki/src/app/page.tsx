import { ITEM_CATEGORIES } from "@/lib/taxonomy";
import { SearchBox } from "@/components/SearchBox";
import { CategoryEntryCard, type CategoryEntry } from "@/components/CategoryEntryCard";
import { itemCategoryCounts, envCategoryCounts, tramplerCategoryCounts, techToolStats } from "@/lib/queries";
import { HomeToolsCallout } from "@/components/HomeToolsCallout";

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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function HomePage() {
  const [itemCounts, envCounts, tramplerCounts, techStats] = await Promise.all([
    itemCategoryCounts(),
    envCategoryCounts(),
    tramplerCategoryCounts(),
    techToolStats(),
  ]);

  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const itemTotal = sum(itemCounts);
  const tramplerTotal = sum(tramplerCounts);
  const envTotal = sum(envCounts);

  const itemEntries: CategoryEntry[] = ITEM_CATEGORIES.map((c) => ({
    title: c.label,
    icon: c.slug,
    href: `/items?category=${c.slug}`,
    meta: plural(itemCounts[c.slug] ?? 0, "entry", "entries"),
  }));

  const sectionEntries: CategoryEntry[] = [
    { title: "Tramplers", icon: "chassis", href: "/tramplers", meta: plural(tramplerTotal, "part", "parts") },
    { title: "Environment", icon: "landmarks", href: "/environment", meta: plural(envTotal, "entry", "entries") },
  ];

  const entries = [...itemEntries, ...sectionEntries];

  return (
    <div className="-m-4">
      {/* Hero */}
      {/* No overflow-hidden: the hero-search autocomplete panel is absolutely
          positioned inside here and must escape the hero's bottom edge. The grid
          overlay is inset-0 so it stays bounded without clipping. */}
      <section
        className="relative border-b border-border px-6 py-16 sm:py-20"
        style={{ background: heroBackground }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden opacity-35" style={gridStyle} />
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

      {/* Plan your run — interactive-tool CTAs (tech tree + trampler builder) */}
      <HomeToolsCallout
        techNodes={techStats.nodes}
        factions={techStats.factions}
        tramplerParts={tramplerTotal}
      />

      {/* Browse by category */}
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <h2 className="mb-4 font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Browse by category
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <CategoryEntryCard key={e.href} entry={e} />
          ))}
        </div>
      </section>
    </div>
  );
}
