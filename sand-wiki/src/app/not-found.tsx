import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
        404
      </span>
      <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-[0.01em] sm:text-4xl">
        Lost in the wastes
      </h1>
      <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
        This page doesn&apos;t exist — it may have been moved or renamed, or the link is wrong.
      </p>
      <Link
        href="/"
        className="mt-1 inline-flex items-center border border-border-strong px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.05em] text-foreground transition-colors hover:border-primary hover:bg-card-elevated hover:text-primary-hover"
      >
        Back to home
      </Link>
    </div>
  );
}
