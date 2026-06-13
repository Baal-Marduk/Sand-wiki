import Link from "next/link";
import { prisma } from "@/lib/db";
import { itemCategoryCounts, envCategoryCounts, tramplerCategoryCounts } from "@/lib/queries";
import { StatGrid } from "@/components/StatGrid";

// Shared with the Home hero — desert glow + faint blueprint grid.
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

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

export default async function AboutPage() {
  const [itemCounts, envCounts, tramplerCounts, recipeCount] = await Promise.all([
    itemCategoryCounts(),
    envCategoryCounts(),
    tramplerCategoryCounts(),
    prisma.recipe.count(),
  ]);

  const stats = [
    { label: "Items", value: sum(itemCounts) },
    { label: "Trampler parts", value: sum(tramplerCounts) },
    { label: "Environments", value: sum(envCounts) },
    { label: "Recipes", value: recipeCount },
  ];

  return (
    <div className="-m-4">
      <section
        className="relative overflow-hidden border-b border-border px-6 py-14"
        style={{ background: heroBackground }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-35" style={gridStyle} />
        <div className="relative mx-auto max-w-2xl">
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
              How to help
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Spot a wrong stat or a missing item? Propose an edit — every change is reviewed by a
              moderator before it goes live, and new editors are credited on their first approval.
            </p>
            <Link
              href="/contribute/new"
              className="mt-3 inline-flex items-center border border-border-strong px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.05em] text-foreground transition-colors hover:border-primary hover:bg-card-elevated hover:text-primary-hover"
            >
              Start contributing
            </Link>
          </div>
          <div>
            <h2 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Data &amp; license
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              No protected game assets (extracted images, sounds, or 3D models) are used. Items and
              recipes are extracted from a playtest build; display names are derived from internal
              identifiers, so they may differ from the in-game wording. The tech tree, delivery
              contracts, and loot tables aren&apos;t present in the current game data. Data is refreshed
              by re-running the extractor after each game patch.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
