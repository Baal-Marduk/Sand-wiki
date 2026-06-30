import { ITEM_CATEGORIES } from "@/lib/taxonomy";
import { SearchBox } from "@/components/SearchBox";
import { CategoryEntryCard, type CategoryEntry } from "@/components/CategoryEntryCard";
import { itemCategoryCounts, envCategoryCounts, tramplerCategoryCounts, techToolStats } from "@/lib/queries";
import { HomeToolsCallout } from "@/components/HomeToolsCallout";

// Hero art backdrop: a Trampler crossing the dunes at sunset (press-kit key art,
// optimized to webp under /art/optimized). The faint blueprint grid stays as a
// top overlay so the photographic hero still reads as part of the system.
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
      {/* No overflow-hidden on the <section>: the hero-search autocomplete panel is
          absolutely positioned inside and must escape the hero's bottom edge. The
          art backdrop carries its own overflow-hidden so the image stays clipped. */}
      <section className="relative border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src="/art/optimized/hero-towards-island-2400.webp"
            srcSet="/art/optimized/hero-towards-island-960.webp 960w, /art/optimized/hero-towards-island-1600.webp 1600w, /art/optimized/hero-towards-island-2400.webp 2400w"
            sizes="100vw"
            alt=""
            fetchPriority="high"
            className="size-full object-cover object-[66%_center]"
          />
          {/* Scrim — anchor the bottom edge to the page background and darken the
              whole frame enough to keep the cream display type legible over the
              bright sunset sky. */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/35" />
          {/* Warm horizon bloom drifting in from the right, echoing the navbar accent. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 90% at 78% 35%, color-mix(in srgb, var(--secondary) 22%, transparent), transparent 60%)",
            }}
          />
          <div className="absolute inset-0 opacity-[0.18]" style={gridStyle} />
        </div>
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5 px-6 py-24 text-center sm:py-32">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-primary [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
            Unofficial database
          </span>
          <h1 className="font-display text-[2.75rem] font-bold uppercase leading-[0.95] tracking-[0.02em] [text-shadow:0_2px_24px_rgba(0,0,0,0.55)] sm:text-6xl">
            Everything in the Wastes
          </h1>
          <p className="max-w-md text-[15px] text-foreground/80 [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">
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
