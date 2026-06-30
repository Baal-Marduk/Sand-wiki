import Link from "next/link";
import { artBackdrop } from "@/lib/art";

export default function NotFound() {
  return (
    <div className="-m-4">
      <section className="relative flex min-h-[68vh] flex-col items-center justify-center overflow-hidden border-b border-border px-6 py-20 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...artBackdrop("sea-bottom")} alt="" className="size-full object-cover object-[center_60%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/40" />
          <div className="absolute inset-0 bg-background/25" />
        </div>
        <div className="relative flex flex-col items-center gap-4 [text-shadow:0_1px_12px_rgba(0,0,0,0.65)]">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            404
          </span>
          <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-[0.01em] sm:text-4xl">
            Lost in the wastes
          </h1>
          <p className="max-w-md text-[15px] leading-relaxed text-foreground/80">
            This page doesn&apos;t exist — it may have been moved or renamed, or the link is wrong.
          </p>
          <Link
            href="/"
            className="mt-1 inline-flex items-center border border-border-strong bg-background/40 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.05em] text-foreground backdrop-blur-sm transition-colors hover:border-primary hover:bg-card-elevated hover:text-primary-hover"
          >
            Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
