import { itemCategoryCounts, envCategoryCounts, tramplerCategoryCounts, recipeCount } from "@/lib/queries";
import { StatGrid } from "@/components/StatGrid";
import { artBackdrop } from "@/lib/art";

// Faint blueprint grid kept as a top overlay over the art backdrop.
const gridStyle: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
  backgroundSize: "44px 44px",
  WebkitMaskImage: "radial-gradient(circle at 50% 0%, #000 30%, transparent 75%)",
  maskImage: "radial-gradient(circle at 50% 0%, #000 30%, transparent 75%)",
};

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

export const metadata = {
  title: "About",
  description: "About Sand Help — an unofficial, community database for SAND: Raiders of Sophie.",
};

export default async function AboutPage() {
  const [itemCounts, envCounts, tramplerCounts, recipes] = await Promise.all([
    itemCategoryCounts(),
    envCategoryCounts(),
    tramplerCategoryCounts(),
    recipeCount(),
  ]);

  const stats = [
    { label: "Items", value: sum(itemCounts) },
    { label: "Trampler parts", value: sum(tramplerCounts) },
    { label: "Environments", value: sum(envCounts) },
    { label: "Recipes", value: recipes },
  ];

  return (
    <div className="-m-4">
      <section className="relative overflow-hidden border-b border-border px-6 py-16">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...artBackdrop("cargo-port")} alt="" className="size-full object-cover object-[center_42%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/45" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/35 to-transparent" />
          <div className="absolute inset-0 opacity-20" style={gridStyle} />
        </div>
        <div className="relative mx-auto max-w-2xl [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            About
          </span>
          <h1 className="mt-2.5 font-display text-3xl font-bold uppercase leading-none tracking-[0.01em] sm:text-4xl">
            A wiki for the wastes
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            A community-maintained reference for{" "}
            <strong className="text-foreground">SAND: Raiders of Sophie</strong> — every item, trampler
            part, environment and recipe, kept current by players. This is an <strong className="text-foreground">unofficial</strong>{" "}
            site, <strong className="text-foreground">not affiliated with or endorsed by tinyBuild</strong> or
            the game&apos;s developers.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl space-y-8 px-6 py-8">
        <StatGrid cells={stats} />

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Data &amp; license
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Some in-game assets, such as item icons, are used for identification only — we claim no
              ownership of them, and all rights remain with tinyBuild and the game&apos;s developers.
              Items and recipes are extracted from a playtest build; display names are derived from
              internal identifiers, so they may differ from the in-game wording.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
