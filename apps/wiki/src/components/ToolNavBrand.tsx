import Link from "next/link";

// Shared left cluster of the full-bleed tool app bars (Trampler Builder, Tech Tree):
// a back-to-home arrow, the SAND·HELP brand, and the page title. Kept in one place
// so the two tool pages can't drift apart (the builder previously grew a stray brand
// mark the tech tree didn't have). Styled with site tokens via Tailwind utilities so
// it's independent of the per-page scoped CSS (builder.css / tech-tree.css).
export function ToolNavBrand({ title }: { title: string }) {
  return (
    <>
      <Link
        href="/"
        aria-label="Back to home"
        title="Back to home"
        className="grid size-[30px] flex-none place-items-center border border-border-strong text-base text-muted-foreground transition-colors hover:border-primary hover:text-primary-hover focus-visible:border-primary focus-visible:text-primary-hover"
      >
        ←
      </Link>
      <Link
        href="/"
        aria-label="SAND HELP — home"
        className="group font-display text-xl font-bold tracking-wide text-foreground transition-colors hover:text-primary focus-visible:text-primary"
      >
        SAND
        <span
          aria-hidden="true"
          className="mx-0.5 text-primary transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
        >
          ·
        </span>
        HELP
      </Link>
      <span className="border-l border-border pl-4 font-display text-[13px] uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </span>
    </>
  );
}
