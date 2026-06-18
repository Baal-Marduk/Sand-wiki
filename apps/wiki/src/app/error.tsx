"use client";

import Link from "next/link";

/** Root error boundary. Renders inside the layout chrome for any error thrown
 *  while rendering a page or running a server action. We show a generic message
 *  (never the raw error, which can leak internals) plus the digest for support. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
        Error
      </span>
      <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-[0.01em] sm:text-4xl">
        Something went wrong
      </h1>
      <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
        An unexpected error occurred. Try again — if it keeps happening, let us know.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center border border-border-strong px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.05em] text-foreground transition-colors hover:border-primary hover:bg-card-elevated hover:text-primary-hover"
        >
          Try again
        </button>
        <Link href="/" className="text-primary underline-offset-2 hover:underline">
          Back to home
        </Link>
      </div>
    </div>
  );
}
