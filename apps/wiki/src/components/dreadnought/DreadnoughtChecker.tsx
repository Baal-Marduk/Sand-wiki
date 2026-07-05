"use client";

import * as React from "react";

// Shared hero look with the other pages.
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

type Tone = "good" | "warn" | "bad" | "neutral";
const TONE: Record<Tone, { ring: string; text: string; bg: string }> = {
  good: { ring: "border-emerald-500/50", text: "text-emerald-300", bg: "bg-emerald-500/10" },
  warn: { ring: "border-amber-500/50", text: "text-amber-300", bg: "bg-amber-500/10" },
  bad: { ring: "border-red-500/50", text: "text-red-300", bg: "bg-red-500/10" },
  neutral: { ring: "border-border", text: "text-muted-foreground", bg: "bg-card/60" },
};

const MIN = 6;
const MAX = 12;

export function DreadnoughtChecker() {
  // null = not counted yet. Otherwise the number of non-fort "city" locations on the map.
  const [cities, setCities] = React.useState<number | null>(null);

  const bump = (d: number) =>
    setCities((c) => {
      const next = (c ?? 10) + d;
      return Math.max(MIN, Math.min(MAX, next));
    });

  let verdict: { tone: Tone; title: string; body: string };
  if (cities === null) {
    verdict = {
      tone: "neutral",
      title: "Count your cities to get a read",
      body: "Open your map and count the named town/island locations — everything that isn't a Fort. Set the number above and you'll get your prediction.",
    };
  } else if (cities === 9) {
    verdict = {
      tone: "good",
      title: "Dreadnought is on this map",
      body: "Nine cities means the Dreadnought has taken one of your location slots. This is a Dreadnought run — commit. It stays buried until the end circle, so head for the map centre and scout for the buried battleship (masts poking out of a rock formation). If you want the Admiral's Quarters, start the key chain early.",
    };
  } else if (cities === 10) {
    verdict = {
      tone: "warn",
      title: "No Dreadnought this run",
      body: "Ten cities means all your location slots are normal towns — no Dreadnought event took a slot. The end circle will be an ordinary finale. If you're specifically hunting the Dreadnought, extract early and requeue rather than waste the run.",
    };
  } else {
    verdict = {
      tone: "neutral",
      title: "Unusual count — recount",
      body: `Every map has exactly 14 labeled locations: 4 are always Forts, leaving 10 slots. A normal map shows 10 cities; a Dreadnought map shows 9 (the Dreadnought eats one). ${cities} is off the expected pattern — double-check you counted every non-fort location and didn't include the 4 Forts.`,
    };
  }
  const tone = TONE[verdict.tone];

  const isDread = cities === 9;
  const isClear = cities === 10;

  return (
    <div className="-m-4">
      <section className="relative overflow-hidden border-b border-border px-6 py-14" style={{ background: heroBackground }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-35" style={gridStyle} />
        <div className="relative mx-auto max-w-3xl">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Storm Dive Tool</span>
          <h1 className="mt-2.5 font-display text-3xl font-bold uppercase leading-none tracking-[0.01em] sm:text-4xl">Dreadnought Predictor</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            The Dreadnought stays hidden until the end circle, so you can&apos;t spot it on the map directly. But it takes up a
            location slot when it spawns — so you can read it off the map at load by <strong className="text-foreground">counting your cities</strong>.
            Forts are always 4. A normal map has <strong className="text-foreground">10 cities</strong>; a Dreadnought map has{" "}
            <strong className="text-foreground">9</strong>, because the Dreadnought ate one of the slots.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
        {/* Counter */}
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Cities on your map
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Count the named town/island locations — <strong className="text-foreground">not</strong> the Forts (there are always 4 of those).
          </p>
          <div className="mt-4 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => bump(-1)}
              aria-label="One fewer city"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-2xl text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              −
            </button>
            <div className="flex min-w-[6rem] flex-col items-center">
              <span
                className={`font-display text-6xl font-bold leading-none tabular-nums ${
                  isDread ? "text-emerald-300" : isClear ? "text-amber-300" : cities === null ? "text-muted-foreground/50" : "text-foreground"
                }`}
              >
                {cities ?? "–"}
              </span>
              <span className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">cities</span>
            </div>
            <button
              type="button"
              onClick={() => bump(1)}
              aria-label="One more city"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-2xl text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              +
            </button>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            {[9, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCities(n)}
                data-on={cities === n}
                className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[on=true]:border-primary/50 data-[on=true]:bg-primary/10 data-[on=true]:text-foreground"
              >
                {n === 9 ? "9 (Dreadnought)" : "10 (clear)"}
              </button>
            ))}
            {cities !== null && (
              <button
                type="button"
                onClick={() => setCities(null)}
                className="ml-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:border-border-strong"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Verdict */}
        <div className={`rounded-xl border ${tone.ring} ${tone.bg} p-5`}>
          <div className={`font-display text-[11px] font-semibold uppercase tracking-[0.16em] ${tone.text}`}>Prediction</div>
          <h2 className={`mt-1 font-display text-2xl font-bold ${tone.text}`}>{verdict.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">{verdict.body}</p>
        </div>

        {/* How it works */}
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <h3 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Why it works</h3>
          <p className="text-sm leading-relaxed text-foreground/85">
            Every Storm Dive map generates exactly <strong className="text-foreground">14 labeled locations</strong> — that&apos;s a fixed
            number in the game&apos;s world config. <strong className="text-foreground">4 are always Forts</strong>, leaving 10 slots. On a
            normal map all 10 are cities. When the Dreadnought spawns, it&apos;s an event that occupies one of those slots but isn&apos;t
            shown as a named city — so you see <strong className="text-foreground">9 cities + 4 forts</strong>, and the missing city is the
            Dreadnought.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Confidence: matches every map we&apos;ve checked so far (crowd-confirmed) and lines up with the game&apos;s own location budget.
            Treat it as a strong working rule — a single map that breaks 9-vs-10 would revise it.
          </p>
        </div>

        {/* Confirm in-world */}
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <h3 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Confirm it in-world</h3>
          <ul className="space-y-2 text-sm leading-relaxed text-foreground/85">
            <li>
              <strong className="text-foreground">Scout for it early.</strong> The Dreadnought is a half-buried battleship — look toward the
              map centre for its <strong className="text-foreground">masts and funnels poking above the dunes</strong>, wedged against a large
              rock formation. Binoculars help.
            </li>
            <li>
              <strong className="text-foreground">Watch the map mid-run.</strong> As the storm closes in, a new{" "}
              <strong className="text-foreground">&ldquo;Call for Evacuation&rdquo; extraction point opens at the Dreadnought</strong> — that&apos;s
              your confirmation and your marker to it.
            </li>
          </ul>
        </div>

        {/* Key chain reference */}
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <h3 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Opening it: the key chain
          </h3>
          <p className="text-xs text-muted-foreground">
            Not a predictor — these locations show up on plenty of non-Dreadnought maps too. This is how you unlock the Admiral&apos;s Quarters{" "}
            <em>once you know</em> it&apos;s a Dreadnought run. Each key&apos;s tag names where to use it next.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/85">
            <strong className="text-foreground">Valuable Safe</strong> → Green Key →{" "}
            <strong className="text-foreground">Kaiserplatz</strong> → Blue Key →{" "}
            <strong className="text-foreground">MeereSauge</strong> → Red Key →{" "}
            <strong className="text-foreground">Segen</strong> → White Key →{" "}
            <strong className="text-foreground">Fort Istria</strong> → Black Key →{" "}
            <strong className="text-foreground">the Dreadnought</strong>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Tip: the chain and the Dreadnought are separate rolls, so you can farm keys on a non-Dreadnought run and carry a Black Key into a
            Dreadnought map.
          </p>
        </div>
      </section>
    </div>
  );
}
